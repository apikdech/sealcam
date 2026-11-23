import { describe, expect, it } from 'vitest';
import { dayTitle, dayTitleShort, daySubtitle, shiftDay, zoneCity } from './day';

describe('shiftDay', () => {
  it('rolls over months and years', () => {
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftDay('2026-11-20', 0)).toBe('2026-11-20');
  });
});

describe('zoneCity', () => {
  it('names the city', () => {
    expect(zoneCity('Asia/Jakarta')).toBe('Jakarta');
    expect(zoneCity('America/Argentina/Buenos_Aires')).toBe('Buenos Aires');
    expect(zoneCity('UTC')).toBe('UTC');
  });
});

describe('dayTitle', () => {
  it('omits the year in the current year', () => {
    expect(dayTitle('2026-11-20', '2026-11-20')).toBe('Friday, 20 November');
  });
  it('appends the year otherwise', () => {
    expect(dayTitle('2025-11-20', '2026-11-20')).toBe('Thursday, 20 November 2025');
  });
});

describe('dayTitleShort', () => {
  it('abbreviates weekday and month', () => {
    expect(dayTitleShort('2026-11-23', '2026-11-23')).toBe('Mon, 23 Nov');
  });
  it('appends the year otherwise', () => {
    expect(dayTitleShort('2025-11-20', '2026-11-20')).toBe('Thu, 20 Nov 2025');
  });
});

describe('daySubtitle', () => {
  it('marks today and yesterday', () => {
    expect(daySubtitle('2026-11-20', '2026-11-20', 'Asia/Jakarta')).toBe('Jakarta time · today');
    expect(daySubtitle('2026-11-19', '2026-11-20', 'Asia/Jakarta')).toBe('Jakarta time · yesterday');
    expect(daySubtitle('2026-11-18', '2026-11-20', 'Asia/Jakarta')).toBe('Jakarta time');
  });
});
