import type { IntegrityState } from '../player/engine';

export type SealState = IntegrityState | 'unchecked';

export interface RosetteParams {
  petals: number; // wave count N of the outer band, 5-11
  strands: number; // phase-shifted strands per band K, 3-6
  inner: number; // radius of the innermost band as a fraction of the seal, 0.25-0.4
  amp: number; // wave amplitude as a fraction of the seal, 0.05-0.1
  phase: number; // 0-2pi
  ellipses: number; // list-size rosette: rotated ellipse count, 8-14
  ecc: number; // list-size rosette: ry / rx, 0.3-0.5
  turn: number; // list-size rosette: rotation offset of the whole set, 0-pi
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
    strands: 3 + (mix(h, 2) % 4),
    inner: 0.25 + unit(mix(h, 3)) * 0.15,
    amp: 0.05 + unit(mix(h, 5)) * 0.05,
    phase: unit(mix(h, 4)) * Math.PI * 2,
    ellipses: 8 + (mix(h, 6) % 7),
    ecc: 0.3 + unit(mix(h, 7)) * 0.2,
    turn: unit(mix(h, 8)) * Math.PI,
  };
}

const OUTER = 0.78;
/** Below this size the concentric bands collapse into a bullseye, so a rosette of ellipses is drawn instead. */
const LIST_SIZE = 44;

/** N ellipses through the centre, rotated in equal steps (the sketch's rosette). */
function ellipseRosette(p: RosetteParams, size: number, steps: number): string {
  const c = size / 2;
  const rx = c - 1.5;
  const ry = rx * p.ecc;
  let out = '';
  for (let e = 0; e < p.ellipses; e++) {
    const rot = p.turn + (Math.PI * e) / p.ellipses;
    const cr = Math.cos(rot);
    const sr = Math.sin(rot);
    for (let s = 0; s < steps; s++) {
      const t = (s / steps) * Math.PI * 2;
      const x = rx * Math.cos(t);
      const y = ry * Math.sin(t);
      out += `${s === 0 ? 'M' : 'L'}${(c + x * cr - y * sr).toFixed(1)} ${(c + x * sr + y * cr).toFixed(1)}`;
    }
    out += 'Z';
  }
  return out;
}

/**
 * Guilloché: three concentric bands, each of K phase-shifted strands r = R + A sin(N t + 2 pi i / K).
 * Wave count steps up by two per band inward so the strands cross into a woven lattice.
 * Below 44 px the sketch's ellipse rosette is drawn instead (see ellipseRosette).
 * Every strand is its own closed subpath, scaled to fit `size` with a 1 px margin.
 */
export function rosettePath(p: RosetteParams, size: number, steps = 180): string {
  if (size < LIST_SIZE) return ellipseRosette(p, size, Math.min(steps, 48));
  const c = size / 2;
  const k = c - 1;
  const mid = (OUTER + p.inner) / 2;
  const bands = [
    { R: OUTER, N: p.petals, A: p.amp },
    { R: mid, N: p.petals + 2, A: p.amp * 0.9 },
    { R: p.inner, N: p.petals + 4, A: p.amp * 0.8 },
  ];
  let out = '';
  for (const { R, N, A } of bands) {
    for (let i = 0; i < p.strands; i++) {
      const shift = p.phase + (2 * Math.PI * i) / p.strands;
      for (let s = 0; s < steps; s++) {
        const t = (s / steps) * Math.PI * 2;
        const rho = (R + A * Math.sin(N * t + shift)) * k;
        out += `${s === 0 ? 'M' : 'L'}${(c + rho * Math.cos(t)).toFixed(1)} ${(c + rho * Math.sin(t)).toFixed(1)}`;
      }
      out += 'Z';
    }
  }
  return out;
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
