# Xavier

Xavier is an agentic diff generator that allows you to interactively apply changes to repositories using natural language prompts. It provides a threaded, chat-like interface where you can iterate on changes and visualize the resulting diffs in real-time.

## Features

*   **Agentic Workflow**: Describe changes in plain English, and Xavier applies them to the repository.
*   **Threaded Context**: Supports iterative sessions where changes stack on top of each other (e.g., "Create a file", then "Add a function to it").
*   **Real-time Diffs**: Visualizes changes using a clean, color-coded diff viewer.
*   **Deleted File Support**: Clearly indicates when files are removed.
*   **Streaming Status**: Shows real-time progress of the agent's actions (cloning, applying, generating diffs).
*   **Modern UI**: Built with SvelteKit, Tailwind CSS, and Shadcn-Svelte for a polished experience.

## Tech Stack

*   **Framework**: [SvelteKit](https://kit.svelte.dev/) (Svelte 5)
*   **Styling**: [Tailwind CSS](https://tailwindcss.com/)
*   **Components**: [Shadcn-Svelte](https://www.shadcn-svelte.com/)
*   **Diff Rendering**: [diff2html](https://diff2html.xyz/)
*   **Backend Logic**: Node.js with `git` and `amp` integration.

## Prerequisites

*   Node.js (v20+ recommended)
*   `pnpm`
*   `git`
*   `amp` CLI tool installed at `~/.local/bin/amp` (or configured path).
    *   *Note: `amp` is the underlying agent engine Xavier uses to execute prompts.*

## Getting Started

1.  **Clone the repository:**

    ```bash
    git clone https://github.com/BolajiOlajide/xavier.git
    cd xavier
    ```

2.  **Install dependencies:**

    ```bash
    pnpm install
    ```

3.  **Start the development server:**

    ```bash
    pnpm dev
    ```

4.  **Open the app:**
    Navigate to `http://localhost:5173` in your browser.

## Usage

1.  **Select a Repository**: Choose a target repository from the dropdown list.
2.  **Enter Instructions**: Describe the change you want to make (e.g., "Update the README to include installation steps").
3.  **Generate Diff**: Click the button to let the agent work.
4.  **Iterate**: Add follow-up instructions in the same thread to refine the changes.
5.  **New Thread**: Click "New Thread" to start fresh with a clean slate.

## Project Structure

*   `src/routes/+page.svelte`: Main UI component handling the chat interface and history.
*   `src/routes/api/diff/+server.ts`: Backend API that manages temporary git clones, executes `amp`, and streams results.
*   `src/lib/components/DiffViewer.svelte`: Custom component for rendering git diffs.
*   `src/lib/components/ui`: Reusable Shadcn UI components.

## License

MIT
