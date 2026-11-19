<script lang="ts">
  import { onMount } from 'svelte';
  import type { WhepClient } from './whep';
  import { createTile, type TileSnapshot } from './tile';
  import { fullscreenMode, toggleFullscreen, watchFullscreen, type FullscreenMode } from './fullscreen';

  interface Props {
    cameraId: string;
    name?: string;
    client: WhepClient;
  }

  let { cameraId, name = cameraId, client }: Props = $props();

  let root: HTMLDivElement | undefined = $state();
  let video: HTMLVideoElement | undefined = $state();
  let snap: TileSnapshot = $state({ state: 'connecting', canUnmute: false, muted: true });

  let fsMode: FullscreenMode = $state('none');
  let fullscreen = $state(false);

  let toggle: () => void = () => {};
  let toggleFs: () => void = () => {};

  onMount(() => {
    if (!video || !root) return;
    const tile = createTile({ video, cameraId, client, onChange: (s) => (snap = s) });
    toggle = () => tile.toggleMute();
    const el = root;
    const v = video;
    fsMode = fullscreenMode(v);
    toggleFs = () => toggleFullscreen(el, v);
    const unwatch = watchFullscreen(el, v, (on) => (fullscreen = on));
    tile.start();
    return () => {
      unwatch();
      tile.destroy();
    };
  });

  const label = $derived(
    snap.state === 'live'
      ? 'Live'
      : snap.state === 'connecting'
        ? 'Connecting…'
        : snap.state === 'reconnecting'
          ? 'Reconnecting…'
          : 'Viewer limit reached',
  );
</script>

<div bind:this={root} role="group" aria-label={name} class="relative overflow-hidden rounded-lg border border-neutral-800 bg-black [&:fullscreen_video]:aspect-auto [&:fullscreen_video]:h-full" data-testid="live-tile" data-camera={cameraId} data-state={snap.state}>
  <video bind:this={video} muted playsinline autoplay ondblclick={() => toggleFs()} class="aspect-video w-full bg-black object-contain"></video>
  <div class="absolute left-2 top-2 flex items-center gap-2 text-xs">
    <span class="rounded bg-black/60 px-2 py-0.5">{name}</span>
    <span
      role="status"
      class="rounded px-2 py-0.5 {snap.state === 'live'
        ? 'bg-red-600 text-white'
        : snap.state === 'limit'
          ? 'bg-amber-600 text-white'
          : 'bg-neutral-700 text-neutral-100'}">{label}</span
    >
  </div>
  <div class="absolute bottom-2 right-2 flex gap-2">
    {#if snap.canUnmute}
      <button type="button" class="rounded bg-black/60 px-3 py-1 text-xs" aria-pressed={!snap.muted} onclick={() => toggle()}
        >{snap.muted ? 'Unmute' : 'Mute'}</button
      >
    {/if}
    {#if fsMode !== 'none'}
      <button type="button" class="rounded bg-black/60 px-3 py-1 text-xs" aria-pressed={fullscreen} onclick={() => toggleFs()}
        >{fullscreen ? 'Exit fullscreen' : 'Fullscreen'}</button
      >
    {/if}
  </div>
</div>
