<script lang="ts">
  import { html, parse } from "diff2html";
  import { LineType } from "diff2html/lib/types";

  export let diff: string;

  function processDiff(diff: string) {
      if (!diff) return "";
      
      const files = parse(diff);
      
      // Force visible block for empty deletions
      for (const file of files) {
          const hasNoBlocks = !file.blocks || file.blocks.length === 0;
          const hasNoLineChanges = (file.addedLines ?? 0) + (file.deletedLines ?? 0) === 0;
          
          if (file.isDeleted && hasNoBlocks && hasNoLineChanges) {
              file.blocks = [{
                  header: '@@ -0,0 +0,0 @@',
                  oldStartLine: 0,
                  newStartLine: 0,
                  lines: [{
                      content: '- (file deleted)',
                      type: LineType.DELETE,
                      oldNumber: 1,
                      newNumber: undefined
                  }]
              }];
              file.deletedLines = 1;
          }
      }
      
      return html(files, {
          drawFileList: true,
          matching: "lines",
          outputFormat: "line-by-line",
          renderNothingWhenEmpty: false
      });
  }

  $: diffHtml = processDiff(diff);
</script>

{#if diff}
  <div class="diff2html-container text-sm [&_.d2h-tag.d2h-deleted]:bg-red-100 [&_.d2h-tag.d2h-deleted]:text-red-700 [&_.d2h-file-header]:!bg-zinc-50/50 [&_.d2h-file-wrapper]:!border-zinc-200 [&_.d2h-file-name]:!font-mono [&_.d2h-file-name]:!text-sm max-w-full overflow-x-hidden">
    {@html diffHtml}
  </div>
{/if}
