<script lang="ts">
  import { onMount } from 'svelte';

  interface Props {
    filename: string;
    busy: boolean;
    /** The file was written; shown briefly before the dialog closes. */
    saved?: boolean;
    /** Plaintext bytes saved so far. */
    bytes: number;
    error: string;
    onConfirm: () => void;
    onCancel: () => void;
  }

  let { filename, busy, saved = false, bytes, error, onConfirm, onCancel }: Props = $props();

  let dialog: HTMLDivElement;
  onMount(() => dialog.focus());

  /** Keeps Tab inside the dialog: it wraps between the enabled buttons, and stays on the dialog when there are none. */
  function trapTab(e: KeyboardEvent): void {
    const items = [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled)')];
    const first = items[0];
    const last = items[items.length - 1];
    const at = document.activeElement;
    if (!first || !last) {
      e.preventDefault();
      dialog.focus();
    } else if (e.shiftKey && (at === first || at === dialog)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (at === last || at === dialog)) {
      e.preventDefault();
      first.focus();
    }
  }

  const mib = (n: number): string => `${(n / (1 << 20)).toFixed(1)} MiB`;
</script>

<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
  <div
    bind:this={dialog}
    role="dialog"
    aria-modal="true"
    aria-labelledby="export-title"
    tabindex="-1"
    onkeydown={(e) => {
      if (e.key === 'Tab') trapTab(e);
      if (e.key === 'Escape' && !busy) {
        e.stopPropagation();
        onCancel();
      }
    }}
    class="w-full max-w-md rounded-lg border border-rule bg-plate text-ink p-5 text-sm"
  >
    <h2 id="export-title" class="mb-2 text-base font-semibold">Export recording</h2>
    <p class="mb-2">This saves an <strong>unencrypted</strong> copy on this device.</p>
    <p class="mb-3 break-all font-mono text-xs text-muted">{filename}</p>
    {#if busy}
      <p role="status" class="mb-3 text-ink">Saving… {bytes > 0 ? mib(bytes) : ''}</p>
    {:else if bytes > 0 && !error}
      <p class="mb-3 text-muted">{mib(bytes)}</p>
    {/if}
    {#if saved}
      <p role="status" class="mb-3 text-foil">Saved.</p>
    {/if}
    {#if error}
      <p role="alert" class="mb-3 text-void">{error}</p>
    {/if}
    <div class="flex justify-end gap-2">
      <button type="button" class="rounded border border-rule px-3 py-1.5 max-md:min-h-11" disabled={busy} onclick={onCancel}>Cancel</button>
      <button type="button" class="rounded border border-foil bg-ground px-3 py-1.5 max-md:min-h-11 text-foil disabled:opacity-50" disabled={busy || saved} onclick={onConfirm}>
        {busy ? 'Saving…' : 'Save'}
      </button>
    </div>
  </div>
</div>
