<script lang="ts">
  // Test-only: owns a $state integrity record and mutates it in place, like the real producers.
  import type { ComponentProps } from 'svelte';
  import type { IntegrityState } from '../player/engine';
  import Timeline from './Timeline.svelte';

  let { ...rest }: Record<string, unknown> = $props();
  const integrity: Record<string, IntegrityState | undefined> = $state({});
  export function mark(id: string, s: IntegrityState): void {
    integrity[id] = s;
  }
</script>

<Timeline {...(rest as unknown as ComponentProps<typeof Timeline>)} {integrity} />
