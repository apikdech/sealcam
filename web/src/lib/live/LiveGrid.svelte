<script lang="ts">
  import type { Camera, Status } from '../../worker/schemas';
  import LiveTile from './LiveTile.svelte';
  import type { WhepClient } from './whep';

  interface Props {
    cameras: Camera[];
    client: WhepClient;
    zone: string;
    status: Status | null;
  }

  let { cameras, client, zone, status }: Props = $props();

  const columns = $derived(cameras.length <= 1 ? '' : cameras.length === 2 ? 'md:grid-cols-2' : 'sm:grid-cols-2');
  const down = $derived(new Set((status?.cameras ?? []).filter((c) => c.rtsp === 'down').map((c) => c.id)));
</script>

<div class="grid grid-cols-1 gap-3 {columns}" data-testid="live-grid">
  {#each cameras as cam (cam.id)}
    <LiveTile cameraId={cam.id} name={cam.name} {client} {zone} offline={down.has(cam.id)} />
  {/each}
</div>
