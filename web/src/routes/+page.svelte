<script lang="ts">
  import { untrack } from 'svelte';
  import DayNav from '../lib/components/DayNav.svelte';
  import EventList from '../lib/components/EventList.svelte';
  import FilterBar from '../lib/components/FilterBar.svelte';
  import Icon from '../lib/components/Icon.svelte';
  import LoadProblem from '../lib/components/LoadProblem.svelte';
  import Player, { type Target } from '../lib/components/Player.svelte';
  import { localDayOf } from '../lib/dashboard/data';
  import { createDayData, createViewEnv } from '../lib/dashboard/dayData.svelte';
  import { handleKeydown, runCommand, type DispatchContext } from '../lib/dashboard/shortcutDispatch';
  import type { Profile } from '../lib/player/buffer';
  import type { createPlayer, IntegrityState, PlayerState } from '../lib/player/engine';
  import { sealLabel } from '../lib/seal/rosette';
  import Timeline from '../lib/timeline/Timeline.svelte';
  import { triggerStyle } from '../lib/timeline/model';
  import { browserZone } from '../lib/timeline/timezone';
  import { loadZonePref, saveZonePref } from '../lib/timeline/zonePref';
  import { spanLabel } from '../lib/timeline/zoom';
  import { getWorkerClient, type WorkerClient } from '../lib/workerClient';
  import type { ExportEnv } from '../lib/export';

  interface Props {
    /** The crypto/data worker; it holds K_api and does every authenticated request. */
    client?: Pick<WorkerClient, 'call'>;
    /** Display zone to start in; otherwise the viewer's remembered choice, else their own zone. */
    zone?: string;
    /** Fixed "now" for tests; otherwise the wall clock, refreshed every 30 s. */
    nowMs?: number;
    profile?: Profile;
    factory?: typeof createPlayer;
    exportEnv?: ExportEnv;
  }

  let { client = getWorkerClient(), zone: initialZone, nowMs, profile, factory, exportEnv }: Props = $props();

  // The forced display zone (e.g. Asia/Jakarta for relatives abroad); null follows the viewer's own.
  let forcedZone = $state<string | null>(untrack(() => initialZone ?? loadZonePref()));
  const ownZone = browserZone();
  const zone = $derived(forcedZone ?? ownZone);

  const env = createViewEnv();
  const now = $derived(nowMs ?? env.wall);
  const todayDay = $derived(localDayOf(now, zone));

  let camera = $state('');
  let trigger = $state('');
  let day = $state(untrack(() => localDayOf(nowMs ?? Date.now(), zone)));

  const data = createDayData(untrack(() => client), () => ({ day, zone, camera, trigger }));

  let selectedId = $state<string | null>(null);
  let cue = $state<Target | null>(null);
  let cueN = 0;
  let integrity = $state<Record<string, IntegrityState | undefined>>({});
  let spanMs = $state(0);
  let shortcutsOpen = $state(false);

  let playerView: { togglePlay(): void; skip(ms: number): void } | undefined = $state();
  let timeline: { stepZoom(dir: 'in' | 'out'): void; jumpToNow(): void } | undefined = $state();

  /** Pick the display zone; the view moves to "today" there, which can be another date. */
  function setZone(z: string | null): void {
    forcedZone = z;
    saveZonePref(z);
    day = localDayOf(now, z ?? ownZone);
  }

  // ---- derived views -----------------------------------------------------------

  const lanes = $derived((data.cameras ?? []).filter((c) => !camera || c.id === camera));

  // ---- selection and playback ------------------------------------------------------

  function select(clipId: string, offsetMs = 0): void {
    selectedId = clipId;
    cue = { clipId, offsetMs, n: ++cueN };
  }

  function onPlayerState(s: PlayerState): void {
    if (s.clipId === null) return;
    // Auto-advance moves the player on by itself: the selection follows it.
    if (s.clipId !== selectedId) selectedId = s.clipId;
    if (s.integrity !== 'verifying' && integrity[s.clipId] !== s.integrity) integrity[s.clipId] = s.integrity;
  }

  const ctx = (): DispatchContext => ({
    playerView,
    timeline,
    timelineClips: data.timelineClips,
    selectedId,
    select,
    goToday() {
      if (day === todayDay) return false;
      day = todayDay;
      return true;
    },
  });
  const onkeydown = (e: KeyboardEvent) => handleKeydown(e, ctx());

  const LEGEND_TRIGGERS = ['person', 'vehicle', 'pet', 'motion', 'other'] as const;
  const SHORTCUTS: readonly (readonly [string[], string])[] = [
    [['Space'], 'Play or pause'],
    [['←', '→'], 'Back or forward 10 seconds'],
    [['J', 'K'], 'Previous or next clip'],
    [['[', ']'], 'Zoom out or in'],
    [['T'], 'Jump to now'],
  ];
  const tool =
    'inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-[10px] border border-rule px-3 text-sm font-semibold text-ink md:min-h-9 md:min-w-9';
</script>

<svelte:window {onkeydown} />

<div data-testid="timeline-page" class="flex min-h-dvh flex-col">
  <DayNav {day} {todayDay} {zone} onDay={(d) => (day = d)} />
  <FilterBar
    cameras={data.cameras ?? []}
    {camera}
    {trigger}
    {forcedZone}
    browserZone={ownZone}
    onCamera={(id) => (camera = id)}
    onTrigger={(t) => (trigger = t)}
    onZone={setZone}
  />

  {#if data.error}
    <LoadProblem kind={data.error} text="Could not load recordings." onRetry={data.retry} />
  {:else if data.cameras === null}
    <p role="status" class="px-4 py-3 text-sm text-muted">Loading…</p>
  {:else if data.cameras.length === 0}
    <p class="px-4 py-3 text-sm text-muted">No cameras are set up yet.</p>
  {:else}
    {#if data.invalid > 0 && data.ready && !data.dayError}
      <p role="status" class="px-4 pb-2 text-xs text-amber">
        {data.invalid} {data.invalid === 1 ? 'recording' : 'recordings'} could not be read and {data.invalid === 1 ? 'is' : 'are'} not shown.
      </p>
    {/if}
    <div class="grid min-w-0 flex-1 md:grid-cols-[minmax(0,1fr)_22rem] md:gap-4 md:px-4">
      <div class="min-w-0 max-md:px-4">
        <!-- On a phone the player stays pinned at the top while the page scrolls. -->
        <div class="sticky top-0 z-10 bg-ground pb-2 md:static">
          <Player
            bind:this={playerView}
            {client}
            {cue}
            {zone}
            {profile}
            {factory}
            env={exportEnv}
            cameraName={data.nameOf}
            onState={onPlayerState}
            onPrev={() => runCommand('prev', ctx())}
            onNext={() => runCommand('next', ctx())}
          />
        </div>

        {#if data.dayError}
          <LoadProblem kind={data.dayError} text="Could not load recordings." onRetry={data.retry} />
        {:else if !data.ready}
          <p role="status" class="py-3 text-sm text-muted">Loading…</p>
        {:else}
          <div class="mt-2 flex flex-wrap items-center gap-2">
            <button type="button" class={tool} aria-label="Zoom out" title="Zoom out ([)" onclick={() => runCommand('zoomOut', ctx())}>
              <Icon name="zoom-out" />
            </button>
            <span class="num min-w-12 text-center text-sm text-ink" aria-live="polite">{spanLabel(spanMs)}</span>
            <button type="button" class={tool} aria-label="Zoom in" title="Zoom in (])" onclick={() => runCommand('zoomIn', ctx())}>
              <Icon name="zoom-in" />
            </button>
            <button type="button" class={tool} title="Jump to now (T)" onclick={() => runCommand('now', ctx())}>Now</button>
            <button
              type="button"
              class="{tool} ml-auto"
              aria-expanded={shortcutsOpen}
              aria-controls="shortcuts"
              onclick={() => (shortcutsOpen = !shortcutsOpen)}>Keyboard shortcuts</button
            >
          </div>
          {#if shortcutsOpen}
            <dl id="shortcuts" class="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm text-muted">
              {#each SHORTCUTS as [keys, what] (what)}
                <dt class="flex gap-1">
                  {#each keys as k (k)}<kbd class="num min-w-6 rounded border border-rule px-1.5 text-center text-ink">{k}</kbd>{/each}
                </dt>
                <dd>{what}</dd>
              {/each}
            </dl>
          {/if}

          <div class="mt-2 mb-1.5">
            <Timeline
              bind:this={timeline}
              cameras={lanes.map((c) => ({ id: c.id, name: c.name }))}
              clips={data.timelineClips}
              coverage={data.coverage}
              {day}
              {zone}
              nowMs={now}
              selectedClipId={selectedId}
              {integrity}
              laneHeight={env.phone ? 56 : 44}
              onSpan={(ms) => (spanMs = ms)}
              onSelect={(id, offset) => select(id, offset)}
            />
          </div>

          <ul aria-label="Legend" class="mb-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted">
            {#each LEGEND_TRIGGERS as t (t)}
              {@const st = triggerStyle(t)}
              <li class="flex items-center gap-1.5">
                <span aria-hidden="true" style:background={st.color} class="inline-block min-w-5 rounded px-1 text-center font-bold text-on-trigger"
                  >{st.glyph}</span
                >{st.label}
              </li>
            {/each}
            <li class="flex items-center gap-1.5">
              <svg aria-hidden="true" width="20" height="12" viewBox="0 0 20 12" class="text-muted">
                <defs>
                  <pattern id="legend-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                    <line x1="0" y1="0" x2="0" y2="6" stroke="currentColor" stroke-width="1.5" />
                  </pattern>
                </defs>
                <rect width="20" height="12" fill="url(#legend-hatch)" />
              </svg>not monitored
            </li>
            <li class="flex items-center gap-1.5">
              <svg aria-hidden="true" width="20" height="12" viewBox="0 0 20 12" class="text-void">
                <defs>
                  <pattern id="legend-tampered" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                    <line x1="0" y1="0" x2="0" y2="6" stroke="currentColor" stroke-width="1.5" />
                  </pattern>
                </defs>
                <rect width="20" height="12" fill="url(#legend-tampered)" />
                <rect x="1" y="1" width="18" height="10" fill="none" stroke="currentColor" stroke-width="2" />
              </svg>{sealLabel('tampered')}
            </li>
            <li class="flex items-center gap-1.5">
              <svg aria-hidden="true" width="20" height="12" viewBox="0 0 20 12" class="text-amber">
                <rect x="1" y="1" width="18" height="10" fill="none" stroke="currentColor" stroke-width="2" />
                <path d="M1 1h8L1 9z" fill="currentColor" />
              </svg>{sealLabel('mismatch')}
            </li>
          </ul>
        {/if}
      </div>

      {#if data.ready && !data.dayError}
        <section class="min-w-0 md:sticky md:top-0 md:max-h-dvh md:self-start md:overflow-y-auto">
          <h2 class="num px-4 pt-3.5 pb-1.5 text-sm font-semibold text-muted md:px-0">
            {data.rows.length} {data.rows.length === 1 ? 'event' : 'events'}
          </h2>
          <EventList clips={data.rows} {selectedId} {zone} {integrity} onSelect={(id) => select(id)} />
        </section>
      {/if}
    </div>
  {/if}
</div>
