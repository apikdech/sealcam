<script lang="ts">
  import { recorderWords } from '../relayStatus';
  import type { Status } from '../../worker/schemas';

  interface Props {
    /** The last `/api/v1/status` answer; null when it could not be read. */
    status: Status | null;
    nowMs: number;
    /** Display zone for the times in the details. */
    zone: string;
  }

  let { status, nowMs, zone }: Props = $props();

  const uid = $props.id();
  const regionId = `status-details-${uid}`;
  let open = $state(false);

  const words = $derived(recorderWords(status, nowMs, zone));
  const dot = $derived(
    { ok: 'bg-line', warn: 'bg-amber', bad: 'bg-void', unknown: 'bg-muted' }[words.level],
  );

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') open = false;
  }
</script>

<div class="relative inline-block" {onkeydown} role="presentation">
  <button
    type="button"
    data-testid="relay-status"
    data-level={words.level}
    aria-expanded={open}
    aria-controls={regionId}
    class="inline-flex min-h-11 items-center gap-2 px-3 text-sm text-ink"
    onclick={() => (open = !open)}
  >
    <span aria-hidden="true" class="inline-block h-2.5 w-2.5 shrink-0 rounded-full {dot}"></span>
    <span>{words.short}</span>
  </button>
  <div
    id={regionId}
    hidden={!open}
    class="absolute right-0 top-full z-10 w-72 max-w-[90vw] border border-rule bg-plate p-3 text-sm text-ink"
  >
    {#if open}
      <ul class="space-y-1">
        {#each words.details as d, i (i)}
          <li class="num">{d}</li>
        {/each}
      </ul>
    {/if}
  </div>
</div>
