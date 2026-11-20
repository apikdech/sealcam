<script lang="ts">
  interface Props {
    kind: 'key' | 'failed';
    /** Shown for a failed load. */
    text: string;
    onRetry: () => void;
  }

  let { kind, text, onRetry }: Props = $props();
</script>

<div role="alert" class="px-4 py-3 text-sm text-ink max-md:px-0">
  {#if kind === 'key'}
    <p>Your key is locked.</p>
    <a href="#/key" class="inline-flex min-h-11 items-center font-semibold text-line underline">Unlock</a>
  {:else}
    <p>{text}</p>
    <button type="button" class="min-h-11 rounded-[10px] border border-rule px-4 font-semibold text-ink" onclick={onRetry}>Try again</button>
  {/if}
</div>
