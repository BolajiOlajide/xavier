import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { exec, spawn } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { v4 as uuidv4 } from "uuid";

const execAsync = promisify(exec);

// Base directory for threads in /tmp
// We use an environment variable or default to /tmp/xavier-threads
const BASE_DIR = process.env.THREAD_WORKDIR || path.join(os.tmpdir(), "xavier-threads");
const THREAD_TTL_MS = 60 * 60 * 1000; // 1 hour

interface ThreadMeta {
  threadId: string;
  repoUrl: string;
  createdAt: string;
  lastAccessAt: string;
  step: number;
}

// Helper to ensure base dir exists
async function ensureBaseDir() {
  try {
    await fs.mkdir(BASE_DIR, { recursive: true });
  } catch (e) {
    // Ignore if exists
  }
}

// Cleanup old threads
async function cleanupOldThreads() {
  try {
    await ensureBaseDir();
    const entries = await fs.readdir(BASE_DIR, { withFileTypes: true });
    const now = Date.now();

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const threadId = entry.name;
      const threadDir = path.join(BASE_DIR, threadId);
      const metaPath = path.join(threadDir, "meta.json");

      try {
        const metaContent = await fs.readFile(metaPath, "utf8");
        const meta = JSON.parse(metaContent) as ThreadMeta;
        const lastAccess = new Date(meta.lastAccessAt).getTime();

        if (now - lastAccess > THREAD_TTL_MS) {
            console.log(`Cleaning up expired thread: ${threadId}`);
            await fs.rm(threadDir, { recursive: true, force: true });
        }
      } catch (e) {
        // Corrupted or missing meta, maybe safe to delete or ignore. 
        // For now, let's be conservative and ignore, or aggressive and delete.
        // Let's check if the directory is older than TTL based on fs stats as a fallback.
        const stats = await fs.stat(threadDir);
        if (now - stats.mtimeMs > THREAD_TTL_MS) {
            console.log(`Cleaning up stale thread dir: ${threadId}`);
            await fs.rm(threadDir, { recursive: true, force: true });
        }
      }
    }
  } catch (e) {
    console.error("Cleanup error:", e);
  }
}

export const POST: RequestHandler = async ({ request }) => {
    // Run cleanup occasionally (fire and forget)
    cleanupOldThreads().catch(console.error);

	const { repo, prompt, threadId: requestedThreadId } = await request.json();

    const stream = new ReadableStream({
        async start(controller) {
            const encoder = new TextEncoder();
            const send = (data: unknown) => controller.enqueue(encoder.encode(JSON.stringify(data) + '\n'));

            if (!prompt) {
                send({ type: 'error', error: 'Prompt is required' });
                controller.close();
                return;
            }

            let threadId = requestedThreadId;
            let threadDir: string;
            let repoDir: string;
            let step = 1;

            try {
                await ensureBaseDir();

                if (threadId) {
                    // Existing thread logic
                    send({ type: 'status', msg: 'Loading thread context...' });

                    // Validate ID format
                    if (!/^[0-9a-fA-F-]{36}$/.test(threadId)) {
                         throw new Error("Invalid thread ID");
                    }

                    threadDir = path.join(BASE_DIR, threadId);
                    repoDir = path.join(threadDir, "repo");
                    const metaPath = path.join(threadDir, "meta.json");

                    try {
                        await fs.access(metaPath);
                    } catch {
                         throw new Error("Thread expired or not found");
                    }

                    // Load meta
                    const metaContent = await fs.readFile(metaPath, "utf8");
                    const meta = JSON.parse(metaContent) as ThreadMeta;
                    
                    const incomingRepoUrl = repo ? `https://${repo}` : null;
                    if (incomingRepoUrl && meta.repoUrl !== incomingRepoUrl) {
                         throw new Error("Thread is bound to a different repository");
                    }

                    step = meta.step + 1;
                    meta.step = step;
                    meta.lastAccessAt = new Date().toISOString();
                    await fs.writeFile(metaPath, JSON.stringify(meta, null, 2));

                } else {
                    // New thread logic
                    if (!repo) {
                        throw new Error("Repo is required for new thread");
                    }

                    send({ type: 'status', msg: `Initializing workspace for ${repo}...` });

                    threadId = uuidv4();
                    threadDir = path.join(BASE_DIR, threadId);
                    repoDir = path.join(threadDir, "repo");

                    await fs.mkdir(threadDir, { recursive: true });
                    await fs.mkdir(repoDir, { recursive: true });

                    const repoUrl = `https://${repo}`;
                    
                    send({ type: 'status', msg: 'Cloning repository...' });
                    // Clone
                    console.log(`Cloning ${repoUrl} into ${repoDir}...`);
                    await execAsync(`git clone --depth 1 ${repoUrl} .`, { cwd: repoDir });

                    // Save meta
                    const meta: ThreadMeta = {
                        threadId,
                        repoUrl,
                        createdAt: new Date().toISOString(),
                        lastAccessAt: new Date().toISOString(),
                        step
                    };
                    await fs.writeFile(path.join(threadDir, "meta.json"), JSON.stringify(meta, null, 2));
                }

                // Run amp
                const ampPath = `${os.homedir()}/.local/bin/amp`;
                send({ type: 'status', msg: 'Running amp to apply changes...' });
                console.log(`Running amp in ${repoDir}... (Step ${step})`);
                
                await new Promise<void>((resolve, reject) => {
                    const child = spawn(ampPath, ['-x', prompt, '--dangerously-allow-all'], { 
                        cwd: repoDir,
                        stdio: 'inherit' 
                    });
                    
                    child.on('close', (code: number | null) => {
                        if (code === 0) resolve();
                        else reject(new Error(`amp exited with code ${code}`));
                    });
                    
                    child.on('error', (err: Error) => reject(err));
                });

                // Generate diff
                send({ type: 'status', msg: 'Generating diff...' });
                console.log('Generating diff...');
                
                await execAsync('git add -A', { cwd: repoDir });
                const { stdout: diffOutput } = await execAsync('git diff --cached', { cwd: repoDir });

                send({ 
                    type: 'result',
                    diff: diffOutput,
                    threadId,
                    step
                });

            } catch (error) {
                console.error('Error processing request:', error);
                send({ 
                    type: 'error',
                    error: (error as Error).message 
                });
            } finally {
                controller.close();
            }
        }
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'application/x-ndjson',
            'X-Content-Type-Options': 'nosniff'
        }
    });
};
