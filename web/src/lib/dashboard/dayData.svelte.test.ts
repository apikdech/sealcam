// @vitest-environment jsdom
import { flushSync } from 'svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { DashClient, ids, sidecar } from '../../../test-support/dashboard-fakes';
import type { Request } from '../../worker/protocol';
import { createDayData } from './dayData.svelte';

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const c of cleanups.splice(0)) c();
});

const settle = async () => {
  for (let i = 0; i < 6; i++) {
    await Promise.resolve();
    flushSync();
  }
};

function setup(client: DashClient, initial: { day: string; camera?: string; triggers?: string[] } = { day: '2026-11-06' }) {
  const q = $state({ ...initial });
  let data!: ReturnType<typeof createDayData>;
  cleanups.push(
    $effect.root(() => {
      data = createDayData(client, () => ({ zone: 'UTC', ...q }));
    }),
  );
  flushSync();
  return { q, data };
}

function seeded(): DashClient {
  const c = new DashClient();
  c.clips = [sidecar(ids.a, '2026-11-06T10:00:00Z'), sidecar(ids.b, '2026-11-06T11:00:00Z')];
  return c;
}

describe('createDayData', () => {
  it('loads cameras, then the day, and derives rows newest first and clips oldest first', async () => {
    const { data } = setup(seeded());
    expect(data.cameras).toBeNull();
    expect(data.ready).toBe(false);
    await settle();
    expect(data.cameras).toEqual([{ id: 'front-door', name: 'Front Door' }]);
    expect(data.ready).toBe(true);
    expect(data.rows.map((r) => r.id)).toEqual([ids.b, ids.a]);
    expect(data.timelineClips.map((c) => c.id)).toEqual([ids.a, ids.b]);
    expect(data.nameOf('front-door')).toBe('Front Door');
    expect(data.nameOf('x')).toBe('x');
  });

  it('is not ready for a new day or filter until the matching load resolves', async () => {
    const c = seeded();
    const { q, data } = setup(c);
    await settle();
    expect(data.ready).toBe(true);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const call = c.call.bind(c);
    c.call = (async (m: Request) => {
      if (m.type === 'api.get' && m.path === '/api/v1/clips') await gate;
      return call(m);
    }) as never;
    q.camera = 'front-door';
    flushSync();
    await settle();
    expect(data.ready).toBe(false);
    release();
    await settle();
    expect(data.ready).toBe(true);
  });

  it('reports a locked key and a failed load apart', async () => {
    const locked = new DashClient();
    locked.call = async () => {
      throw Object.assign(new Error('no key'), { name: 'ErrNoKey' });
    };
    const a = setup(locked);
    await settle();
    expect(a.data.error).toBe('key');

    const c = seeded();
    const call = c.call.bind(c);
    c.call = (async (m: Request) => {
      if (m.type === 'api.get' && m.path === '/api/v1/clips') throw new Error('down');
      return call(m);
    }) as never;
    const b = setup(c);
    await settle();
    expect(b.data.error).toBe('');
    expect(b.data.dayError).toBe('failed');
    expect(b.data.ready).toBe(false);
  });

  it('retry clears the errors and loads again', async () => {
    const c = seeded();
    const call = c.call.bind(c);
    let fail = true;
    c.call = (async (m: Request) => {
      if (fail && m.type === 'api.get' && m.path === '/api/v1/clips') throw new Error('down');
      return call(m);
    }) as never;
    const { data } = setup(c);
    await settle();
    expect(data.dayError).toBe('failed');
    fail = false;
    data.retry();
    flushSync();
    await settle();
    expect(data.dayError).toBe('');
    expect(data.ready).toBe(true);
    expect(data.rows).toHaveLength(2);
  });

  it('counts recordings that could not be read', async () => {
    const c = seeded();
    c.invalid = 2;
    const { data } = setup(c);
    await settle();
    expect(data.invalid).toBe(2);
  });
});
