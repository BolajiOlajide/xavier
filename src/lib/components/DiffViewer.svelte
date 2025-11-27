<script lang="ts">
  import { html } from "diff2html";

  export let diff: string;

  $: diffHtml = diff
    ? html(diff, {
        drawFileList: true,
        matching: "lines",
        outputFormat: "line-by-line"
      })
    : "";
</script>

{#if diff}
  <div class="diff2html-container text-sm [&_.d2h-tag.d2h-deleted]:bg-red-100 [&_.d2h-tag.d2h-deleted]:text-red-700 [&_.d2h-file-header]:!bg-zinc-50/50 [&_.d2h-file-wrapper]:!border-zinc-200 [&_.d2h-file-name]:!font-mono [&_.d2h-file-name]:!text-sm max-w-full overflow-x-hidden">
    {@html diffHtml}
  </div>
{/if}
