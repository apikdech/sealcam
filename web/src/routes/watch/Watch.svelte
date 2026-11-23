<script lang="ts">
  import { onMount, untrack, type Snippet } from 'svelte';
  import DayMenu from '../../lib/components/DayMenu.svelte';
  import DayNav from '../../lib/components/DayNav.svelte';
  import EventList from '../../lib/components/EventList.svelte';
  import Icon from '../../lib/components/Icon.svelte';
  import LoadProblem from '../../lib/components/LoadProblem.svelte';
  import Player, { type Target } from '../../lib/components/Player.svelte';
  import TriggerChips from '../../lib/components/TriggerChips.svelte';
  import { localDayOf } from '../../lib/dashboard/data';
  import { dayTitle } from '../../lib/dashboard/day';
  import { createDayData, createViewEnv } from '../../lib/dashboard/dayData.svelte';
  import { handleKeydown, runCommand, type DispatchContext } from '../../lib/dashboard/shortcutDispatch';
  import LiveGrid from '../../lib/live/LiveGrid.svelte';
  import type { Profile } from '../../lib/player/buffer';
  import type { createPlayer, IntegrityState, PlayerState } from '../../lib/player/engine';
  import { overVideo } from '../../lib/overVideo';
  import { sealLabel } from '../../lib/seal/rosette';
  import Timeline from '../../lib/timeline/Timeline.svelte';
  import { LANE_GAP, RULER_HEIGHT, triggerStyle } from '../../lib/timeline/model';
  import { browserZone } from '../../lib/timeline/timezone';
  import { loadZonePref, saveZonePref } from '../../lib/timeline/zonePref';
  import { spanLabel } from '../../lib/timeline/zoom';
  import { getWorkerClient, type WorkerClient } from '../../lib/workerClient';
  import type { ExportEnv } from '../../lib/export';
  import type { Status } from '../../worker/schemas';

  interface Props {
    /** The crypto/data worker; it holds K_api and does every authenticated request. */
    client?: Pick<WorkerClient, 'call'>;
    /** Relay status, polled by the shell; it only marks cameras that are down. */
    status: Status | null;
    /** Display zone to start in; otherwise the viewer's remembered choice, else their own zone. */
    zone?: string;
    /** Fixed "now" for tests; otherwise the wall clock, refreshed every 30 s. */
    nowMs?: number;
    profile?: Profile;
    factory?: typeof createPlayer;
    exportEnv?: ExportEnv;
    /** The shell's end of the top bar (status, theme, key), so the bar is one row. */
    topRight: Snippet;
    /** The shell's notices, rendered full width directly under the top bar. */
    notices?: Snippet;
  }

  let { client = getWorkerClient(), status, zone: initialZone, nowMs, profile, factory, exportEnv, topRight, notices }: Props = $props();

  // The forced display zone (e.g. Asia/Jakarta for relatives abroad); null follows the viewer's own.
  let forcedZone = $state<string | null>(untrack(() => initialZone ?? loadZonePref()));
  const ownZone = browserZone();
  const zone = $derived(forcedZone ?? ownZone);

  const env = createViewEnv();
  const now = $derived(nowMs ?? env.wall);
  const todayDay = $derived(localDayOf(now, zone));

  // Short phone screens get thinner lanes so the list keeps three rows.
  let short = $state(false);
  onMount(() => {
    const mq = window.matchMedia?.('(max-height: 700px)');
    const sync = () => (short = mq?.matches ?? false);
    sync();
    mq?.addEventListener?.('change', sync);
    return () => mq?.removeEventListener?.('change', sync);
  });

  let camera = $state('');
  let triggers = $state<string[]>([]);
  let day = $state(untrack(() => localDayOf(nowMs ?? Date.now(), zone)));

  const data = createDayData(untrack(() => client), () => ({ day, zone, camera, triggers }));

  let selectedId = $state<string | null>(null);
  let cue = $state<Target | null>(null);
  let cueN = 0;
  let integrity = $state<Record<string, IntegrityState | undefined>>({});
  let spanMs = $state(0);
  let shortcutsOpen = $state(false);

  let playerView: { togglePlay(): void; skip(ms: number): void } | undefined = $state();
  let timeline: { stepZoom(dir: 'in' | 'out'): void; jumpToNow(): void } | undefined = $state();

  /** Live on today with nothing picked; a past day with nothing picked waits for a pick. */
  const mode = $derived(selectedId === null ? (day === todayDay ? 'live' : 'idle') : 'recording');

  // At midnight a live view moves on to the new today instead of dropping to the idle prompt.
  let prevToday = untrack(() => todayDay);
  $effect.pre(() => {
    const t = todayDay;
    untrack(() => {
      if (t !== prevToday && day === prevToday && selectedId === null) day = t;
      prevToday = t;
    });
  });

  // ---- derived views -----------------------------------------------------------

  const filtered = $derived((data.cameras ?? []).filter((c) => !camera || c.id === camera));
  const available = $derived([...new Set([...data.rows.flatMap((r) => r.triggers), ...triggers])]);
  const triggersOf = (id: string) => data.rows.find((r) => r.id === id)?.triggers ?? [];
  const laneHeight = $derived(env.phone ? (short ? 32 : 48) : 40);
  // Phones: what sits around the video (top bar, player bar and seal line, timeline, list header,
  // three rows). The video gives up height first so the list keeps three rows.
  const chrome = $derived(52 + 112 + 44 + RULER_HEIGHT + Math.max(filtered.length, 1) * (laneHeight + LANE_GAP) + 8 + 88 + 3 * 64);

  const heading = $derived(`${day === todayDay ? 'Today' : dayTitle(day, todayDay)} · ${data.rows.length} ${data.rows.length === 1 ? 'event' : 'events'}`);
  const summary = $derived.by(() => {
    const rows = data.rows;
    if (rows.length === 0) return '';
    const unchecked = rows.filter((r) => integrity[r.id] === undefined).length;
    if (unchecked > 0) return `${unchecked} not checked yet`;
    const bad = rows.filter((r) => integrity[r.id] !== 'verified').length;
    return bad === 0 ? 'All verified' : `${bad} need a look`;
  });

  // ---- selection, playback and modes -----------------------------------------------

  function select(clipId: string, offsetMs = 0): void {
    selectedId = clipId;
    cue = { clipId, offsetMs, n: ++cueN };
  }

  /** Another day drops the selection: the player belongs to the day left. */
  function setDay(d: string): void {
    day = d;
    selectedId = null;
    cue = null;
  }

  function goLive(): void {
    selectedId = null;
    cue = null;
    day = todayDay;
  }

  /** Pick the display zone; the view moves to "today" there, which can be another date. */
  function setZone(z: string | null): void {
    forcedZone = z;
    saveZonePref(z);
    setDay(localDayOf(now, z ?? ownZone));
  }

  function onPlayerState(s: PlayerState): void {
    if (s.clipId === null) return;
    // Auto-advance moves the player on by itself: the selection follows it.
    if (s.clipId !== selectedId) selectedId = s.clipId;
    if (s.integrity !== 'verifying' && integrity[s.clipId] !== s.integrity) integrity[s.clipId] = s.integrity;
  }

  const ctx = (): DispatchContext => ({
    playerView,
    // While the day loads the timeline shows nothing to zoom.
    timeline: data.ready ? timeline : undefined,
    timelineClips: data.ready ? data.timelineClips : [],
    selectedId,
    select,
    goToday() {
      if (day === todayDay) {
        // Now on today is also the way back to live; the timeline still centres on now.
        goLive();
        return false;
      }
      setDay(todayDay);
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
    'inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-[10px] px-2 text-sm font-semibold text-ink hover:bg-plate md:min-h-8 md:min-w-8';
  const field =
    'min-h-11 min-w-0 appearance-none rounded-[10px] border border-rule bg-plate pr-8 pl-2 text-sm text-ink md:min-h-9';
</script>

<svelte:window {onkeydown} />

<main data-testid="watch" class="grid h-dvh grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden">
  <h1 class="sr-only">Watch</h1>

  <div class="flex min-w-0 items-center gap-2 border-b border-rule px-2 py-1 md:gap-3 md:px-4">
    <p class="text-lg font-semibold tracking-wide"><span class="text-ink">z</span><span class="text-line">view</span></p>
    <DayNav {day} {todayDay} {zone} onDay={setDay}>
      {#snippet menu(close)}
        <DayMenu
          {day}
          {todayDay}
          {forcedZone}
          browserZone={ownZone}
          cameras={data.cameras ?? []}
          {camera}
          showCamera={env.phone && (data.cameras?.length ?? 0) > 1}
          onDay={(d) => {
            setDay(d);
            close();
          }}
          onZone={setZone}
          onCamera={(id) => (camera = id)}
        />
      {/snippet}
    </DayNav>
    {#if !env.phone && (data.cameras?.length ?? 0) > 1}
      <span class="relative block">
        <select class={field} aria-label="Camera" value={camera} onchange={(e) => (camera = e.currentTarget.value)}>
          <option value="">All cameras</option>
          {#each data.cameras ?? [] as c (c.id)}
            <option value={c.id}>{c.name}</option>
          {/each}
        </select>
        <span class="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rotate-90 text-muted"><Icon name="chevron-right" size={16} /></span>
      </span>
    {/if}
    <span class="flex-1"></span>
    <div class="flex shrink-0 items-center">{@render topRight()}</div>
  </div>

  <!-- Notices: one line each, full width; they take their height from the stage. -->
  <div>
    {@render notices?.()}
    {#if data.invalid > 0 && data.ready && !data.dayError}
      <p role="status" class="border-b border-rule px-4 py-1.5 text-xs text-amber">
        {data.invalid} {data.invalid === 1 ? 'recording' : 'recordings'} could not be read and {data.invalid === 1 ? 'is' : 'are'} not shown.
      </p>
    {/if}
  </div>

  {#if data.error}
    <div><LoadProblem kind={data.error} text="Could not load recordings." onRetry={data.retry} /></div>
  {:else if data.cameras === null}
    <p role="status" class="px-4 py-3 text-sm text-muted">Loading…</p>
  {:else if data.cameras.length === 0}
    <p class="px-4 py-3 text-sm text-muted">No cameras are set up yet.</p>
  {:else}
    <div
      class="grid min-h-0 min-w-0 grid-rows-[auto_auto_minmax(0,1fr)] [--list-w:300px] md:[--list-w:380px] wide:grid-cols-[minmax(0,1fr)_var(--list-w)] wide:grid-rows-[minmax(0,1fr)_auto]"
      style:--chrome="{chrome}px"
    >
      <!-- The stage is a screen, dark in both themes. On phones the video gives up height first. -->
      <div
        data-testid="stage"
        class="relative min-h-0 min-w-0 overflow-hidden bg-black [&_video]:max-h-[calc(100dvh-var(--chrome))] wide:[&_video]:max-h-none [&_:fullscreen_video]:max-h-none wide:col-start-1 wide:row-start-1"
      >
        <!-- The grid unmounts while the player shows, which frees the viewer slots. -->
        {#if mode === 'live'}
          <LiveGrid cameras={filtered} {client} {zone} {status} onFocus={(id) => (camera = id)} />
        {:else if mode === 'recording'}
          <Player
            bind:this={playerView}
            {client}
            {cue}
            {zone}
            {profile}
            {factory}
            env={exportEnv}
            compact={env.phone}
            cameraName={data.nameOf}
            {triggersOf}
            onState={onPlayerState}
            onLive={goLive}
            onPrev={() => runCommand('prev', ctx())}
            onNext={() => runCommand('next', ctx())}
          />
        {:else}
          <div
            class="flex aspect-video h-full w-full flex-col items-center justify-center gap-3 px-4 text-center wide:aspect-auto"
            style="{overVideo};color: var(--z-ov-ink)"
          >
            <p class="text-sm" style="color: var(--z-ov-muted)">Pick an event or a time on the timeline</p>
            <button
              type="button"
              class="inline-flex min-h-11 items-center rounded-[10px] border px-4 text-sm font-semibold"
              style="border-color: var(--z-ov-rule)"
              onclick={goLive}
              >Go to today</button
            >
          </div>
        {/if}
      </div>

      <div class="min-w-0 border-t border-rule px-3 pt-1 pb-2 wide:col-start-1 wide:row-start-2">
        {#if data.dayError}
          <LoadProblem kind={data.dayError} text="Could not load recordings." onRetry={data.retry} />
        {:else}
          <div class="flex flex-wrap items-center gap-1 text-xs text-muted">
            <button type="button" class={tool} aria-label="Zoom out" title="Zoom out ([)" onclick={() => runCommand('zoomOut', ctx())}>
              <Icon name="zoom-out" size={18} />
            </button>
            <span class="num min-w-10 text-center text-sm text-ink" aria-live="polite">{spanLabel(spanMs)}</span>
            <button type="button" class={tool} aria-label="Zoom in" title="Zoom in (])" onclick={() => runCommand('zoomIn', ctx())}>
              <Icon name="zoom-in" size={18} />
            </button>
            <button type="button" class={tool} title="Jump to now (T)" onclick={() => runCommand('now', ctx())}>Now</button>
            <ul
              aria-label="Legend"
              class="{shortcutsOpen ? 'flex' : 'hidden md:flex'} flex-wrap items-center gap-x-3 gap-y-1 max-md:order-last max-md:w-full md:ml-auto"
            >
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
            <button
              type="button"
              class="{tool} max-md:ml-auto"
              aria-label="Keyboard shortcuts"
              title="Keyboard shortcuts"
              aria-expanded={shortcutsOpen}
              aria-controls="shortcuts"
              onclick={() => (shortcutsOpen = !shortcutsOpen)}>?</button
            >
          </div>
          {#if shortcutsOpen}
            <dl id="shortcuts" class="mb-1 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm text-muted">
              {#each SHORTCUTS as [keys, what] (what)}
                <dt class="flex gap-1">
                  {#each keys as k (k)}<kbd class="num min-w-6 rounded border border-rule px-1.5 text-center text-ink">{k}</kbd>{/each}
                </dt>
                <dd>{what}</dd>
              {/each}
            </dl>
          {/if}
          <Timeline
            bind:this={timeline}
            cameras={filtered.map((c) => ({ id: c.id, name: c.name }))}
            clips={data.ready ? data.timelineClips : []}
            coverage={data.ready ? data.coverage : []}
            {day}
            {zone}
            nowMs={now}
            selectedClipId={selectedId}
            {integrity}
            {laneHeight}
            onSpan={(ms) => (spanMs = ms)}
            onSelect={(id, offset) => select(id, offset)}
            onNow={goLive}
          />
        {/if}
      </div>

      <section class="flex min-h-0 min-w-0 flex-col border-rule wide:col-start-2 wide:row-span-2 wide:row-start-1 wide:border-l">
        <div class="flex flex-col gap-2 border-y border-rule px-4 pt-3 pb-2 wide:border-t-0">
          {#if data.ready && !data.dayError}
            <div class="flex items-baseline justify-between gap-3 text-sm text-muted">
              <h2 class="num font-semibold text-ink">{heading}</h2>
              {#if summary}<span>{summary}</span>{/if}
            </div>
          {/if}
          <TriggerChips selected={triggers} {available} onChange={(t) => (triggers = t)} />
        </div>
        <!-- A day error shows under the stage instead. -->
        {#if !data.dayError && !data.ready}
          <p role="status" class="px-4 py-3 text-sm text-muted">Loading…</p>
        {:else if !data.dayError}
          <div class="min-h-0 flex-1 overflow-y-auto">
            <EventList clips={data.rows} {selectedId} {zone} {integrity} onSelect={(id) => select(id)} />
          </div>
        {/if}
      </section>
    </div>
  {/if}
</main>
