<script lang="ts">
  import Icon from './Icon.svelte';
  import { zoneCity } from '../dashboard/day';
  import { zoneChoices } from '../timeline/zonePref';

  interface Props {
    day: string;
    /** The latest day the date input offers. */
    todayDay: string;
    /** The forced display zone; null follows the viewer's own. */
    forcedZone: string | null;
    /** The viewer's own zone, offered as the default choice. */
    browserZone: string;
    cameras: readonly { id: string; name: string }[];
    /** '' means all cameras. */
    camera: string;
    /** Phones: the camera filter lives here instead of the top bar. */
    showCamera: boolean;
    onDay: (day: string) => void;
    /** A zone name, or null to follow the viewer's own zone. */
    onZone: (zone: string | null) => void;
    onCamera: (id: string) => void;
  }

  let { day, todayDay, forcedZone, browserZone, cameras, camera, showCamera, onDay, onZone, onCamera }: Props = $props();

  const zones = $derived(zoneChoices(forcedZone));

  function picked(e: Event) {
    const value = (e.currentTarget as HTMLInputElement).value;
    if (value) onDay(value);
  }

  const label = 'flex min-w-0 flex-col gap-0.5 text-xs text-muted';
  const field = 'min-h-11 w-full min-w-0 appearance-none rounded-[10px] border border-rule bg-ground pr-8 pl-2 text-sm text-ink md:min-h-9';
  const chevron = 'pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rotate-90 text-muted';
</script>

<div class="flex flex-col gap-3">
  <label class={label}>
    Day
    <input type="date" class="{field} pr-2" aria-label="Choose a date" value={day} max={todayDay} onchange={picked} />
  </label>
  <label class={label}>
    Time zone
    <span class="relative block">
      <select class={field} value={forcedZone ?? ''} onchange={(e) => onZone(e.currentTarget.value || null)}>
        <option value="">My time ({zoneCity(browserZone)})</option>
        {#each zones as z (z)}
          <option value={z}>{zoneCity(z)}</option>
        {/each}
      </select>
      <span class={chevron}><Icon name="chevron-right" size={16} /></span>
    </span>
  </label>
  {#if showCamera}
    <label class={label}>
      Camera
      <span class="relative block">
        <select class={field} value={camera} onchange={(e) => onCamera(e.currentTarget.value)}>
          <option value="">All cameras</option>
          {#each cameras as c (c.id)}
            <option value={c.id}>{c.name}</option>
          {/each}
        </select>
        <span class={chevron}><Icon name="chevron-right" size={16} /></span>
      </span>
    </label>
  {/if}
</div>
