<script lang="ts">
  import Icon from './Icon.svelte';
  import { zoneCity } from '../dashboard/day';
  import { zoneChoices } from '../timeline/zonePref';

  interface Props {
    cameras: readonly { id: string; name: string }[];
    /** '' means all cameras. */
    camera: string;
    /** '' means all triggers. */
    trigger: string;
    /** The forced display zone; null follows the viewer's own. */
    forcedZone: string | null;
    /** The viewer's own zone, offered as the default choice. */
    browserZone: string;
    onCamera: (id: string) => void;
    onTrigger: (type: string) => void;
    /** A zone name, or null to follow the viewer's own zone. */
    onZone: (zone: string | null) => void;
  }

  let { cameras, camera, trigger, forcedZone, browserZone, onCamera, onTrigger, onZone }: Props = $props();

  const zones = $derived(zoneChoices(forcedZone));

  const TRIGGERS = [
    ['', 'All triggers'],
    ['person', 'Person'],
    ['vehicle', 'Vehicle'],
    ['pet', 'Pet'],
    ['motion', 'Motion'],
    ['other', 'Other'],
  ] as const;

  const label = 'flex min-w-0 flex-col gap-0.5 text-xs text-muted';
  const field = 'min-h-11 w-full min-w-0 appearance-none rounded-[10px] border border-rule bg-plate pr-8 pl-2 text-sm text-ink md:min-h-9';
  const chevron = 'pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rotate-90 text-muted';
</script>

<div class="grid grid-cols-2 gap-3 px-4 py-2 md:flex">
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
  <label class={label}>
    Trigger
    <span class="relative block">
      <select class={field} value={trigger} onchange={(e) => onTrigger(e.currentTarget.value)}>
        {#each TRIGGERS as [value, text] (value)}
          <option {value}>{text}</option>
        {/each}
      </select>
      <span class={chevron}><Icon name="chevron-right" size={16} /></span>
    </span>
  </label>
  <label class="{label} col-span-2 md:col-span-1">
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
</div>
