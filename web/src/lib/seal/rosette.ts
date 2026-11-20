import type { IntegrityState } from '../player/engine';

export type SealState = IntegrityState | 'unchecked';

export interface RosetteParams {
  petals: number;
  inner: number;
  offset: number;
  phase: number;
}

function fnv1a(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

// Cheap integer mixer so each parameter draws from independent-looking bits of the one hash.
function mix(h: number, salt: number): number {
  let x = (h ^ Math.imul(salt, 0x9e3779b1)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}

const unit = (n: number): number => n / 0xffffffff;

export function rosetteParams(seed: string): RosetteParams {
  const h = fnv1a(seed);
  return {
    petals: 5 + (mix(h, 1) % 7),
    inner: 0.25 + unit(mix(h, 2)) * 0.35,
    offset: 0.3 + unit(mix(h, 3)) * 0.6,
    phase: unit(mix(h, 4)) * Math.PI * 2,
  };
}

/** Closed hypotrochoid (R = petals, r = 1) scaled to fit `size` with a 1 px margin. */
export function rosettePath(p: RosetteParams, size: number, steps = 360): string {
  const R = p.petals;
  const r = 1;
  const d = 1 + p.inner * (R - 1) * p.offset;
  const reach = R - r + d;
  const c = size / 2;
  const k = (c - 1) / reach;
  const cos = Math.cos(p.phase);
  const sin = Math.sin(p.phase);
  let out = '';
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const x = (R - r) * Math.cos(t) + d * Math.cos(((R - r) / r) * t);
    const y = (R - r) * Math.sin(t) - d * Math.sin(((R - r) / r) * t);
    const px = c + (x * cos - y * sin) * k;
    const py = c + (x * sin + y * cos) * k;
    out += `${i === 0 ? 'M' : 'L'}${px.toFixed(2)} ${py.toFixed(2)}`;
  }
  return `${out}Z`;
}

const LABELS: Record<SealState, string> = {
  unchecked: 'Not checked yet. Play it to verify.',
  verifying: 'Verifying…',
  verified: 'Encrypted recording verified',
  incomplete: 'Recording was interrupted',
  mismatch: 'Metadata mismatch',
  tampered: 'Failed verification',
  'unknown-key': 'Recorded with another key',
};

export function sealLabel(state: SealState): string {
  return LABELS[state];
}
