<script lang="ts">
  import { rosetteParams, rosettePath, sealLabel, type SealState } from './rosette';

  interface Props {
    seed: string;
    state: SealState;
    size?: number;
    showLabel?: boolean;
    /** A pure picture (e.g. a key fingerprint): hidden from assistive tech, no label. */
    decorative?: boolean;
  }

  let { seed, state, size = 32, showLabel = false, decorative = false }: Props = $props();

  const uid = $props.id();
  const clipId = `seal-clip-${uid}`;
  const c = $derived(size / 2);
  const ringR = $derived(size / 2 - 0.5);
  const path = $derived(state === 'unchecked' || state === 'tampered' ? '' : rosettePath(rosetteParams(seed), size, size <= 40 ? 120 : 180));
  // 240 degree sector from 12 o'clock clockwise, for the interrupted recording.
  const wedge = $derived(`M${c} ${c}L${c} 0A${c} ${c} 0 1 1 ${(c - c * Math.sin(Math.PI / 3)).toFixed(2)} ${(c + c / 2).toFixed(2)}Z`);
  const label = $derived(sealLabel(state));
  const voidRows = $derived(Array.from({ length: Math.ceil(size / 6) + 2 }, (_, i) => i * 6 - 6));
</script>

<span class="seal" data-seal-state={state}>
  <svg
    class="shrink-0"
    role={decorative ? undefined : 'img'}
    aria-label={decorative ? undefined : label}
    aria-hidden={decorative ? 'true' : undefined}
    width={size}
    height={size}
    viewBox="0 0 {size} {size}"
    fill="none"
    stroke-width="0.8"
  >
    {#if state === 'unchecked'}
      <circle cx={c} cy={c} r={ringR} stroke="var(--z-muted)" stroke-dasharray="2 2.5" />
    {:else if state === 'tampered'}
      <defs>
        <clipPath id={clipId}><circle cx={c} cy={c} r={ringR - 1} /></clipPath>
      </defs>
      <circle cx={c} cy={c} r={ringR} stroke="var(--z-void)" />
      <g clip-path="url(#{clipId})" transform="rotate(-35 {c} {c})" fill="var(--z-void)" stroke="none">
        {#each voidRows as y (y)}
          <text x={-size / 2} {y} font-size="5" font-weight="600" letter-spacing="0.5">VOID VOID VOID VOID VOID VOID VOID</text>
        {/each}
      </g>
    {:else if state === 'unknown-key'}
      <circle cx={c} cy={c} r={ringR} stroke="var(--z-muted)" pathLength="100" stroke-dasharray="40 6 20 6 20 8" />
      <path data-rosette d={path} stroke="var(--z-muted)" />
    {:else if state === 'incomplete'}
      <circle cx={c} cy={c} r={ringR} stroke="var(--z-amber)" />
      <defs>
        <clipPath id={clipId}><path d={wedge} /></clipPath>
      </defs>
      <path data-rosette d={path} stroke="var(--z-amber)" clip-path="url(#{clipId})" />
    {:else if state === 'mismatch'}
      <!-- One wide notch in the ring (unknown-key has three small gaps). -->
      <circle cx={c} cy={c} r={ringR} stroke="var(--z-amber)" pathLength="100" stroke-dasharray="86 14" transform="rotate(-82 {c} {c})" />
      <path data-rosette d={path} stroke="var(--z-amber)" />
    {:else if state === 'verifying'}
      <circle cx={c} cy={c} r={ringR} stroke="var(--z-line)" opacity="0.4" />
      <path data-rosette class="spin" d={path} stroke="var(--z-line)" opacity="0.4" />
    {:else}
      <circle cx={c} cy={c} r={ringR} stroke="var(--z-line)" />
      <path data-rosette d={path} stroke="var(--z-line)" />
    {/if}
  </svg>
  {#if showLabel && !decorative}<span class="text-sm">{label}</span>{/if}
</span>

<style>
  .seal {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
  }
  .spin {
    transform-origin: 50% 50%;
    transform-box: view-box;
    animation: seal-spin 12s linear infinite;
  }
  @keyframes seal-spin {
    to {
      transform: rotate(360deg);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .spin {
      animation: none;
    }
  }
</style>
