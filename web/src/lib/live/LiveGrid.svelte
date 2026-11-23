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
  }

  let { cameras, client, zone, status, onFocus }: Props = $props();

  const columns = $derived(cameras.length === 2 ? 'md:grid-cols-2' : 'sm:grid-cols-2');
  const down = $derived(new Set((status?.cameras ?? []).filter((c) => c.rtsp === 'down').map((c) => c.id)));
</script>

<div class="flex h-full flex-col" data-testid="live-grid">
  {#if cameras.length === 1}
    <LiveTile single cameraId={cameras[0]!.id} name={cameras[0]!.name} {client} {zone} offline={down.has(cameras[0]!.id)} />
  {:else}
    <div class="grid min-h-0 flex-1 grid-cols-1 content-start gap-3 {columns}">
      {#each cameras as cam (cam.id)}
        <LiveTile cameraId={cam.id} name={cam.name} {client} {zone} offline={down.has(cam.id)} onFocus={() => onFocus?.(cam.id)} />
      {/each}
    </div>
    <p class="flex min-h-14 items-center border-t border-rule bg-plate px-3 py-2 text-sm text-muted max-md:min-h-15">Live now · tap a camera to see it alone</p>
  {/if}
</div>
