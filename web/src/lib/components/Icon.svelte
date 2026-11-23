<script module lang="ts">
  // Path data adapted from Lucide (ISC licence), https://lucide.dev. Redrawn on a 24 px grid.
  const PATHS = {
    play: ['M6 3l14 9-14 9z'],
    pause: ['M7 4h3v16H7z', 'M14 4h3v16h-3z'],
    prev: ['M19 20L9 12l10-8z', 'M5 19V5'],
    next: ['M5 4l10 8-10 8z', 'M19 5v14'],
    back10: ['M3 12a9 9 0 1 0 3-6.7L3 8', 'M3 3v5h5', 'M10.5 10v5', 'M13 10h2.5v5H13z'],
    fwd10: ['M21 12a9 9 0 1 1-3-6.7L21 8', 'M21 3v5h-5', 'M10.5 10v5', 'M13 10h2.5v5H13z'],
    'chevron-left': ['m15 18-6-6 6-6'],
    'chevron-right': ['m9 18 6-6-6-6'],
    'sound-on': ['M11 5 6 9H2v6h4l5 4z', 'M15.5 8.5a5 5 0 0 1 0 7', 'M19 5a9.5 9.5 0 0 1 0 14'],
    'sound-off': ['M11 5 6 9H2v6h4l5 4z', 'M22 9l-6 6', 'M16 9l6 6'],
    fullscreen: ['M8 3H5a2 2 0 0 0-2 2v3', 'M21 8V5a2 2 0 0 0-2-2h-3', 'M3 16v3a2 2 0 0 0 2 2h3', 'M16 21h3a2 2 0 0 0 2-2v-3'],
    'fullscreen-exit': ['M8 3v3a2 2 0 0 1-2 2H3', 'M21 8h-3a2 2 0 0 1-2-2V3', 'M3 16h3a2 2 0 0 1 2 2v3', 'M16 21v-3a2 2 0 0 1 2-2h3'],
    key: ['M7.5 21a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z', 'M11 12l10-10', 'M18 5l3 3', 'M15 8l3 3'],
    camera: [
      'M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z',
      'M12 16a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
    ],
    qr: ['M3 3h7v7H3z', 'M14 3h7v7h-7z', 'M3 14h7v7H3z', 'M14 14h3v3h-3z', 'M20 14v.01', 'M14 20h3v1', 'M21 17v4'],
    image: [
      'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z',
      'M9 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
      'M21 15l-3.1-3.1a2 2 0 0 0-2.8 0L6 21',
    ],
    retry: ['M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8', 'M3 3v5h5'],
    'zoom-in': ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z', 'M21 21l-4.3-4.3', 'M11 8v6', 'M8 11h6'],
    'zoom-out': ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z', 'M21 21l-4.3-4.3', 'M8 11h6'],
    now: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
    download: ['M12 3v12', 'M7 10l5 5 5-5', 'M4 21h16'],
    close: ['M18 6 6 18', 'M6 6l12 12'],
    check: ['M20 6 9 17l-5-5'],
    'theme-system': ['M4 4h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z', 'M8 21h8', 'M12 16v5'],
    'theme-light': [
      'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
      'M12 2v2',
      'M12 20v2',
      'M4.9 4.9l1.4 1.4',
      'M17.7 17.7l1.4 1.4',
      'M2 12h2',
      'M20 12h2',
      'M4.9 19.1l1.4-1.4',
      'M17.7 6.3l1.4-1.4',
    ],
    'theme-dark': ['M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z'],
  } as const;

  export type IconName = keyof typeof PATHS;
  export const ICON_NAMES = Object.keys(PATHS) as IconName[];
</script>

<script lang="ts">
  let { name, size = 24, label }: { name: IconName; size?: number; label?: string } = $props();
</script>

<svg
  xmlns="http://www.w3.org/2000/svg"
  viewBox="0 0 24 24"
  width={size}
  height={size}
  fill="none"
  stroke="currentColor"
  stroke-width="1.75"
  stroke-linecap="round"
  stroke-linejoin="round"
  role={label ? 'img' : undefined}
  aria-label={label}
  aria-hidden={label ? undefined : 'true'}
>
  {#each PATHS[name] as d (d)}
    <path {d} />
  {/each}
</svg>
