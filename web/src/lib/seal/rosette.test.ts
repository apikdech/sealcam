import { describe, expect, it } from 'vitest';
import { rosetteParams, rosettePath, sealLabel, type SealState } from './rosette';

describe('rosette', () => {
  it('same seed gives identical params', () => {
    expect(rosetteParams('clip-1')).toEqual(rosetteParams('clip-1'));
  });

  it('params stay in range for 500 seeds', () => {
    for (let i = 0; i < 500; i++) {
      const p = rosetteParams(`seed-${i}`);
      expect(Number.isInteger(p.petals)).toBe(true);
      expect(p.petals).toBeGreaterThanOrEqual(5);
      expect(p.petals).toBeLessThanOrEqual(11);
      expect(Number.isInteger(p.strands)).toBe(true);
      expect(p.strands).toBeGreaterThanOrEqual(3);
      expect(p.strands).toBeLessThanOrEqual(6);
      expect(p.inner).toBeGreaterThanOrEqual(0.25);
      expect(p.inner).toBeLessThanOrEqual(0.4);
      expect(p.amp).toBeGreaterThanOrEqual(0.05);
      expect(p.amp).toBeLessThanOrEqual(0.1);
      expect(p.phase).toBeGreaterThanOrEqual(0);
      expect(p.phase).toBeLessThanOrEqual(Math.PI * 2);
    }
  });

  it('different seeds differ (>= 95 % distinct tuples over 200 clip ids)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const p = rosetteParams(`clip-${i}`);
      seen.add(`${p.petals}|${p.strands}|${p.inner}|${p.amp}`);
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
        expect(d.match(/M/g)!.length).toBeGreaterThanOrEqual(6);
        expect(d.match(/Z/g)!.length).toBe(d.match(/M/g)!.length);
        for (const n of nums) {
          expect(n).toBeGreaterThanOrEqual(0);
          expect(n).toBeLessThanOrEqual(size);
        }
      }
    }
  });

  it('list-size seals (< 44 px) draw N rotated ellipses, not the concentric bands', () => {
    const p = rosetteParams('clip-1');
    expect(p.ellipses).toBeGreaterThanOrEqual(8);
    expect(p.ellipses).toBeLessThanOrEqual(14);
    for (const size of [20, 38, 43]) {
      const d = rosettePath(p, size);
      expect(d.match(/M/g)!.length).toBe(p.ellipses);
      expect(d.endsWith('Z')).toBe(true);
      expect(d).not.toContain('NaN');
      for (const n of d.match(/-?\d+(\.\d+)?/g)!.map(Number)) {
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThanOrEqual(size);
      }
    }
    expect(rosettePath(p, 64).match(/M/g)!.length).toBe(p.strands * 3);
  });

  it('list-size rosettes are deterministic and distinct per seed', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const d = rosettePath(rosetteParams(`clip-${i}`), 38);
      expect(rosettePath(rosetteParams(`clip-${i}`), 38)).toBe(d);
      seen.add(d);
    }
    expect(seen.size).toBeGreaterThanOrEqual(95);
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
