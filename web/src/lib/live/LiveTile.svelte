<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import Icon from '../components/Icon.svelte';
  import { formatClock } from '../timeline/timezone';
  import { overVideo } from '../overVideo';
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
    /** The only camera on the stage: fills its parent and has a control bar under the video. */
    single?: boolean;
    /** Grid tile: a click on the picture asks to see this camera alone. */
    onFocus?: () => void;
    /** Test seam: builds the tile. */
    makeTile?: typeof createTile;
  }

  let { cameraId, name = cameraId, client, zone, offline = false, single = false, onFocus, makeTile = createTile }: Props = $props();

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
        if (!s.muted && !release) release = claimAudio(cameraId, () => t.mute());
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
  const icon =
    'inline-flex h-10 w-10 max-md:h-11 max-md:w-11 items-center justify-center rounded border border-rule text-ink hover:bg-plate';
  const showFs = $derived((live || fullscreen) && fsMode !== 'none');

  // Focus waits a beat so a double-click (fullscreen) can cancel it.
  let focusTimer: ReturnType<typeof setTimeout> | undefined;
  onDestroy(() => clearTimeout(focusTimer));

  function onRootClick(e: MouseEvent) {
    if (single || !onFocus) return;
    if ((e.target as Element).closest('button, a')) return;
    clearTimeout(focusTimer);
    focusTimer = setTimeout(() => onFocus?.(), 250);
  }
  // The announced sentence: never includes the countdown, so it does not change as time passes.
  const sentence = $derived(
    snap.state === 'live'
      ? 'Camera is live.'
      : snap.state === 'connecting'
        ? 'Connecting…'
        : snap.state === 'reconnecting'
          ? "Can't reach the camera. Trying again."
          : snap.state === 'limit'
            ? 'Too many people are watching. zview tries again.'
            : snap.state === 'locked'
              ? 'Key locked.'
              : 'Camera offline. zview reconnects when it is back.',
  );
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<div
  bind:this={root}
  role="group"
  aria-label={name}
  class="relative overflow-hidden rounded-lg border border-rule bg-ground [&:fullscreen_video]:aspect-auto [&:fullscreen_video]:h-full [&:fullscreen>[data-stage]]:h-full {single
    ? 'flex h-full flex-col'
    : onFocus
      ? 'cursor-pointer'
      : ''}"
  data-testid="live-tile"
  data-camera={cameraId}
  data-state={snap.state}
  style={overVideo}
  onclick={onRootClick}
>
  <span role="status" class="sr-only">{sentence}</span>
  <div data-stage class="relative {single ? 'min-h-0 flex-1' : ''}">
    <video
      bind:this={video}
      muted
      playsinline
      autoplay
      ondblclick={() => {
        clearTimeout(focusTimer);
        if (live || fullscreen) toggleFs();
      }}
      class="w-full bg-ground object-contain {single ? 'h-full min-h-0' : 'aspect-video'}"
    ></video>

    {#if single}
      <div class="absolute top-3 left-3 flex items-center gap-2 text-(--z-ov-ink) max-md:top-2 max-md:left-2">
        {#if live}
          <span class="rounded bg-(--z-ov-line) px-2 py-0.5 text-xs font-semibold tracking-wider text-(--z-ov-ground)">Live</span>
        {/if}
        <span class="truncate font-semibold">{name}</span>
        {#if live}
          <span class="num text-sm text-(--z-ov-muted)">as of {formatClock(nowMs, zone, true)}</span>
        {/if}
      </div>
    {/if}

    {#if !live}
      <div class="ov-panel absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center text-(--z-ov-ink)">
        <p aria-hidden="true">
          {#if snap.state === 'connecting'}
            Connecting…
          {:else if snap.state === 'reconnecting'}
            Can't reach the camera. Trying again{#if seconds > 0}<span class="num"> in {seconds} s.</span>{:else}…{/if}
          {:else if snap.state === 'limit'}
            Too many people are watching. zview tries again{#if seconds > 0}<span class="num"> in {seconds} s.</span>{:else}…{/if}
          {:else if snap.state === 'locked'}
            Key locked.
          {:else}
            Camera offline. zview reconnects when it is back.
          {/if}
        </p>
        {#if snap.state === 'reconnecting' || snap.state === 'limit'}
          <button type="button" class="ov-btn min-h-11 min-w-11 px-4" onclick={() => tile?.tryNow()}>Try now</button>
        {:else if snap.state === 'locked'}
          <a href="#/key" class="ov-btn inline-flex min-h-11 min-w-11 items-center px-4">Unlock</a>
        {/if}
      </div>
    {/if}
  </div>

  {#if single}
    <div role="group" aria-label="Live controls" class="flex items-center justify-between gap-x-2 px-3 py-2">
      <span class="text-sm text-muted">Live now</span>
      <div class="flex items-center gap-2">
        {#if snap.canUnmute}
          <button
            type="button"
            class={icon}
            aria-label={snap.muted ? 'Turn sound on' : 'Turn sound off'}
            onclick={() => toggle()}><Icon name={snap.muted ? 'sound-off' : 'sound-on'} /></button
          >
        {/if}
        {#if showFs}
          <button
            type="button"
            class={icon}
            aria-label={fullscreen ? 'Exit full screen' : 'Full screen'}
            onclick={() => toggleFs()}><Icon name={fullscreen ? 'fullscreen-exit' : 'fullscreen'} /></button
          >
        {/if}
      </div>
    </div>
  {:else}
    <div class="scrim absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 px-3 py-2.5 text-(--z-ov-ink)">
      <div class="flex min-w-0 flex-col">
        <span class="truncate font-semibold">{name}</span>
        {#if live}
          <span class="num text-sm text-(--z-ov-muted)">as of {formatClock(nowMs, zone, true)}</span>
        {/if}
      </div>
      <div class="flex items-center gap-2">
        {#if live}
          <span class="rounded bg-(--z-ov-line) px-2 py-0.5 text-xs font-semibold tracking-wider text-(--z-ov-ground)">Live</span>
        {/if}
        {#if snap.canUnmute}
          <button
            type="button"
            class="ov-btn inline-flex size-11 items-center justify-center"
            aria-label={snap.muted ? 'Turn sound on' : 'Turn sound off'}
            onclick={() => toggle()}><Icon name={snap.muted ? 'sound-off' : 'sound-on'} /></button
          >
        {/if}
        {#if showFs}
          <button
            type="button"
            class="ov-btn inline-flex size-11 items-center justify-center"
            aria-label={fullscreen ? 'Exit full screen' : 'Full screen'}
            onclick={() => toggleFs()}><Icon name={fullscreen ? 'fullscreen-exit' : 'fullscreen'} /></button
          >
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  /* The one gradient allowed: it keeps the bottom bar legible over any picture. */
  .scrim {
    background: linear-gradient(transparent, color-mix(in srgb, var(--z-ov-ground) 85%, transparent));
  }
  .ov-panel {
    background: color-mix(in srgb, var(--z-ov-ground) 70%, transparent);
  }
  .ov-btn {
    border: 1px solid var(--z-ov-rule);
    border-radius: 10px;
    background: color-mix(in srgb, var(--z-ov-ground) 70%, transparent);
    color: var(--z-ov-ink);
  }
</style>
