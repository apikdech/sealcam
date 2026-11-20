<script lang="ts">
  import { untrack } from 'svelte';
  import DayNav from '../../lib/components/DayNav.svelte';
  import EventList from '../../lib/components/EventList.svelte';
  import LoadProblem from '../../lib/components/LoadProblem.svelte';
  import Player, { type Target } from '../../lib/components/Player.svelte';
  import { localDayOf } from '../../lib/dashboard/data';
  import { dayTitle } from '../../lib/dashboard/day';
  import { createDayData, createViewEnv } from '../../lib/dashboard/dayData.svelte';
  import { handleKeydown, runCommand, type DispatchContext } from '../../lib/dashboard/shortcutDispatch';
  import LiveGrid from '../../lib/live/LiveGrid.svelte';
  import type { Profile } from '../../lib/player/buffer';
  import type { createPlayer, IntegrityState, PlayerState } from '../../lib/player/engine';
  import Timeline from '../../lib/timeline/Timeline.svelte';
  import { browserZone } from '../../lib/timeline/timezone';
  import { loadZonePref } from '../../lib/timeline/zonePref';
  import { getWorkerClient, type WorkerClient } from '../../lib/workerClient';
  import type { ExportEnv } from '../../lib/export';
  import type { Status } from '../../worker/schemas';

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

  const env = createViewEnv();
  const now = $derived(nowMs ?? env.wall);
  const todayDay = $derived(localDayOf(now, zone));

  let day = $state(untrack(() => localDayOf(nowMs ?? Date.now(), zone)));

  const data = createDayData(untrack(() => client), () => ({ day, zone }));

  let selectedId = $state<string | null>(null);
  let cue = $state<Target | null>(null);
  let cueN = 0;
  let integrity = $state<Record<string, IntegrityState | undefined>>({});

  let playerView: { togglePlay(): void; skip(ms: number): void } | undefined = $state();
  let timeline: { stepZoom(dir: 'in' | 'out'): void; jumpToNow(): void } | undefined = $state();

  const heading = $derived(`${day === todayDay ? 'Today' : dayTitle(day, todayDay)} · ${data.rows.length} ${data.rows.length === 1 ? 'event' : 'events'}`);
  const summary = $derived.by(() => {
    const rows = data.rows;
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

  const ctx = (): DispatchContext => ({
    playerView,
    timeline,
    timelineClips: data.timelineClips,
    selectedId,
    select,
    goToday() {
      if (day === todayDay) return false;
      setDay(todayDay);
      return true;
    },
  });
  const onkeydown = (e: KeyboardEvent) => handleKeydown(e, ctx());
</script>

<svelte:window {onkeydown} />

<main data-testid="home" class="flex min-h-dvh flex-col">
  <h1 class="sr-only">Home</h1>
  <DayNav {day} {todayDay} {zone} onDay={setDay} />

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
    <div class="grid min-w-0 flex-1 content-start md:grid-cols-[minmax(0,1fr)_22rem] md:gap-4 md:px-4">
      <div class="min-w-0 max-md:px-4">
        <!-- The grid unmounts while the player shows, which frees the viewer slots. -->
        {#if selectedId === null}
          <LiveGrid cameras={data.cameras} {client} {zone} {status} />
        {:else}
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
            onBack={backToLive}
            onPrev={() => runCommand('prev', ctx())}
            onNext={() => runCommand('next', ctx())}
          />
        {/if}
        {#if data.dayError}
          <LoadProblem kind={data.dayError} text="Could not load recordings." onRetry={data.retry} />
        {:else if !data.ready}
          <p role="status" class="py-3 text-sm text-muted">Loading…</p>
        {:else}
          <div class="mt-3.5 mb-1.5">
            <Timeline
              bind:this={timeline}
              cameras={data.cameras.map((c) => ({ id: c.id, name: c.name }))}
              clips={data.timelineClips}
              coverage={data.coverage}
              {day}
              {zone}
              nowMs={now}
              selectedClipId={selectedId}
              {integrity}
              laneHeight={env.phone ? 56 : 44}
              onSelect={(id, offset) => select(id, offset)}
            />
          </div>
        {/if}
      </div>

      {#if data.ready && !data.dayError}
        <section class="min-w-0">
          <div class="flex items-baseline justify-between gap-3 px-4 pt-3.5 pb-1.5 text-sm text-muted md:px-0">
            <h2 class="num font-semibold">{heading}</h2>
            {#if summary}<span>{summary}</span>{/if}
          </div>
          <EventList clips={data.rows} {selectedId} {zone} {integrity} onSelect={(id) => select(id)} />
        </section>
      {/if}
    </div>
  {/if}
</main>
