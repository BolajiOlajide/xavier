<script lang="ts">
	import { fade, fly, slide } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import * as Select from '$lib/components/ui/select';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import DiffViewer from '$lib/components/DiffViewer.svelte';
	import { Label } from '$lib/components/ui/label';
	import { Loader2, Terminal, Sparkles, GitGraph, ArrowRight, ChevronDown, ChevronRight } from 'lucide-svelte';

	const repos = [
		'github.com/sourcegraph-testing/markdowns',
		'github.com/sourcegraph-testing/tidb',
		'github.com/sourcegraph-testing/zap',
		'github.com/sourcegraph-testing/titan'
	];

	let repo = $state(repos[0]);
	let prompt = $state('');
	let diff = $state('');
	let isLoading = $state(false);
	let error: string | null = $state(null);
	let generated = $state(false);
    let threadId: string | null = $state(null);
    let history = $state<{ prompt: string; diff: string; step: number; expanded: boolean }[]>([]);
    let statusMessage = $state('');

    function resetThread() {
        threadId = null;
        history = [];
        diff = '';
        prompt = '';
        generated = false;
        error = null;
        statusMessage = '';
    }

	let scrollViewport: HTMLElement | null = $state(null);

	async function generateDiff() {
		if (!prompt.trim()) return;
		isLoading = true;
		error = null;
        statusMessage = 'Initializing...';
        
        // Collapse all existing turns immediately
        for (const turn of history) {
            turn.expanded = false;
        }
        // Trigger reactivity for the array
        history = history;
        
        // Scroll to top
        if (scrollViewport) {
            scrollViewport.scrollTo({ top: 0, behavior: 'smooth' });
        }
        
		try {
            const currentPrompt = prompt;
            // Clear prompt immediately for better UX or keep it? Let's keep it until success?
            // No, clearing it feels like "sent".
            prompt = '';
            
			const res = await fetch('/api/diff', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ repo, prompt: currentPrompt, threadId })
			});

            if (res.status === 410) {
                throw new Error("Thread expired. Please start a new thread.");
            }

			if (!res.ok) {
                // Fallback for non-stream errors (e.g. 404, 500 from infrastructure)
				const data = await res.json().catch(() => ({}));
				throw new Error(data.error || data.stderr || `Request failed: ${res.status}`);
			}

            // Read the stream
            const reader = res.body?.getReader();
            if (!reader) throw new Error("Response body is not readable");

            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || ''; // Keep incomplete line
                
                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const msg = JSON.parse(line);
                        if (msg.type === 'status') {
                            statusMessage = msg.msg;
                        } else if (msg.type === 'result') {
                            diff = msg.diff ?? '';
                            threadId = msg.threadId;
                            generated = true;
                            
                            // Collapse all previous turns (again, just to be safe/ensure state)
                            for (const turn of history) {
                                turn.expanded = false;
                            }

                            history.unshift({
                                prompt: currentPrompt,
                                diff: diff,
                                step: msg.step,
                                expanded: true
                            });
                        } else if (msg.type === 'error') {
                            throw new Error(msg.error);
                        }
                    } catch (e) {
                        console.error("Error parsing stream message:", line, e);
                    }
                }
            }

		} catch (e) {
			error = (e as Error).message;
            // Restore prompt on error so user doesn't lose it
            // prompt = currentPrompt; // Need to capture it if we want to restore
		} finally {
			isLoading = false;
            statusMessage = '';
		}
	}
</script>

<div
	class="min-h-screen bg-zinc-50/50 dark:bg-zinc-950 p-4 md:p-8 font-sans text-zinc-900 dark:text-zinc-50 selection:bg-zinc-900 selection:text-zinc-50"
>
	<div class="mx-auto max-w-7xl h-full flex flex-col gap-6">
		<!-- Header -->
		<header class="flex items-center justify-between" in:fly={{ y: -20, duration: 600 }}>
			<div class="flex items-center gap-3">
				<div
					class="p-2.5 bg-zinc-900 text-white rounded-xl shadow-lg shadow-zinc-900/20 ring-1 ring-zinc-900/10"
				>
					<Terminal class="w-5 h-5" />
				</div>
				<div>
					<h1 class="text-xl font-semibold tracking-tight text-zinc-900">Xavier</h1>
					<p class="text-xs text-zinc-500 font-medium uppercase tracking-wider">Agentic Diff Generator</p>
				</div>
			</div>
            {#if threadId}
                <Button variant="outline" size="sm" onclick={resetThread} class="gap-2">
                    <Sparkles class="w-4 h-4" />
                    New Thread
                </Button>
            {/if}
		</header>

		<main class="flex-1 grid gap-6 lg:grid-cols-[420px_1fr] min-h-0 h-[calc(100vh-140px)]">
			<!-- Left Pane: Controls -->
			<div
				class="flex flex-col gap-6 h-fit min-h-0"
				in:fly={{ x: -20, duration: 600, delay: 150, easing: cubicOut }}
			>
				<Card.Root
					class="flex flex-col h-fit border-zinc-200/60 dark:border-zinc-800 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-shadow duration-500"
				>
					<Card.Header class="pb-4 shrink-0">
						<Card.Title class="text-lg font-medium">Configuration</Card.Title>
						<Card.Description>Select a target repository and describe your changes.</Card.Description>
					</Card.Header>

					<Card.Content class="flex flex-col gap-6 shrink-0">
						<div class="space-y-2.5 group shrink-0">
							<Label class="text-xs font-semibold text-zinc-500 uppercase tracking-wider ml-1"
								>Repository</Label
							>
							<Select.Root type="single" bind:value={repo} disabled={!!threadId}>
								<Select.Trigger
									class="w-full bg-zinc-50/50 border-zinc-200 transition-all duration-200 focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-900"
								>
									<div class="flex items-center gap-2 text-zinc-700">
										<GitGraph class="w-4 h-4 text-zinc-400" />
										<span class="truncate">{repo}</span>
									</div>
								</Select.Trigger>
								<Select.Content>
									{#each repos as r}
										<Select.Item value={r} class="cursor-pointer">{r}</Select.Item>
									{/each}
								</Select.Content>
							</Select.Root>
						</div>

						<div class="space-y-2.5 flex flex-col group">
							<Label
								for="prompt"
								class="text-xs font-semibold text-zinc-500 uppercase tracking-wider ml-1"
								>Instructions</Label
							>
							<div class="relative">
								<Textarea
									id="prompt"
									class="min-h-[200px] resize-y font-mono text-sm leading-relaxed bg-zinc-50/50 border-zinc-200 transition-all duration-200 focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-900 p-4"
									bind:value={prompt}
									placeholder={threadId ? "Describe further changes..." : "e.g., Add a new function to calculate fibonacci numbers..."}
								/>
								<div class="absolute bottom-3 right-3 pointer-events-none">
									<Sparkles
										class="w-4 h-4 text-zinc-300 transition-colors duration-300 {prompt.length > 0
											? 'text-zinc-900'
											: ''}"
									/>
								</div>
							</div>
						</div>

						<div class="pt-2 shrink-0">
							<Button
								onclick={generateDiff}
								disabled={isLoading || !prompt.trim()}
								class="w-full h-12 text-base font-medium shadow-lg shadow-zinc-900/20 transition-all duration-300 hover:translate-y-[-2px] active:translate-y-[0px]"
							>
								{#if isLoading}
									<Loader2 class="w-5 h-5 mr-2 animate-spin" />
									Generating Changes...
								{:else}
									Generate Diff
									<ArrowRight class="w-5 h-5 ml-2 opacity-60" />
								{/if}
							</Button>
							{#if error}
								<div
									transition:slide
									class="mt-4 p-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg flex items-start gap-2"
								>
									<div class="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 shrink-0"></div>
									{error}
								</div>
							{/if}
						</div>
					</Card.Content>
				</Card.Root>
			</div>

			<!-- Right Pane: Output -->
			<div
				class="h-full flex flex-col"
				in:fly={{ x: 20, duration: 600, delay: 300, easing: cubicOut }}
			>
				<Card.Root
					class="h-full flex flex-col border-zinc-200/60 dark:border-zinc-800 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden bg-white"
				>
					<div class="px-6 py-4 border-b border-zinc-100 bg-zinc-50/30 flex items-center justify-between">
						<div class="flex items-center gap-2">
							<div class="w-2.5 h-2.5 rounded-full bg-red-400/80"></div>
							<div class="w-2.5 h-2.5 rounded-full bg-amber-400/80"></div>
							<div class="w-2.5 h-2.5 rounded-full bg-emerald-400/80"></div>
						</div>
						<div class="text-xs font-mono text-zinc-400">diff.patch</div>
					</div>
					
					<Card.Content class="flex-1 flex flex-col min-h-0 p-0 relative">
						<ScrollArea class="flex-1 bg-white" bind:viewport={scrollViewport}>
							<div class="p-0 min-h-full flex flex-col">
								{#if isLoading}
									<div
										class="relative flex flex-col items-center justify-center bg-white p-12 border-b border-zinc-100"
										in:fade
									>
										<div class="flex flex-col items-center gap-4">
											<div class="relative">
												<div class="absolute inset-0 bg-zinc-200 rounded-full animate-ping opacity-75"></div>
												<div class="relative bg-white p-4 rounded-full border border-zinc-100 shadow-xl">
													<Loader2 class="w-8 h-8 animate-spin text-zinc-900" />
												</div>
											</div>
											<p class="text-sm font-medium text-zinc-500 animate-pulse">{statusMessage || 'Applying changes...'}</p>
										</div>
									</div>
								{/if}

                                {#each history as turn, i (turn.step)}
                                    <div class="border-b border-zinc-100 last:border-0" in:slide={{ duration: 300, easing: cubicOut }}>
                                        <button 
                                             class="w-full px-6 py-4 bg-zinc-50/50 border-b border-zinc-100/50 hover:bg-zinc-50 transition-colors text-left flex items-start gap-3 group"
                                             onclick={() => turn.expanded = !turn.expanded}
                                         >
                                             <div class="mt-1 w-6 h-6 rounded-full bg-zinc-200 flex items-center justify-center text-[10px] font-bold text-zinc-500 shrink-0 group-hover:bg-zinc-300 transition-colors">
                                                 {turn.step}
                                             </div>
                                             <div class="flex-1 min-w-0">
                                                 <p class="text-sm text-zinc-900 font-medium leading-relaxed whitespace-pre-wrap line-clamp-2">{turn.prompt}</p>
                                             </div>
                                             <div class="mt-1 text-zinc-400 group-hover:text-zinc-600 transition-colors">
                                                 {#if turn.expanded}
                                                     <ChevronDown class="w-4 h-4" />
                                                 {:else}
                                                     <ChevronRight class="w-4 h-4" />
                                                 {/if}
                                             </div>
                                        </button>
                                        {#if turn.expanded}
                                            <div class="p-6 max-w-full overflow-hidden" transition:slide>
                                                <DiffViewer diff={turn.diff} />
                                            </div>
                                        {/if}
                                    </div>
                                {/each}

                                <!-- Spacer for scrolling -->
                                <div class="h-8"></div>
							</div>
						</ScrollArea>
						
						{#if history.length === 0 && !isLoading}
							<div class="absolute inset-0 flex flex-col items-center justify-center text-zinc-400 p-8 text-center">
								<div class="w-16 h-16 mb-4 rounded-2xl bg-zinc-50 flex items-center justify-center border border-zinc-100">
									<Sparkles class="w-8 h-8 opacity-20" />
								</div>
								<h3 class="text-sm font-medium text-zinc-900 mb-1">Ready to Generate</h3>
								<p class="text-xs text-zinc-500 max-w-[200px]">Enter instructions on the left to see the proposed changes here.</p>
							</div>
						{/if}
					</Card.Content>
				</Card.Root>
			</div>
		</main>
	</div>
</div>
