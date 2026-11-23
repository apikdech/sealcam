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
  const ink = $derived(
    { ok: 'var(--z-line)', warn: 'var(--z-amber)', bad: 'var(--z-void)', unknown: 'var(--z-muted)' }[
      words.level
    ],
  );
  const wordInk = $derived(
    { ok: '', warn: 'text-amber', bad: 'text-void', unknown: 'text-muted' }[words.level],
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
    aria-label={words.short}
    title={words.level === 'ok' ? words.details[0] : undefined}
    class="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 px-3 text-sm text-ink"
    onclick={() => (open = !open)}
  >
    <span aria-hidden="true" class="inline-block h-2.5 w-2.5 shrink-0 rounded-full {dot}"
      style="box-shadow: 0 0 0 3px color-mix(in srgb, {ink} 25%, transparent)"
    ></span>
    {#if words.level !== 'ok'}<span class={wordInk}>{words.short}</span>{/if}
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
