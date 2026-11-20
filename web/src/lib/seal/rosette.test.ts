import { describe, expect, it } from 'vitest';
import { rosetteParams, rosettePath, sealLabel, type SealState } from './rosette';

describe('rosette', () => {
  it('same seed gives identical params', () => {
    expect(rosetteParams('clip-1')).toEqual(rosetteParams('clip-1'));
  });

  it('params stay in range for 500 random seeds', () => {
    for (let i = 0; i < 500; i++) {
      const p = rosetteParams(`seed-${i}-${Math.random()}`);
      expect(Number.isInteger(p.petals)).toBe(true);
      expect(p.petals).toBeGreaterThanOrEqual(5);
      expect(p.petals).toBeLessThanOrEqual(11);
      expect(p.inner).toBeGreaterThanOrEqual(0.25);
      expect(p.inner).toBeLessThanOrEqual(0.6);
      expect(p.offset).toBeGreaterThanOrEqual(0.3);
      expect(p.offset).toBeLessThanOrEqual(0.9);
      expect(p.phase).toBeGreaterThanOrEqual(0);
      expect(p.phase).toBeLessThanOrEqual(Math.PI * 2);
    }
  });

  it('different seeds differ (>= 95 % distinct triples over 200 clip ids)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const p = rosetteParams(`clip-${i}`);
      seen.add(`${p.petals}|${p.inner}|${p.offset}`);
    }
    expect(seen.size).toBeGreaterThanOrEqual(190);
  });

  it('path starts with M, ends with Z, has no NaN, and every coordinate lies within [0, size]', () => {
    for (const size of [32, 38, 96]) {
      for (let i = 0; i < 50; i++) {
        const d = rosettePath(rosetteParams(`c${i}`), size);
        expect(d.startsWith('M')).toBe(true);
        expect(d.endsWith('Z')).toBe(true);
        expect(d).not.toContain('NaN');
        const nums = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
        expect(nums.length).toBeGreaterThan(0);
        for (const n of nums) {
          expect(n).toBeGreaterThanOrEqual(0);
          expect(n).toBeLessThanOrEqual(size);
        }
      }
    }
  });

  it('sealLabel returns the exact copy for all seven states', () => {
    const want: Record<SealState, string> = {
      unchecked: 'Not checked yet. Play it to verify.',
      verifying: 'Verifying…',
      verified: 'Encrypted recording verified',
      incomplete: 'Recording was interrupted',
      mismatch: 'Metadata mismatch',
      tampered: 'Failed verification',
      'unknown-key': 'Recorded with another key',
    };
    for (const [s, l] of Object.entries(want)) expect(sealLabel(s as SealState)).toBe(l);
  });
});
