<script lang="ts">
  import type { Camera, Status } from '../../worker/schemas';
  import LiveTile from './LiveTile.svelte';
  import type { WhepClient } from './whep';

  interface Props {
    cameras: Camera[];
    client: WhepClient;
    zone: string;
    status: Status | null;
    /** A grid tile was tapped: show that camera alone. */
    onFocus?: (cameraId: string) => void;
    /** One camera picked from several: the live bar offers a way back to them all. */
    onAll?: () => void;
  }

  let { cameras, client, zone, status, onFocus, onAll }: Props = $props();

  const down = $derived(new Set((status?.cameras ?? []).filter((c) => c.rtsp === 'down').map((c) => c.id)));
</script>

<div class="flex h-full flex-col" data-testid="live-grid">
  {#if cameras.length === 1}
    <LiveTile single cameraId={cameras[0]!.id} name={cameras[0]!.name} {client} {zone} offline={down.has(cameras[0]!.id)} {onAll} />
  {:else}
    <!-- The tiles share the stage in equal cells (2 side by side, 3–4 as 2×2). Where the stage is free
         to size itself (phones) it takes the shape of those 16:9 pictures; else it fills what is left. -->
    <div class="tiles min-h-0 grow" style:aspect-ratio={cameras.length === 2 ? '32 / 9' : '16 / 9'}>
      <div class="grid h-full grid-cols-2 gap-1 md:gap-3 {cameras.length === 2 ? '' : 'four grid-rows-2'}" style:--n={cameras.length}>
        {#each cameras as cam (cam.id)}
          <LiveTile cameraId={cam.id} name={cam.name} {client} {zone} offline={down.has(cam.id)} onFocus={() => onFocus?.(cam.id)} />
        {/each}
      </div>
    </div>
    <p class="border-t border-rule bg-plate px-3 py-1.5 text-sm text-muted">Live now · tap a camera to see it alone</p>
  {/if}
</div>

<style>
  .tiles {
    container-type: size;
  }
  /* A very wide, short stage (a short phone, a phone in landscape) has no room for two rows:
     one row of 3–4 shows each picture larger. */
  @container (min-aspect-ratio: 32 / 9) {
    .four {
      grid-template-columns: repeat(var(--n), minmax(0, 1fr));
      grid-template-rows: minmax(0, 1fr);
    }
  }
</style>
