<script lang="ts">
  import type { ComponentProps } from 'svelte';
  import KeyImport from './KeyImport.svelte';

  type Props = Pick<ComponentProps<typeof KeyImport>, 'client' | 'now' | 'scanner'> & {
    onImported: (keyId: string) => void;
  };

  let { client, now, scanner, onImported }: Props = $props();
</script>

<main class="mx-auto max-w-xl space-y-6 p-4">
  <h1 class="text-2xl font-semibold">Add the family key</h1>
  <p>The key stays on this device. The server never sees it or your video.</p>
  <KeyImport {client} {now} {scanner} {onImported} />
</main>
