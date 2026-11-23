<script lang="ts">
  import Icon from './Icon.svelte';

  interface Props {
    canLock: boolean;
    onLock: () => void;
  }

  let { canLock, onLock }: Props = $props();

  const uid = $props.id();
  const menuId = `key-menu-${uid}`;
  let open = $state(false);
  let root: HTMLDivElement | undefined = $state();
  let trigger: HTMLButtonElement | undefined = $state();

  function close() {
    open = false;
    trigger?.focus();
  }

  function onkeydown(e: KeyboardEvent) {
    if (open && e.key === 'Escape') close();
  }

  function onwindowpointerdown(e: Event) {
    if (open && root && !root.contains(e.target as Node)) open = false;
  }

  function lock() {
    if (!canLock) return;
    onLock();
    close();
  }

  const item =
    'flex min-h-11 w-full items-center px-3 text-left text-sm text-ink hover:bg-ground disabled:text-muted disabled:hover:bg-transparent';
</script>

<svelte:window onpointerdown={onwindowpointerdown} />

<div bind:this={root} class="relative inline-block" {onkeydown} role="presentation">
  <button
    bind:this={trigger}
    type="button"
    aria-label="Key and lock"
    aria-haspopup="menu"
    aria-expanded={open}
    aria-controls={open ? menuId : undefined}
    class="inline-flex h-11 min-w-11 items-center justify-center text-ink"
    onclick={() => (open = !open)}
  >
    <Icon name="key" />
  </button>
  {#if open}
    <div
      id={menuId}
      role="menu"
      class="absolute right-0 top-full z-10 w-44 overflow-hidden rounded-[10px] border border-rule bg-plate"
    >
      <button type="button" role="menuitem" class={item} disabled={!canLock} onclick={lock}>
        Lock now
      </button>
      <a role="menuitem" class={item} href="#/key" onclick={() => (open = false)}>Manage keys</a>
    </div>
  {/if}
</div>
