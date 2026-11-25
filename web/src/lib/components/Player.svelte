<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { browserExportEnv, canExport, ExportTooLargeError, exportClip, exportFilename, type ExportEnv } from '../export';
  import { BLOB_MAX, detectProfile, type Profile } from '../player/buffer';
  import { createPlayer, type Player, type PlayerState } from '../player/engine';
  import { loadSoundPref, saveSoundPref } from '../player/soundPref';
  import { describeIntegrity, initialState } from '../player/status';
  import type { WorkerClient } from '../workerClient';
  import ExportDialog from './ExportDialog.svelte';
  import Icon from './Icon.svelte';
  import { overVideo } from '../overVideo';
  import { fullscreenMode, toggleFullscreen, watchFullscreen, type FullscreenMode } from '../live/fullscreen';
  import Seal from '../seal/Seal.svelte';
  import type { SealState } from '../seal/rosette';
  import { formatClock } from '../timeline/timezone';
  import { triggerStyle } from '../timeline/model';

  /** Where to play: a clip, and how far into it. A new object (`n`) seeks again even within the same clip. */
  export interface Target {
    clipId: string;
    offsetMs: number;
    n: number;
  }

  interface Props {
    client: Pick<WorkerClient, 'call'>;
    cue: Target | null;
    /** Display zone for the export filename. */
    zone: string;
    profile?: Profile;
    /** The playback engine; replaceable for tests. */
    factory?: (video: HTMLVideoElement, client: WorkerClient, opts: { profile: Profile }) => Player;
    env?: ExportEnv;
    /** Called with every state the engine reports. */
    onState?: (s: PlayerState) => void;
    /** Display name of a camera, for the plain integrity messages. */
    cameraName?: (id: string) => string;
    /** When set, a "Live" pill on the stage goes back to live. */
    onLive?: () => void;
    /** The phone bar: fewer buttons, the rest under a More menu. */
    compact?: boolean;
    /** The trigger types of a clip, drawn as glyph chips in the Recording badge. */
    triggersOf?: (clipId: string) => readonly string[];
    /** The recorded length of a clip in milliseconds (sidecar `duration_ms`), or null when unknown. */
    durationOf?: (clipId: string) => number | null;
    onPrev?: () => void;
    onNext?: () => void;
  }

  let {
    client,
    cue,
    zone,
    profile,
    factory = createPlayer,
    env,
    onState,
    cameraName = (id: string) => id,
    onLive,
    compact = false,
    triggersOf,
    durationOf,
    onPrev,
    onNext,
  }: Props = $props();

  let video: HTMLVideoElement | undefined = $state();
  let frame: HTMLElement | undefined = $state();
  let fsMode: FullscreenMode = $state('none');
  let fullscreen = $state(false);
  let pos = $state(0);
  /** What the browser knows; 0 while a streamed clip has no duration yet (NaN or Infinity until endOfStream). */
  let mediaDuration = $state(0);

  /** Reads what the video element knows after a media event: duration and position. */
  function sync(v: HTMLVideoElement): void {
    pos = v.currentTime;
    mediaDuration = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 0;
  }

  const SPEEDS = [0.25, 0.5, 1, 1.5, 2, 4] as const;
  /** Playback speed; kept across clips, not stored. */
  let rate = $state(1);
  let speedOpen = $state(false);
  let speedBox: HTMLElement | undefined = $state();
  let speedBtn: HTMLButtonElement | undefined = $state();
  let moreBtn: HTMLButtonElement | undefined = $state();
  /** Engines and source swaps can reset the rate, so it is applied again after each load and play. */
  const applyRate = (v: HTMLVideoElement) => {
    if (v.playbackRate !== rate) v.playbackRate = rate;
  };
  $effect(() => {
    if (video) applyRate(video);
  });
  /** Closes the speed or More menu and gives focus back to the button that opened it. */
  function closeMenu(): void {
    speedOpen = false;
    moreOpen = false;
    (compact ? moreBtn : speedBtn)?.focus();
  }
  function pickSpeed(s: number): void {
    rate = s;
    closeMenu();
  }

  let player: Player | undefined = $state();
  /** Sound is off until the viewer turns it on; the choice is kept for the page session and across clips. */
  let soundOn = $state(loadSoundPref());
  let snap: PlayerState = $state(initialState());
  /** The browser's duration once known, else the clip's recorded length, else 0. */
  const duration = $derived(
    mediaDuration > 0 ? mediaDuration : ((snap.clipId !== null ? durationOf?.(snap.clipId) : null) ?? 0) / 1000,
  );
  let loadError = $state('');
  let autoAdvance = $state(true);
  let playing = $state(false);
  /** The clip the engine has been asked for (kept in step with auto-advance). */
  let current: string | null = null;
  let chain: Promise<void> = Promise.resolve();

  const view = $derived(describeIntegrity(snap, { zone, cameraName }));
  const mp4Profile = $derived(profile ?? detectProfile());

  onMount(() => {
    if (!video) return;
    const v = video;
    fsMode = fullscreenMode(v);
    const unwatch = frame ? watchFullscreen(frame, v, (on) => (fullscreen = on)) : () => {};
    const p = factory(v, client as WorkerClient, { profile: mp4Profile });
    const off = p.onState((s) => {
      snap = s;
      if (s.clipId !== null) current = s.clipId;
      onState?.(s);
    });
    // A context started outside a click would stay suspended, so only an earlier "on" is applied.
    if (soundOn) p.setSound(true);
    player = p;
    return () => {
      clearTimeout(savedTimer);
      unwatch();
      off();
      p.destroy();
    };
  });

  $effect(() => {
    player?.setAutoAdvance(autoAdvance);
  });

  function play(v: HTMLVideoElement): void {
    v.play().catch((e: unknown) => {
      // Autoplay can be refused; the viewer then presses play.
      if (!(e instanceof DOMException && e.name === 'NotAllowedError')) loadError = 'Could not start playback.';
    });
  }

  async function go(p: Player, v: HTMLVideoElement, t: Target): Promise<void> {
    loadError = '';
    try {
      const sameClip = t.clipId === current;
      if (!sameClip) {
        current = t.clipId;
        await p.load(t.clipId);
      }
      if (sameClip || t.offsetMs > 0) await p.seek(t.offsetMs);
      play(v);
    } catch (e) {
      current = null;
      loadError = e instanceof Error && e.name === 'ErrNoKey' ? 'Import your key first.' : 'Could not open this recording.';
    }
  }

  $effect(() => {
    const t = cue;
    untrack(() => {
      const p = player;
      const v = video;
      if (!t || !p || !v) return;
      chain = chain.then(() => go(p, v, t));
    });
  });

  export function togglePlay(): void {
    if (!video) return;
    if (video.paused) play(video);
    else video.pause();
  }

  /** Moves the playhead by `deltaMs`, never before the start. */
  export function skip(deltaMs: number): void {
    if (!video || !player) return;
    const to = Math.max(0, video.currentTime * 1000 + deltaMs);
    void player.seek(to);
  }

  // Could not open (message set) is shown as unchecked, not as verifying.
  const sealState = $derived<SealState>(snap.integrity === 'verifying' ? (snap.message !== null ? 'unchecked' : 'verifying') : snap.integrity);
  const tone = $derived(
    view.kind === 'tampered' ? 'border-void' : view.kind === 'mismatch' || view.kind === 'incomplete' ? 'border-amber' : 'border-muted',
  );

  let moreOpen = $state(false);
  /** Called straight from the click: the engine starts its AudioContext inside this gesture. */
  function toggleSound(): void {
    const next = !soundOn;
    player?.setSound(next);
    soundOn = next;
    saveSoundPref(next);
  }
  const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

  const icon =
    'inline-flex h-10 w-10 max-md:h-11 max-md:w-11 items-center justify-center rounded border border-rule text-ink hover:bg-ground disabled:cursor-not-allowed disabled:opacity-40';
  const ghost =
    'inline-flex items-center gap-2 rounded border border-rule px-3 py-2 max-md:min-h-11 text-sm text-ink hover:bg-ground disabled:cursor-not-allowed disabled:opacity-40';
  /** The phone bar is also used above md (phone landscape), so its 44 px targets follow `compact`, not the width. */
  const tap = $derived(compact ? 'min-h-11' : '');

  // ---- export --------------------------------------------------------------

  let exporting = $state(false);
  let exportBusy = $state(false);
  let exportBytes = $state(0);
  let exportError = $state('');
  let saved = $state(false);
  let savedTimer: ReturnType<typeof setTimeout> | undefined;

  const header = $derived(snap.header);
  /** Wall time of the frame on screen. */
  const wall = $derived(header ? formatClock(header.startUnixMs + pos * 1000, zone, true) : '');
  const exportName = $derived(
    header ? exportFilename(header.cameraId, header.startUnixMs, zone, snap.integrity === 'incomplete') : '',
  );
  const exportable = $derived(canExport(snap.integrity) && snap.clipId !== null && header !== null);
  const exportHint = $derived(
    exportable
      ? 'Save an unencrypted copy'
      : snap.integrity === 'tampered'
        ? 'This recording failed verification and cannot be exported'
        : 'Export is available once the recording is verified',
  );

  function openExport(): void {
    video?.pause();
    clearTimeout(savedTimer);
    exportError = '';
    exportBytes = 0;
    saved = false;
    exporting = true;
  }

  async function confirmExport(): Promise<void> {
    const clipId = snap.clipId;
    if (!clipId || exportBusy) return;
    exportBusy = true;
    exportError = '';
    exportBytes = 0;
    const resumeAt = (video?.currentTime ?? 0) * 1000;
    let touched = false;
    try {
      // The save picker needs the click's user activation, so exportClip opens it before anything else.
      const res = await exportClip({
        client,
        clipId,
        filename: exportName,
        integrity: snap.integrity,
        blobMax: BLOB_MAX[mp4Profile],
        env: env ?? browserExportEnv(),
        onProgress: (n) => (exportBytes = n),
      });
      touched = res.kind === 'saved';
      if (touched) {
        saved = true;
        clearTimeout(savedTimer);
        savedTimer = setTimeout(() => {
          exporting = false;
          saved = false;
        }, 4000);
      }
    } catch (e) {
      touched = true;
      exportError =
        e instanceof ExportTooLargeError ? 'This recording is too large to save in this browser.' : 'Could not save the file. Try again.';
    } finally {
      exportBusy = false;
      // Exporting reopened the clip in the worker, which dropped the player's session: open it again where it was.
      if (touched && player && snap.clipId === clipId) {
        const p = player;
        chain = chain.then(async () => {
          try {
            await p.load(clipId);
            if (resumeAt > 0) await p.seek(resumeAt);
          } catch {
            loadError = 'Could not reopen this recording.';
          }
        });
      }
    }
  }
</script>

<svelte:window
  onclick={(e) => {
    if (speedOpen && speedBox && !speedBox.contains(e.target as Node)) speedOpen = false;
  }}
/>

<section
  bind:this={frame}
  class="flex h-full min-h-0 min-w-0 flex-col bg-plate text-ink [&:fullscreen]:bg-ground"
  aria-label="Player"
  data-testid="player-column"
>
  <div class="relative min-h-0 flex-1 overflow-hidden {snap.clipId === null ? 'bg-plate' : 'bg-black'}">
    <video
      bind:this={video}
      data-testid="player"
      data-clip-player
      muted
      playsinline
      onplay={(e) => {
        playing = true;
        applyRate(e.currentTarget);
      }}
      onpause={() => (playing = false)}
      ontimeupdate={(e) => sync(e.currentTarget)}
      onloadedmetadata={(e) => {
        sync(e.currentTarget);
        applyRate(e.currentTarget);
      }}
      ondurationchange={(e) => sync(e.currentTarget)}
      class="aspect-video h-full w-full object-contain {snap.clipId === null ? '' : 'bg-black'}"
    ></video>
    {#if snap.clipId === null}
      <div class="absolute inset-0 flex flex-col items-center justify-center gap-3 text-sm text-muted">
        <span class="opacity-60"><Seal seed="zview" state="unchecked" size={40} decorative /></span>
        <span>Select a recording</span>
      </div>
    {/if}
    {#if view.spinner}
      <div
        class="absolute inset-0 flex items-center justify-center bg-[color-mix(in_srgb,var(--z-ov-ground)_70%,transparent)] text-sm"
        style="{overVideo};color: var(--z-ov-ink)"
        role="progressbar"
        aria-label="Verifying"
      >
        <span class="animate-pulse">{view.text}</span>
      </div>
    {/if}
    {#if header}
      <div
        data-testid="badge"
        class="ov-btn absolute top-3 left-3 rounded-lg max-w-[calc(100%-6rem)] truncate px-2.5 py-1.5 text-[13px] max-md:top-2 max-md:left-2"
        style={overVideo}
      >
        Recording · {cameraName(header.cameraId)} <span class="num">{formatClock(header.startUnixMs, zone, true)}</span>
        {#each snap.clipId !== null && triggersOf ? triggersOf(snap.clipId) : [] as t (t)}
          {@const st = triggerStyle(t)}
          <span
            role="img"
            aria-label={st.label}
            title={st.label}
            style:background={st.color}
            class="ml-1 inline-block min-w-5 rounded px-1 text-center text-xs font-bold text-on-trigger">{st.glyph}</span
          >
        {/each}
      </div>
    {/if}
    {#if onLive}
      <button
        type="button"
        class="ov-btn absolute top-3 right-3 rounded-full inline-flex h-9 items-center gap-2 px-3 text-sm max-md:top-2 max-md:right-2 max-md:h-11"
        style={overVideo}
        aria-label="Back to live"
        onclick={onLive}
      >
        <span aria-hidden="true" class="size-2 rounded-full bg-(--z-ov-line)"></span>Live
      </button>
    {/if}
  </div>

  {#snippet integrityRow()}
    <span data-testid="integrity" data-kind={view.kind} class="flex items-center gap-2 text-sm" title={view.title}>
      {#if snap.clipId !== null}
        <Seal seed={snap.clipId} state={sealState} showLabel />
      {/if}
    </span>
  {/snippet}
  {#snippet autoplay()}
    <label class="flex items-center gap-1 text-sm text-muted max-md:min-h-11 {tap}">
      <input type="checkbox" bind:checked={autoAdvance} />
      <span>Autoplay next</span>
    </label>
  {/snippet}
  <!-- Export saves plaintext: the button only opens the export dialog, which says so before anything is saved. -->
  {#snippet exportButton()}
    <button
      type="button"
      class="{ghost} {tap}"
      aria-label="Export"
      disabled={!exportable}
      title={exportHint}
      onclick={() => {
        moreOpen = false;
        openExport();
      }}
    >
      <Icon name="download" size={16} />
      {#if compact}<span>Export</span>{/if}
    </button>
  {/snippet}
  {#snippet soundButton()}
    {#if snap.hasAudio}
      <button
        type="button"
        class={icon}
        aria-label={soundOn ? 'Turn sound off' : 'Turn sound on'}
        title={soundOn ? 'Turn sound off' : 'Turn sound on'}
        onclick={toggleSound}><Icon name={soundOn ? 'sound-on' : 'sound-off'} /></button
      >
    {/if}
  {/snippet}
  {#snippet speedChoices()}
    <div role="group" aria-label="Playback speed" class="flex {compact ? 'flex-wrap' : 'flex-col'} gap-1">
      {#each SPEEDS as s (s)}
        <button
          type="button"
          class="rounded px-2 py-1 text-sm num max-md:min-h-11 max-md:min-w-11 {compact ? 'min-h-11 min-w-11' : ''} hover:bg-ground {s === rate ? 'bg-ground font-semibold text-ink' : 'text-muted'}"
          aria-pressed={s === rate}
          onclick={() => pickSpeed(s)}>{s}×</button
        >
      {/each}
    </div>
  {/snippet}

  <div role="group" aria-label="Player controls" class="flex items-center border-t border-rule py-2 {compact ? 'flex-nowrap gap-1 px-2' : 'flex-wrap gap-x-1.5 gap-y-1 px-3'}">
    <button type="button" class={icon} title="Previous clip (J)" aria-label="Previous clip" disabled={!onPrev} onclick={onPrev}>
      <Icon name="prev" />
    </button>
    {#if !compact}
      <button type="button" class={icon} title="Back 10 seconds (Left)" aria-label="Back 10 seconds" onclick={() => skip(-10_000)}>
        <Icon name="back10" />
      </button>
    {/if}
    <button type="button" class={icon} title="Play or pause (Space)" aria-label={playing ? 'Pause' : 'Play'} onclick={togglePlay}>
      <Icon name={playing ? 'pause' : 'play'} />
    </button>
    {#if !compact}
      <button type="button" class={icon} title="Forward 10 seconds (Right)" aria-label="Forward 10 seconds" onclick={() => skip(10_000)}>
        <Icon name="fwd10" />
      </button>
    {/if}
    <button type="button" class={icon} title="Next clip (K)" aria-label="Next clip" disabled={!onNext} onclick={onNext}>
      <Icon name="next" />
    </button>
    <span data-testid="clock" class="flex {compact ? 'flex-col leading-tight' : 'items-baseline gap-1.5'} whitespace-nowrap px-1">
      <span class="num text-[15px] font-semibold">{wall}</span>
      <span class="num text-xs text-muted">{mmss(pos)} / {mmss(duration)}</span>
    </span>
    <input
      type="range"
      aria-label="Position"
      class="flex-1 max-md:h-11 {compact ? 'min-w-0' : 'min-w-16'}"
      min="0"
      max={duration}
      step="any"
      value={pos}
      disabled={duration === 0}
      oninput={(e) => {
        pos = Number(e.currentTarget.value);
        void player?.seek(pos * 1000);
      }}
    />
    {#if !compact}
      <div bind:this={speedBox} class="relative" role="presentation" onkeydown={(e) => e.key === 'Escape' && closeMenu()}>
        <button
          bind:this={speedBtn}
          type="button"
          class="{ghost} num"
          aria-label="Playback speed"
          title="Playback speed"
          aria-expanded={speedOpen}
          onclick={() => (speedOpen = !speedOpen)}>{rate}×</button
        >
        {#if speedOpen}
          <div class="absolute bottom-full left-0 z-10 mb-1 rounded border border-rule bg-plate p-1">
            {@render speedChoices()}
          </div>
        {/if}
      </div>
      {@render soundButton()}
      {@render autoplay()}
      {@render integrityRow()}
      {@render exportButton()}
    {:else}
      {@render soundButton()}
    {/if}
    {#if fsMode !== 'none'}
      <button
        type="button"
        class={icon}
        aria-label={fullscreen ? 'Exit full screen' : 'Full screen'}
        onclick={() => frame && video && toggleFullscreen(frame, video)}
        ><Icon name={fullscreen ? 'fullscreen-exit' : 'fullscreen'} /></button
      >
    {/if}
  </div>
  {#if compact}
    <div class="relative flex items-center justify-between gap-2 px-3 pb-2" role="presentation" onkeydown={(e) => e.key === 'Escape' && closeMenu()}>
      {@render integrityRow()}
      <button
        bind:this={moreBtn}
        type="button"
        class={icon}
        aria-label="More"
        aria-expanded={moreOpen}
        onclick={() => (moreOpen = !moreOpen)}>⋯</button
      >
      {#if moreOpen}
        <!-- Three rows, so it fits above the bar in phone landscape (667×375). -->
        <div
          role="group"
          aria-label="More controls"
          class="absolute right-3 bottom-full z-10 flex flex-col items-stretch gap-1 rounded border border-rule bg-plate p-2"
        >
          <div class="flex gap-1">
            <button type="button" class="{ghost} {tap} flex-1" aria-label="Back 10 seconds" onclick={() => skip(-10_000)}>
              <Icon name="back10" size={16} /><span>Back 10 s</span>
            </button>
            <button type="button" class="{ghost} {tap} flex-1" aria-label="Forward 10 seconds" onclick={() => skip(10_000)}>
              <Icon name="fwd10" size={16} /><span>Forward 10 s</span>
            </button>
          </div>
          {@render speedChoices()}
          <div class="flex items-center justify-between gap-3">
            {@render autoplay()}
            {@render exportButton()}
          </div>
        </div>
      {/if}
    </div>
  {/if}

  {#if view.kind !== 'verified' && snap.clipId !== null && !view.spinner}
    <div
      role={view.kind === 'incomplete' ? 'status' : 'alert'}
      class="mx-3 mb-2 flex items-start gap-2 rounded border bg-ground px-3 py-2 text-sm text-ink {tone}"
    >
      <Seal seed={snap.clipId} state={sealState} size={20} decorative />
      <p>
        {view.text}
        {#if view.next}
          {#if view.nextHref}<a href={view.nextHref} class="inline-flex items-center underline max-md:min-h-11">{view.next}</a>{:else}<span class="block text-muted">{view.next}</span>{/if}
        {/if}
      </p>
    </div>
  {/if}
  {#if snap.message}
    <p role="status" class="px-3 pb-2 text-sm text-amber">{snap.message}</p>
  {/if}
  {#if loadError}
    <p role="alert" class="px-3 pb-2 text-sm text-void">{loadError}</p>
  {/if}
</section>

{#if exporting}
  <ExportDialog
    filename={exportName}
    busy={exportBusy}
    bytes={exportBytes}
    error={exportError}
    {saved}
    onConfirm={() => void confirmExport()}
    onCancel={() => {
      clearTimeout(savedTimer);
      saved = false;
      exporting = false;
    }}
  />
{/if}

<style>
  .ov-btn {
    border: 1px solid var(--z-ov-rule);
    background: color-mix(in srgb, var(--z-ov-ground) 70%, transparent);
    color: var(--z-ov-ink);
  }
  input[type='range'] {
    accent-color: var(--z-line);
  }
  /* Phones: a 44 px hit area around a thin drawn track. */
  @media (max-width: 767px) {
    input[type='range'] {
      appearance: none;
      background: transparent;
    }
    input[type='range']::-webkit-slider-runnable-track {
      height: 4px;
      border-radius: 2px;
      background: color-mix(in srgb, var(--z-muted) 60%, transparent);
    }
    input[type='range']::-moz-range-track {
      height: 4px;
      border-radius: 2px;
      background: color-mix(in srgb, var(--z-muted) 60%, transparent);
    }
    input[type='range']::-webkit-slider-thumb {
      appearance: none;
      width: 20px;
      height: 20px;
      margin-top: -8px;
      border-radius: 50%;
      border: 0;
      background: var(--z-line);
    }
    input[type='range']::-moz-range-thumb {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      border: 0;
      background: var(--z-line);
    }
  }
</style>
