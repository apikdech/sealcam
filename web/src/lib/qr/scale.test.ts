import { describe, expect, it } from 'vitest';
import { fitWithin } from './scale';

describe('fitWithin', () => {
  it('leaves a small image alone', () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });
  it('scales a landscape photo to the cap on its long side', () => {
    expect(fitWithin(8000, 6000, 1600)).toEqual({ width: 1600, height: 1200 });
  });
  it('scales a portrait photo to the cap on its long side', () => {
    expect(fitWithin(3000, 6000, 1600)).toEqual({ width: 800, height: 1600 });
  });
  it('never returns a zero side', () => {
    expect(fitWithin(10000, 1, 1600)).toEqual({ width: 1600, height: 1 });
  });
});
