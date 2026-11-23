<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { Status } from '../../src/worker/schemas';
  let { status = null, topRight, notices }: { status?: Status | null; topRight: Snippet; notices?: Snippet } = $props();
</script>

<div data-testid="route-watch" data-status={status ? status.updated_at : ''}>{@render topRight()}{@render notices?.()}</div>
