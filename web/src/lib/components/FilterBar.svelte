<script lang="ts">
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

  const label = 'flex shrink-0 flex-col gap-0.5 text-xs text-muted';
  const field = 'min-h-11 rounded-[10px] border border-rule bg-plate px-2 text-sm text-ink md:min-h-9';
</script>

<div class="flex gap-3 overflow-x-auto px-4 py-2">
  <label class={label}>
    Camera
    <select class={field} value={camera} onchange={(e) => onCamera(e.currentTarget.value)}>
      <option value="">All cameras</option>
      {#each cameras as c (c.id)}
        <option value={c.id}>{c.name}</option>
      {/each}
    </select>
  </label>
  <label class={label}>
    Trigger
    <select class={field} value={trigger} onchange={(e) => onTrigger(e.currentTarget.value)}>
      {#each TRIGGERS as [value, text] (value)}
        <option {value}>{text}</option>
      {/each}
    </select>
  </label>
  <label class={label}>
    Time zone
    <select class={field} value={forcedZone ?? ''} onchange={(e) => onZone(e.currentTarget.value || null)}>
      <option value="">My time ({zoneCity(browserZone)})</option>
      {#each zones as z (z)}
        <option value={z}>{zoneCity(z)}</option>
      {/each}
    </select>
  </label>
</div>
