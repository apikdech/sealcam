import { describe, expect, it } from 'vitest';
import { describeIntegrity, formatMmss, initialState } from './status';
import type { PlayerState } from './engine';

const ctx = { zone: 'Asia/Jakarta', cameraName: (id: string) => (id === 'front-door' ? 'Front door' : id) };
const st = (over: Partial<PlayerState>): PlayerState => ({ ...initialState(), ...over });

describe('formatMmss', () => {
  it('rounds to the nearest second and pads', () => {
    expect(formatMmss(0)).toBe('00:00');
    expect(formatMmss(65_400)).toBe('01:05');
    expect(formatMmss(3_599_600)).toBe('60:00');
  });
});

describe('describeIntegrity (ui-spec §4.4 wording)', () => {
  it('verifying shows a spinner', () => {
    expect(describeIntegrity(st({ integrity: 'verifying', clipId: '01JC0000000000000000000000' }), ctx)).toMatchObject({
      kind: 'verifying',
      spinner: true,
    });
  });
  it('no spinner before a clip is selected', () => {
    expect(describeIntegrity(initialState(), ctx).spinner).toBe(false);
  });
  it('verifying stops spinning once opening failed', () => {
    const d = describeIntegrity(st({ integrity: 'verifying', message: 'ErrNoKey' }), ctx);
    expect(d.spinner).toBe(false);
    expect(d.text).toBe('Could not verify this recording');
  });
  it('verified shows a subtle badge with the tooltip text', () => {
    expect(describeIntegrity(st({ integrity: 'verified' }), ctx)).toMatchObject({
      kind: 'verified',
      title: 'Encrypted recording verified',
    });
  });
  it('mismatch text uses the display zone and camera name', () => {
    const d = describeIntegrity(
      st({
        integrity: 'mismatch',
        header: { cameraId: 'front-door', startUnixMs: Date.UTC(2026, 10, 6, 16, 44, 6) },
        verification: { camera: 'mismatch', start: 'match', clipId: 'match' },
      }),
      ctx,
    );
    expect(d.kind).toBe('mismatch');
    expect(d.text).toBe(
      "This recording's description disagrees with its encrypted header. Showing the header's values: Front door, started 23:44:06.",
    );
  });
  it('tampered says where verification failed and offers no export', () => {
    const d = describeIntegrity(st({ integrity: 'tampered', failedAtMs: 16_000 }), ctx);
    expect(d.text).toBe('This recording failed verification at ~00:16');
    expect(d.export).toBe(false);
    expect(d.next).toBe('Export is turned off for this recording.');
  });
  it('incomplete says the recording was interrupted', () => {
    expect(describeIntegrity(st({ integrity: 'incomplete' }), ctx).text).toBe('Recording was interrupted');
  });
  it('unknown-key names the key id', () => {
    expect(describeIntegrity(st({ integrity: 'unknown-key', keyId: 'a1b2-c3d4-e5f6-0718' }), ctx).text).toBe(
      'Recorded with key a1b2-c3d4-e5f6-0718; add that key to play',
    );
  });
  it('unknown-key next links to Keys', () => {
    const d = describeIntegrity(st({ integrity: 'unknown-key', keyId: 'a1b2-c3d4-e5f6-0718' }), ctx);
    expect(d.next).toBe('Open Keys');
    expect(d.nextHref).toBe('#/key');
  });
  it('unknown-key without a hint still reads sensibly', () => {
    expect(describeIntegrity(st({ integrity: 'unknown-key' }), ctx).text).toContain('add that key to play');
  });
});
