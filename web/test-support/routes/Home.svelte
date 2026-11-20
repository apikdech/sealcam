<script lang="ts">
  import type { Status } from '../../src/worker/schemas';
  let { status = null }: { status?: Status | null } = $props();
</script>

<div data-testid="route-home" data-status={status ? status.updated_at : ''}></div>
