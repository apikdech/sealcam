<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from '../components/Icon.svelte';
  import { formatClock } from '../timeline/timezone';
  import { claimAudio } from './audioFocus';
  import type { WhepClient } from './whep';
  import { createTile, type Tile, type TileSnapshot } from './tile';
  import { fullscreenMode, toggleFullscreen, watchFullscreen, type FullscreenMode } from './fullscreen';

  interface Props {
    cameraId: string;
    name?: string;
    client: WhepClient;
    /** Display zone for the "as of" clock. */
    zone: string;
    /** The relay reports this camera down. */
    offline?: boolean;
    /** Test seam: builds the tile. */
    makeTile?: typeof createTile;
  }

  let { cameraId, name = cameraId, client, zone, offline = false, makeTile = createTile }: Props = $props();

  let root: HTMLDivElement | undefined = $state();
  let video: HTMLVideoElement | undefined = $state();
  let snap: TileSnapshot = $state({ state: 'connecting', canUnmute: false, muted: true, retryAt: null });
  let nowMs = $state(Date.now());
  let tile: Tile | undefined = $state();

  let fsMode: FullscreenMode = $state('none');
  let fullscreen = $state(false);

  let toggle: () => void = () => {};
  let toggleFs: () => void = () => {};

  onMount(() => {
    if (!video || !root) return;
    let release: (() => void) | null = null;
    const t = makeTile({
      video,
      cameraId,
      client,
      onChange: (s) => {
        snap = s;
        nowMs = Date.now();
        if (!s.muted && !release) release = claimAudio(cameraId, () => t.toggleMute());
        else if (s.muted && release) {
          release();
          release = null;
        }
      },
    });
    toggle = () => t.toggleMute();
    const el = root;
    const v = video;
    fsMode = fullscreenMode(v);
    toggleFs = () => toggleFullscreen(el, v);
    const unwatch = watchFullscreen(el, v, (on) => (fullscreen = on));
    t.start();
    tile = t;
    return () => {
      unwatch();
      release?.();
      t.destroy();
    };
  });

  $effect(() => {
    tile?.setOffline(offline);
  });

  // One ticker drives the "as of" clock and the retry countdown.
  const ticking = $derived(snap.state === 'live' || snap.state === 'reconnecting' || snap.state === 'limit');
  $effect(() => {
    if (!ticking) return;
    nowMs = Date.now();
    const id = setInterval(() => (nowMs = Date.now()), 1000);
    return () => clearInterval(id);
  });

  const seconds = $derived(snap.retryAt === null ? 0 : Math.max(0, Math.ceil((snap.retryAt - nowMs) / 1000)));
  const live = $derived(snap.state === 'live');
</script>

<div
  bind:this={root}
  role="group"
  aria-label={name}
  class="relative overflow-hidden rounded-lg border border-rule bg-ground [&:fullscreen_video]:aspect-auto [&:fullscreen_video]:h-full"
  data-testid="live-tile"
  data-camera={cameraId}
  data-state={snap.state}
>
  <video bind:this={video} muted playsinline autoplay ondblclick={() => live && toggleFs()} class="aspect-video w-full bg-ground object-contain"></video>

  {#if !live}
    <div class="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-ground/70 p-4 text-center text-ink">
      <p>
        {#if snap.state === 'connecting'}
          <span role="status">Connecting…</span>
        {:else if snap.state === 'reconnecting'}
          <span role="status">Can't reach the camera. Trying again{seconds > 0 ? '' : '…'}</span>{#if seconds > 0}<span aria-hidden="true" class="num"> in {seconds} s.</span>{/if}
        {:else if snap.state === 'limit'}
          <span role="status">Too many people are watching. zview tries again{seconds > 0 ? '' : '…'}</span>{#if seconds > 0}<span aria-hidden="true" class="num"> in {seconds} s.</span>{/if}
        {:else if snap.state === 'locked'}
          <span role="status">Key locked.</span>
        {:else}
          <span role="status">Camera offline. zview reconnects when it is back.</span>
        {/if}
      </p>
      {#if snap.state === 'reconnecting' || snap.state === 'limit'}
        <button
          type="button"
          class="min-h-11 min-w-11 rounded-lg border border-rule bg-plate px-4 text-ink"
          onclick={() => tile?.tryNow()}>Try now</button
        >
      {:else if snap.state === 'locked'}
        <a href="#/key" class="inline-flex min-h-11 min-w-11 items-center rounded-lg border border-rule bg-plate px-4 text-ink">Unlock</a>
      {/if}
    </div>
  {/if}

  <div class="scrim absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 px-3 py-2.5 text-ink">
    <div class="flex min-w-0 flex-col">
      <span class="truncate font-semibold">{name}</span>
      {#if live}
        <span class="num text-sm text-muted">as of {formatClock(nowMs, zone, true)}</span>
      {/if}
    </div>
    <div class="flex items-center gap-2">
      {#if live}
        <span class="rounded bg-line px-2 py-0.5 text-xs font-semibold tracking-wider text-ground">Live</span>
      {/if}
      {#if snap.canUnmute}
        <button
          type="button"
          class="inline-flex size-11 items-center justify-center rounded-[10px] border border-rule bg-ground/70 text-ink"
          aria-label={snap.muted ? 'Turn sound on' : 'Turn sound off'}
          onclick={() => toggle()}><Icon name={snap.muted ? 'sound-off' : 'sound-on'} /></button
        >
      {/if}
      {#if live && fsMode !== 'none'}
        <button
          type="button"
          class="inline-flex size-11 items-center justify-center rounded-[10px] border border-rule bg-ground/70 text-ink"
          aria-label={fullscreen ? 'Exit full screen' : 'Full screen'}
          onclick={() => toggleFs()}><Icon name={fullscreen ? 'fullscreen-exit' : 'fullscreen'} /></button
        >
      {/if}
    </div>
  </div>
</div>

<style>
  /* The one gradient allowed: it keeps the bottom bar legible over any picture. */
  .scrim {
    background: linear-gradient(transparent, color-mix(in srgb, var(--z-ground) 85%, transparent));
  }
</style>
