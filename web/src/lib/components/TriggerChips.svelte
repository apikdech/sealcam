<script lang="ts">
  import { triggerStyle } from '../timeline/model';

  interface Props {
    /** Empty means all triggers. */
    selected: string[];
    available: string[];
    onChange: (next: string[]) => void;
  }

  let { selected, available, onChange }: Props = $props();

  const ORDER = ['person', 'vehicle', 'pet', 'motion', 'other'];
  const types = $derived(ORDER.filter((t) => t !== 'other' || available.includes('other')));

  const toggle = (t: string) => onChange(selected.includes(t) ? selected.filter((x) => x !== t) : [...selected, t]);

  const chip =
    'inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm text-ink md:min-h-8';
  const on = 'border-line bg-plate';
  const off = 'border-rule';
</script>

<div role="group" aria-label="Filter by trigger" class="flex flex-nowrap gap-1.5 overflow-x-auto md:flex-wrap">
  <button type="button" class="{chip} {selected.length === 0 ? on : off}" aria-pressed={selected.length === 0} onclick={() => onChange([])}>
    All
  </button>
  {#each types as t (t)}
    {@const st = triggerStyle(t)}
    {@const pressed = selected.includes(t)}
    <button type="button" class="{chip} {pressed ? on : off}" aria-pressed={pressed} onclick={() => toggle(t)}>
      <span aria-hidden="true" style:background={st.color} class="inline-block min-w-5 rounded px-1 text-center text-xs font-bold text-on-trigger">{st.glyph}</span>
      {st.label}
    </button>
  {/each}
</div>
