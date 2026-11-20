<script lang="ts">
  let { onImported }: { onImported: (keyId: string) => void } = $props();
</script>

<div data-testid="route-firstrun">
  <button type="button" onclick={() => onImported('k')}>Add key</button>
  <p>Choose: Keep it on this phone</p>
  <a href="#/">Open Home</a>
</div>
