<script lang="ts">
  import type { Snippet } from 'svelte';
  import { dayTitle, daySubtitle, shiftDay } from '../dashboard/day';
  import Icon from './Icon.svelte';

  interface Props {
    day: string;
    todayDay: string;
    zone: string;
    onDay: (day: string) => void;
    /** The popover the title opens; it is handed a function that closes it. */
    menu: Snippet<[() => void]>;
  }

  let { day, todayDay, zone, onDay, menu }: Props = $props();

  const uid = $props.id();
  const menuId = `day-menu-${uid}`;
  let open = $state(false);
  let root: HTMLDivElement | undefined = $state();
  let title: HTMLButtonElement | undefined = $state();

  function close() {
    open = false;
    title?.focus();
  }

  function onkeydown(e: KeyboardEvent) {
    if (open && e.key === 'Escape') close();
  }

  function onwindowpointerdown(e: Event) {
    if (open && root && !root.contains(e.target as Node)) open = false;
  }

  const btn =
    'inline-flex h-11 w-11 items-center justify-center rounded-[10px] text-ink hover:bg-plate disabled:text-muted disabled:opacity-50 md:h-9 md:w-9';
</script>

<svelte:window onpointerdown={onwindowpointerdown} />

<div bind:this={root} class="relative flex min-w-0 items-center gap-0.5" {onkeydown} role="presentation">
  <button type="button" class={btn} aria-label="Previous day" onclick={() => onDay(shiftDay(day, -1))}>
    <Icon name="chevron-left" />
  </button>
  <button
    bind:this={title}
    type="button"
    class="flex min-h-11 min-w-0 items-baseline gap-1.5 rounded-[10px] px-2 text-ink hover:bg-plate md:min-h-9"
    aria-haspopup="dialog"
    aria-expanded={open}
    aria-controls={open ? menuId : undefined}
    onclick={() => (open = !open)}
  >
    <span class="truncate text-[15px] font-semibold">{dayTitle(day, todayDay)}</span>
    <span class="truncate text-xs text-muted max-md:hidden">{daySubtitle(day, todayDay, zone)}</span>
  </button>
  <button
    type="button"
    class={btn}
    aria-label="Next day"
    disabled={day === todayDay}
    onclick={() => onDay(shiftDay(day, 1))}
  >
    <Icon name="chevron-right" />
  </button>
  {#if open}
    <div
      id={menuId}
      role="dialog"
      aria-label="Day and time zone"
      class="absolute top-full left-0 z-20 mt-1 w-72 max-w-[calc(100vw-2rem)] rounded-[10px] border border-rule bg-plate p-3"
    >
      {@render menu(close)}
    </div>
  {/if}
</div>
