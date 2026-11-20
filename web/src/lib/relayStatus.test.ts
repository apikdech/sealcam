// @vitest-environment jsdom
import { cleanup } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import type { Status } from '../worker/schemas';
import { recorderWords, relayHealth } from './relayStatus';

const NOW = Date.UTC(2026, 10, 6, 15, 0, 0);
const iso = (ms: number) => new Date(ms).toISOString().replace('.000Z', 'Z');

function status(over: Partial<Status> & { ageMs?: number } = {}): Status {
  const { ageMs = 30_000, ...rest } = over;
  return {
    schema: 'zrec.status/1',
    relay_id: 'r1',
    version: 'v2',
    updated_at: iso(NOW - ageMs),
    key_id: '0123456789abcdef',
    cameras: [{ id: 'front', name: 'Front', rtsp: 'up', events: 'up', since: iso(NOW - 3_600_000), last_clip_at: null }],
    ...rest,
  };
}

afterEach(cleanup);

describe('relayHealth', () => {
  it('is ok when fresh, cameras up and storage closed', () => {
    const h = relayHealth(status({ storage: { state: 'closed' } }), NOW);
    expect(h.level).toBe('ok');
  });

  it('is red when updated_at is 4 minutes old', () => {
    const h = relayHealth(status({ ageMs: 4 * 60_000 }), NOW);
    expect(h.level).toBe('bad');
    expect(h.tooltip).toContain(iso(NOW - 4 * 60_000));
    expect(h.tooltip.toLowerCase()).toContain('stale');
  });

  it('is not stale at exactly 3 minutes, only older', () => {
    expect(relayHealth(status({ ageMs: 180_000 }), NOW).level).toBe('ok');
    expect(relayHealth(status({ ageMs: 180_001 }), NOW).level).toBe('bad');
  });

  it('is red when a camera is down, and the tooltip shows its since', () => {
    const since = iso(NOW - 600_000);
    const h = relayHealth(
      status({ cameras: [{ id: 'front', name: 'Front Door', rtsp: 'down', events: 'up', since, last_clip_at: null }] }),
      NOW,
    );
    expect(h.level).toBe('bad');
    expect(h.tooltip).toContain('Front Door');
    expect(h.tooltip).toContain(since);
  });

  it('is amber while the storage breaker is not closed, and says which state', () => {
    const since = iso(NOW - 120_000);
    const h = relayHealth(status({ storage: { state: 'open', since, backlog_bytes: 5 } }), NOW);
    expect(h.level).toBe('warn');
    expect(h.tooltip).toContain('open');
    expect(h.tooltip).toContain(since);
    expect(relayHealth(status({ storage: { state: 'half_open' } }), NOW).level).toBe('warn');
  });

  it('is amber when only the event stream or a camera is degraded', () => {
    const cam = (rtsp: 'up' | 'down' | 'degraded', events: 'up' | 'down' | 'degraded') => [
      { id: 'f', name: 'F', rtsp, events, since: iso(NOW), last_clip_at: null },
    ];
    expect(relayHealth(status({ cameras: cam('up', 'down') }), NOW).level).toBe('warn');
    expect(relayHealth(status({ cameras: cam('degraded', 'up') }), NOW).level).toBe('warn');
  });

  it('stale beats a healthy body', () => {
    expect(relayHealth(status({ ageMs: 10 * 60_000, storage: { state: 'closed' } }), NOW).level).toBe('bad');
  });

  it('is unknown when no status could be read', () => {
    expect(relayHealth(null, NOW).level).toBe('unknown');
  });
});

describe('recorderWords', () => {
  const Z = 'Asia/Jakarta';
  const cam = (name: string, over: Partial<Status['cameras'][number]> = {}): Status['cameras'][number] => ({
    id: name,
    name,
    rtsp: 'up',
    events: 'up',
    since: iso(NOW - 3_600_000),
    last_clip_at: null,
    ...over,
  });

  it('says status unavailable for null', () => {
    expect(recorderWords(null, NOW, Z)).toMatchObject({ level: 'unknown', short: 'Status unavailable' });
  });

  it('counts whole minutes when stale', () => {
    const w = recorderWords(status({ ageMs: 4 * 60_000 + 30_000 }), NOW, Z);
    expect(w.level).toBe('bad');
    expect(w.short).toBe('Recorder quiet 4 min');
    expect(w.details[0]).toMatch(/^The recorder last checked in at \d\d:\d\d\.$/);
  });

  it('switches to hours from 120 minutes', () => {
    expect(recorderWords(status({ ageMs: 119 * 60_000 }), NOW, Z).short).toBe('Recorder quiet 119 min');
    expect(recorderWords(status({ ageMs: 150 * 60_000 }), NOW, Z).short).toBe('Recorder quiet 2 h');
  });

  it('names one offline camera', () => {
    const w = recorderWords(status({ cameras: [cam('Front Door', { rtsp: 'down' })] }), NOW, Z);
    expect(w.short).toBe('Front Door offline');
    expect(w.level).toBe('bad');
  });

  it('counts two or more offline cameras', () => {
    const w = recorderWords(
      status({ cameras: [cam('A', { rtsp: 'down' }), cam('B', { rtsp: 'down' }), cam('C')] }),
      NOW,
      Z,
    );
    expect(w.short).toBe('2 cameras offline');
    expect(w.details.length).toBe(2);
  });

  it('names a degraded camera', () => {
    expect(recorderWords(status({ cameras: [cam('Garage', { rtsp: 'degraded' })] }), NOW, Z).short).toBe(
      'Garage degraded',
    );
  });

  it('names a camera whose events are not up', () => {
    const w = recorderWords(status({ cameras: [cam('Garage', { events: 'down' })] }), NOW, Z);
    expect(w.short).toBe('Garage degraded');
    expect(w.level).toBe('warn');
  });

  it('says storage delayed when the breaker is not closed', () => {
    const w = recorderWords(status({ storage: { state: 'open', since: iso(NOW - 600_000) } }), NOW, Z);
    expect(w.short).toBe('Storage delayed');
    expect(w.details[0]).toMatch(/^Saving to storage is delayed since \d\d:\d\d\.$/);
  });

  it('says Recorder OK otherwise', () => {
    expect(recorderWords(status({ storage: { state: 'closed' } }), NOW, Z)).toMatchObject({
      level: 'ok',
      short: 'Recorder OK',
    });
  });

  it('details use the display zone', () => {
    const now = Date.parse('2026-11-20T14:30:00Z');
    const s = status({ cameras: [cam('Front Door', { rtsp: 'down', since: '2026-11-20T14:04:00Z' })] });
    s.updated_at = '2026-11-20T14:29:30Z';
    expect(recorderWords(s, now, Z).details).toEqual(['Front Door has been offline since 21:04.']);
  });

  it('ok details', () => {
    const now = Date.parse('2026-11-20T14:47:00Z');
    const s = status();
    s.updated_at = '2026-11-20T14:46:00Z';
    expect(recorderWords(s, now, Z).details).toEqual(['The recorder checked in at 21:46.']);
  });
});
