<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import DayNav from '../../lib/components/DayNav.svelte';
  import EventList from '../../lib/components/EventList.svelte';
  import Player, { type Target } from '../../lib/components/Player.svelte';
  import { loadDay, localDayOf, toEventRow, toTimelineClip } from '../../lib/dashboard/data';
  import { dayTitle } from '../../lib/dashboard/day';
  import LiveGrid from '../../lib/live/LiveGrid.svelte';
  import type { Profile } from '../../lib/player/buffer';
  import type { createPlayer, IntegrityState, PlayerState } from '../../lib/player/engine';
  import { adjacentClip, commandFor, type Command } from '../../lib/shortcuts';
  import Timeline from '../../lib/timeline/Timeline.svelte';
  import type { Coverage } from '../../lib/timeline/model';
  import { browserZone } from '../../lib/timeline/timezone';
  import { loadZonePref } from '../../lib/timeline/zonePref';
  import { getWorkerClient, type WorkerClient } from '../../lib/workerClient';
  import type { ExportEnv } from '../../lib/export';
  import type { Camera, Sidecar, Status } from '../../worker/schemas';

  interface Props {
    /** The crypto/data worker; it holds K_api and does every authenticated request. */
    client?: Pick<WorkerClient, 'call'>;
    /** Relay status, polled by the shell; it only marks cameras that are down. */
    status: Status | null;
    /** Display zone; otherwise the viewer's remembered choice, else their own zone. */
    zone?: string;
    /** Fixed "now" for tests; otherwise the wall clock, refreshed every 30 s. */
    nowMs?: number;
    profile?: Profile;
    factory?: typeof createPlayer;
    exportEnv?: ExportEnv;
  }

  let { client = getWorkerClient(), status, zone: zoneProp, nowMs, profile, factory, exportEnv }: Props = $props();

  const zone = untrack(() => zoneProp ?? loadZonePref() ?? browserZone());

  let wall = $state(Date.now());
  const now = $derived(nowMs ?? wall);
  const todayDay = $derived(localDayOf(now, zone));

  let cameras = $state<Camera[] | null>(null);
  let clips = $state<Sidecar[]>([]);
  let coverage = $state<Coverage[]>([]);
  let invalid = $state(0);
  // A failed cameras request leaves nothing to show; a failed day only replaces the day section.
  let error = $state<'' | 'key' | 'failed'>('');
  let dayError = $state<'' | 'key' | 'failed'>('');
  /** The day `clips` and `coverage` belong to; the lists wait for it to match `day`. */
  let loadedDay = $state('');
  let attempt = $state(0);
  let day = $state(untrack(() => localDayOf(nowMs ?? Date.now(), zone)));

  let selectedId = $state<string | null>(null);
  let cue = $state<Target | null>(null);
  let cueN = 0;
  let integrity = $state<Record<string, IntegrityState | undefined>>({});
  let phone = $state(false);

  let playerView: { togglePlay(): void; skip(ms: number): void } | undefined = $state();
  let timeline: { stepZoom(dir: 'in' | 'out'): void; jumpToNow(): void } | undefined = $state();

  const noKey = (e: unknown): boolean => e instanceof Error && e.name === 'ErrNoKey';

  // ---- data ------------------------------------------------------------------

  onMount(() => {
    const clock = setInterval(() => (wall = Date.now()), 30_000);
    const mq = window.matchMedia?.('(max-width: 767px)');
    const sync = () => (phone = mq?.matches ?? false);
    sync();
    mq?.addEventListener?.('change', sync);
    return () => {
      clearInterval(clock);
      mq?.removeEventListener?.('change', sync);
    };
  });

  // Cameras load again on every "Try again".
  $effect(() => {
    void attempt;
    let alive = true;
    client
      .call<Camera[]>({ type: 'api.get', path: '/api/v1/cameras', query: {} })
      .then((c) => {
        if (alive) cameras = c;
      })
      .catch((e: unknown) => {
        if (alive) error = noKey(e) ? 'key' : 'failed';
      });
    return () => {
      alive = false;
    };
  });

  let loadGen = 0;
  $effect(() => {
    if (cameras === null) return;
    void attempt;
    const q = { day, zone, camera: '', trigger: '', cameras: cameras.map((c) => c.id) };
    const gen = ++loadGen;
    dayError = '';
    loadDay(client, q)
      .then((d) => {
        if (gen !== loadGen) return;
        clips = d.clips;
        coverage = d.coverage;
        invalid = d.invalid;
        loadedDay = q.day;
      })
      .catch((e: unknown) => {
        if (gen === loadGen) dayError = noKey(e) ? 'key' : 'failed';
      });
  });

  function retry(): void {
    error = '';
    dayError = '';
    attempt++;
  }

  // ---- derived views -----------------------------------------------------------

  const timelineClips = $derived(clips.map(toTimelineClip).sort((a, b) => a.startMs - b.startMs));
  const rows = $derived([...clips].sort((a, b) => Date.parse(b.start_time) - Date.parse(a.start_time)).map(toEventRow));
  const nameOf = $derived((id: string) => cameras?.find((c) => c.id === id)?.name ?? id);

  const dayReady = $derived(loadedDay === day);
  const heading = $derived(`${day === todayDay ? 'Today' : dayTitle(day, todayDay)} · ${rows.length} ${rows.length === 1 ? 'event' : 'events'}`);
  const summary = $derived.by(() => {
    if (rows.length === 0) return '';
    const unchecked = rows.filter((r) => integrity[r.id] === undefined).length;
    if (unchecked > 0) return `${unchecked} not checked yet`;
    const bad = rows.filter((r) => integrity[r.id] !== 'verified').length;
    return bad === 0 ? 'All verified' : `${bad} need a look`;
  });

  // ---- selection and playback ------------------------------------------------------

  function select(clipId: string, offsetMs = 0): void {
    selectedId = clipId;
    cue = { clipId, offsetMs, n: ++cueN };
  }

  /** Another day starts from live again: the player and its selection belong to the day left. */
  function setDay(d: string): void {
    day = d;
    backToLive();
  }

  function backToLive(): void {
    selectedId = null;
    cue = null;
  }

  function onPlayerState(s: PlayerState): void {
    if (s.clipId === null) return;
    // Auto-advance moves the player on by itself: the selection follows it.
    if (s.clipId !== selectedId) selectedId = s.clipId;
    if (s.integrity !== 'verifying' && integrity[s.clipId] !== s.integrity) integrity[s.clipId] = s.integrity;
  }

  /** Runs a command; false when there was nothing for it to act on (the key keeps its default). */
  function run(cmd: Command): boolean {
    switch (cmd) {
      case 'toggle':
        playerView?.togglePlay();
        return !!playerView;
      case 'back10':
        playerView?.skip(-10_000);
        return !!playerView;
      case 'fwd10':
        playerView?.skip(10_000);
        return !!playerView;
      case 'prev':
      case 'next': {
        const id = adjacentClip(timelineClips, selectedId, cmd);
        if (id === null) return false;
        if (id !== selectedId) select(id);
        return true;
      }
      case 'zoomIn':
      case 'zoomOut':
        timeline?.stepZoom(cmd === 'zoomIn' ? 'in' : 'out');
        return !!timeline;
      case 'now':
        if (day !== todayDay) {
          setDay(todayDay);
          return true;
        }
        timeline?.jumpToNow();
        return !!timeline;
    }
  }

  function onkeydown(e: KeyboardEvent): void {
    // A modal dialog (the export confirmation) owns the keyboard: nothing behind it may react.
    if (document.querySelector('[aria-modal="true"]')) return;
    const cmd = commandFor(e);
    if (cmd === null) return;
    if (run(cmd)) e.preventDefault();
  }
</script>

{#snippet problem(kind: 'key' | 'failed', text: string)}
  <div role="alert" class="px-4 py-3 text-sm text-ink max-md:px-0">
    {#if kind === 'key'}
      <p>Your key is locked.</p>
      <a href="#/key" class="inline-flex min-h-11 items-center font-semibold text-line underline">Unlock</a>
    {:else}
      <p>{text}</p>
      <button type="button" class="min-h-11 rounded-[10px] border border-rule px-4 font-semibold text-ink" onclick={retry}>Try again</button>
    {/if}
  </div>
{/snippet}

<svelte:window {onkeydown} />

<div data-testid="home" class="flex min-h-dvh flex-col">
  <DayNav {day} {todayDay} {zone} onDay={setDay} />

  {#if error}
    {@render problem(error, 'Could not load recordings.')}
  {:else if cameras === null}
    <p role="status" class="px-4 py-3 text-sm text-muted">Loading…</p>
  {:else if cameras.length === 0}
    <p class="px-4 py-3 text-sm text-muted">No cameras are set up yet.</p>
  {:else}
    {#if invalid > 0 && dayReady}
      <p role="status" class="px-4 pb-2 text-xs text-amber">
        {invalid} {invalid === 1 ? 'recording' : 'recordings'} could not be read and {invalid === 1 ? 'is' : 'are'} not shown.
      </p>
    {/if}
    <div class="grid min-w-0 flex-1 md:grid-cols-[minmax(0,1fr)_22rem] md:gap-4 md:px-4">
      <div class="min-w-0 max-md:px-4">
        <!-- The grid unmounts while the player shows, which frees the viewer slots. -->
        {#if selectedId === null}
          <LiveGrid {cameras} {client} {zone} {status} />
        {:else}
          <Player
            bind:this={playerView}
            {client}
            {cue}
            {zone}
            {profile}
            {factory}
            env={exportEnv}
            cameraName={nameOf}
            onState={onPlayerState}
            onBack={backToLive}
            onPrev={() => run('prev')}
            onNext={() => run('next')}
          />
        {/if}
        {#if dayError}
          {@render problem(dayError, 'Could not load recordings.')}
        {:else if !dayReady}
          <p role="status" class="py-3 text-sm text-muted">Loading…</p>
        {:else}
          <div class="mt-3.5 mb-1.5">
            <Timeline
              bind:this={timeline}
              cameras={cameras.map((c) => ({ id: c.id, name: c.name }))}
              clips={timelineClips}
              {coverage}
              {day}
              {zone}
              nowMs={now}
              selectedClipId={selectedId}
              {integrity}
              laneHeight={phone ? 56 : 44}
              onSelect={(id, offset) => select(id, offset)}
            />
          </div>
        {/if}
      </div>

      {#if dayReady && !dayError}
        <section class="min-w-0">
          <div class="flex items-baseline justify-between gap-3 px-4 pt-3.5 pb-1.5 text-sm text-muted md:px-0">
            <h2 class="num font-semibold">{heading}</h2>
            {#if summary}<span>{summary}</span>{/if}
          </div>
          <EventList clips={rows} {selectedId} {zone} {integrity} onSelect={(id) => select(id)} />
        </section>
      {/if}
    </div>
  {/if}
</div>
