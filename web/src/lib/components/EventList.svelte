<script lang="ts" module>
  export interface EventRow {
    id: string;
    cameraName: string;
    startMs: number;
    /** null while unknown (an interrupted clip). */
    durationMs: number | null;
    /** Distinct trigger types in firing order. */
    triggers: string[];
    status: 'complete' | 'incomplete';
  }

  export function formatDuration(ms: number | null): string {
    if (ms === null) return '—';
    const total = Math.round(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const ss = String(s).padStart(2, '0');
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
  }
</script>

<script lang="ts">
  import { formatClock } from '../timeline/timezone';
  import { triggerStyle } from '../timeline/model';
  import type { IntegrityState } from '../player/engine';
  import Seal from '../seal/Seal.svelte';
  import type { SealState } from '../seal/rosette';

  interface Props {
    /** Newest first. */
    clips: readonly EventRow[];
    selectedId: string | null;
    zone: string;
    /** What is known about each clip's integrity; absent means not checked yet. */
    integrity: Readonly<Record<string, IntegrityState | undefined>>;
    onSelect: (clipId: string) => void;
    pageSize?: number;
  }

  let { clips, selectedId, zone, integrity, onSelect, pageSize = 50 }: Props = $props();

  let extra = $state(0);
  let list: HTMLDivElement;

  const selectedIndex = $derived(selectedId === null ? -1 : clips.findIndex((c) => c.id === selectedId));
  // A selection made elsewhere (J/K, the timeline) is always rendered.
  const shown = $derived(Math.min(clips.length, Math.max(pageSize + extra, selectedIndex + 1)));
  const visible = $derived(clips.slice(0, shown));
  const stop = $derived(selectedIndex >= 0 && selectedIndex < shown ? selectedIndex : 0);

  function sealState(c: EventRow): SealState {
    return integrity[c.id] ?? (c.status === 'incomplete' ? 'incomplete' : 'unchecked');
  }

  function focusRow(i: number) {
    list.querySelectorAll<HTMLElement>('[role="option"]')[i]?.focus();
  }

  function onKey(e: KeyboardEvent, i: number, id: string) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(id);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      focusRow(Math.min(shown - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1))));
    } else if (e.key === 'Home') {
      e.preventDefault();
      focusRow(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      focusRow(shown - 1);
    }
  }

  // Bring a selection made elsewhere into view.
  $effect(() => {
    if (selectedId === null || !list) return;
    list.querySelectorAll<HTMLElement>('[role="option"]')[selectedIndex]?.scrollIntoView?.({ block: 'nearest' });
  });
</script>

<div bind:this={list} role="listbox" aria-label="Recordings" tabindex="-1">
  {#each visible as c, i (c.id)}
      {@const sel = c.id === selectedId}
      <div
        role="option"
        aria-selected={sel}
        aria-posinset={i + 1}
        aria-setsize={clips.length}
        data-clip={c.id}
        tabindex={i === stop ? 0 : -1}
        onclick={() => onSelect(c.id)}
        onkeydown={(e) => onKey(e, i, c.id)}
        class="grid min-h-16 cursor-pointer grid-cols-[auto_1fr_auto] items-center gap-3 border-t border-rule px-4 outline-offset-[-1px] outline-foil first:border-t-0 focus-visible:outline-2 {sel
          ? 'bg-plate outline outline-1'
          : 'hover:bg-plate'}"
      >
        <span class="num text-[20px] font-semibold text-ink">{formatClock(c.startMs, zone)}</span>
        <span class="flex min-w-0 items-center gap-1.5 text-sm text-muted">
          {#each c.triggers as t (t)}
            {@const st = triggerStyle(t)}
            <span
              role="img"
              aria-label={st.label}
              title={st.label}
              style:background={st.color}
              class="inline-block min-w-5 rounded px-1 text-center text-xs font-bold text-on-trigger">{st.glyph}</span
            >
          {/each}
          <span class="truncate"><b class="font-semibold text-ink">{c.cameraName}</b> · <span class="num">{formatDuration(c.durationMs)}</span></span>
        </span>
        <Seal seed={c.id} state={sealState(c)} size={38} />
    </div>
  {/each}
</div>
{#if clips.length === 0}
  <p class="px-4 py-6 text-sm text-muted">No recordings on this day.</p>
{:else}
  <div class="flex items-center justify-between gap-3 border-t border-rule px-4 py-3 text-sm text-muted">
    <span class="num">Showing {shown} of {clips.length}</span>
    {#if shown < clips.length}
      <button
        type="button"
        onclick={() => (extra += pageSize)}
        class="min-h-11 rounded px-3 font-semibold text-ink outline-foil hover:bg-plate focus-visible:outline-2">Show {pageSize} more</button
      >
    {/if}
  </div>
{/if}
