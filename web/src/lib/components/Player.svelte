<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { browserExportEnv, canExport, ExportTooLargeError, exportClip, exportFilename, type ExportEnv } from '../export';
  import { BLOB_MAX, detectProfile, type Profile } from '../player/buffer';
  import { createPlayer, type Player, type PlayerState } from '../player/engine';
  import { describeIntegrity, initialState } from '../player/status';
  import type { WorkerClient } from '../workerClient';
  import ExportDialog from './ExportDialog.svelte';
  import Icon from './Icon.svelte';
  import { overVideo } from '../overVideo';
  import Seal from '../seal/Seal.svelte';
  import type { SealState } from '../seal/rosette';
  import { formatClock } from '../timeline/timezone';

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
    /** When set, a "Back to live" button is shown. */
    onBack?: () => void;
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
    onBack,
    onPrev,
    onNext,
  }: Props = $props();

  let video: HTMLVideoElement | undefined = $state();
  let player: Player | undefined = $state();
  let snap: PlayerState = $state(initialState());
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
    const p = factory(video, client as WorkerClient, { profile: mp4Profile });
    const off = p.onState((s) => {
      snap = s;
      if (s.clipId !== null) current = s.clipId;
      onState?.(s);
    });
    player = p;
    return () => {
      clearTimeout(savedTimer);
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

  const icon =
    'inline-flex h-10 w-10 max-md:h-11 max-md:w-11 items-center justify-center rounded border border-rule text-ink hover:bg-plate disabled:cursor-not-allowed disabled:opacity-40';
  const ghost =
    'inline-flex items-center gap-2 rounded border border-rule px-3 py-2 max-md:min-h-11 text-sm text-ink hover:bg-plate disabled:cursor-not-allowed disabled:opacity-40';

  // ---- export --------------------------------------------------------------

  let exporting = $state(false);
  let exportBusy = $state(false);
  let exportBytes = $state(0);
  let exportError = $state('');
  let saved = $state(false);
  let savedTimer: ReturnType<typeof setTimeout> | undefined;

  const header = $derived(snap.header);
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

<section class="min-w-0" aria-label="Player">
  {#if onBack}
    <button type="button" class="{ghost} mb-2" onclick={onBack}>
      <Icon name="home" size={16} />
      <span>Back to live</span>
    </button>
  {/if}
  <div class="relative overflow-hidden rounded-lg border border-rule bg-black">
    <video
      bind:this={video}
      data-testid="player"
      data-clip-player
      controls
      muted
      playsinline
      onplay={() => (playing = true)}
      onpause={() => (playing = false)}
      class="aspect-video w-full bg-black object-contain"
    ></video>
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
  </div>

  <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
    <span data-testid="integrity" data-kind={view.kind} class="flex items-center gap-2" title={view.title}>
      {#if snap.clipId === null}
        <span class="text-muted">Select a recording</span>
      {:else}
        <Seal seed={snap.clipId} state={sealState} showLabel />
      {/if}
    </span>
    {#if header}
      <span class="num text-muted">{cameraName(header.cameraId)}, {formatClock(header.startUnixMs, zone, true)}</span>
    {/if}
    <label class="ml-auto flex items-center gap-1 text-muted">
      <input type="checkbox" bind:checked={autoAdvance} />
      <span>Autoplay next</span>
    </label>
  </div>

  <div class="mt-2 flex items-center gap-2">
    <div class="flex items-center gap-1" role="group" aria-label="Transport">
      <button type="button" class={icon} title="Previous clip (J)" aria-label="Previous clip" disabled={!onPrev} onclick={onPrev}>
        <Icon name="prev" />
      </button>
      <button type="button" class={icon} title="Back 10 seconds (Left)" aria-label="Back 10 seconds" onclick={() => skip(-10_000)}>
        <Icon name="back10" />
      </button>
      <button type="button" class={icon} title="Play or pause (Space)" aria-label={playing ? 'Pause' : 'Play'} onclick={togglePlay}>
        <Icon name={playing ? 'pause' : 'play'} />
      </button>
      <button type="button" class={icon} title="Forward 10 seconds (Right)" aria-label="Forward 10 seconds" onclick={() => skip(10_000)}>
        <Icon name="fwd10" />
      </button>
      <button type="button" class={icon} title="Next clip (K)" aria-label="Next clip" disabled={!onNext} onclick={onNext}>
        <Icon name="next" />
      </button>
    </div>
    <!-- Export saves plaintext: it sits apart from the routine controls. -->
    <button type="button" class="{ghost} ml-auto" disabled={!exportable} title={exportHint} onclick={openExport}>
      <Icon name="download" size={16} />
      <span>Export</span>
    </button>
  </div>

  {#if view.kind !== 'verified' && snap.clipId !== null && !view.spinner}
    <div
      role={view.kind === 'incomplete' ? 'status' : 'alert'}
      class="mt-2 flex items-start gap-2 rounded border bg-plate px-3 py-2 text-sm text-ink {tone}"
    >
      <Seal seed={snap.clipId} state={sealState} size={20} />
      <p>
        {view.text}
        {#if view.next}
          {#if view.nextHref}<a href={view.nextHref} class="underline">{view.next}</a>{:else}<span class="block text-muted">{view.next}</span>{/if}
        {/if}
      </p>
    </div>
  {/if}
  {#if snap.message}
    <p role="status" class="mt-2 text-sm text-amber">{snap.message}</p>
  {/if}
  {#if loadError}
    <p role="alert" class="mt-2 text-sm text-void">{loadError}</p>
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
