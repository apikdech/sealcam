<script lang="ts">
  import Icon from '../components/Icon.svelte';
  import { applyTheme, currentTheme, nextTheme, saveTheme, type ThemeChoice } from './theme';

  const LABEL: Record<ThemeChoice, string> = { system: 'System', light: 'Light', dark: 'Dark' };

  let choice = $state<ThemeChoice>(currentTheme());

  function cycle(): void {
    choice = nextTheme(choice);
    saveTheme(choice);
    applyTheme(choice);
  }
</script>

<button
  type="button"
  class="inline-flex size-11 shrink-0 items-center justify-center text-ink"
  aria-label={`Theme: ${LABEL[choice]}`}
  title={`Theme: ${LABEL[choice]}`}
  onclick={cycle}
>
  <Icon name={`theme-${choice}`} />
</button>
