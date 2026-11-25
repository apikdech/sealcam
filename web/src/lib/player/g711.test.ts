import { describe, expect, it } from 'vitest';
import { decodeG711 } from './g711';

const one = (b: number, c: 'PCMA' | 'PCMU') => decodeG711(Uint8Array.of(b), c)[0]!;

describe('decodeG711', () => {
  it('decodes A-law', () => {
    expect(one(0xd5, 'PCMA')).toBeCloseTo(8 / 32768, 7);
    expect(one(0x55, 'PCMA')).toBeCloseTo(-8 / 32768, 7);
    expect(one(0xaa, 'PCMA')).toBeCloseTo(32256 / 32768, 7);
    expect(one(0x2a, 'PCMA')).toBeCloseTo(-32256 / 32768, 7);
  });
  it('decodes mu-law', () => {
    expect(one(0xff, 'PCMU')).toBeCloseTo(0, 7);
    expect(one(0x00, 'PCMU')).toBeCloseTo(-32124 / 32768, 7);
    expect(one(0x80, 'PCMU')).toBeCloseTo(32124 / 32768, 7);
  });
  it('returns one sample per byte', () => {
    const out = decodeG711(new Uint8Array(37), 'PCMA');
    expect(out).toBeInstanceOf(Float32Array);
    expect(out.length).toBe(37);
  });
});
