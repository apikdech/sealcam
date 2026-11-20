<script lang="ts">
  import { dayTitle, daySubtitle, shiftDay } from '../dashboard/day';
  import Icon from './Icon.svelte';

  interface Props {
    day: string;
    todayDay: string;
    zone: string;
    onDay: (day: string) => void;
  }

  let { day, todayDay, zone, onDay }: Props = $props();

  let picker: HTMLInputElement | undefined = $state();

  function openPicker() {
    if (!picker) return;
    if (typeof picker.showPicker === 'function') picker.showPicker();
    else picker.click();
  }

  function picked(e: Event) {
    const value = (e.currentTarget as HTMLInputElement).value;
    if (value) onDay(value);
  }

  const btn =
    'inline-flex h-11 w-11 items-center justify-center rounded-[10px] border border-rule text-ink disabled:text-muted disabled:opacity-50';
</script>

<div class="relative flex items-center justify-between px-2 py-2.5">
  <button type="button" class={btn} aria-label="Previous day" onclick={() => onDay(shiftDay(day, -1))}>
    <Icon name="chevron-left" />
  </button>
  <div class="text-center">
    <button type="button" class="min-h-11 px-2 text-[17px] font-semibold text-ink" onclick={openPicker}>
      {dayTitle(day, todayDay)}
    </button>
    <p class="-mt-2 text-xs text-muted">{daySubtitle(day, todayDay, zone)}</p>
    <input
      bind:this={picker}
      type="date"
      class="sr-only"
      tabindex="-1"
      aria-label="Choose a date"
      value={day}
      max={todayDay}
      onchange={picked}
    />
  </div>
  <button
    type="button"
    class={btn}
    aria-label="Next day"
    disabled={day === todayDay}
    onclick={() => onDay(shiftDay(day, 1))}
  >
    <Icon name="chevron-right" />
  </button>
</div>
