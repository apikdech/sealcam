// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { untrack } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DashClient, FakePlayer, fakePlayerFactory, ids, sidecar } from '../../../test-support/dashboard-fakes';
import { FakePeer, FakeStream } from '../../../test-support/live-fakes';
import { drawTimeline } from '../../lib/timeline/render';
import Home from './Home.svelte';

vi.mock('../../lib/timeline/render', async (orig) => ({
  ...(await orig<typeof import('../../lib/timeline/render')>()),
  createScheduler: (draw: () => void) => ({ invalidate: () => untrack(draw), dispose() {} }),
  drawTimeline: vi.fn(),
}));

// 2026-11-06 15:00 UTC, which is 22:00 on the 6th in Jakarta.
const NOW = Date.UTC(2026, 10, 6, 15, 0, 0);

class FakeResizeObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
}

beforeEach(() => {
  FakePlayer.instances = [];
  FakePlayer.nextIntegrity = 'verified';
  FakePeer.instances = [];
  vi.stubGlobal('RTCPeerConnection', FakePeer);
  vi.stubGlobal('MediaStream', FakeStream);
  globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver;
  HTMLCanvasElement.prototype.getContext = (() => ({ setTransform() {} })) as never;
  Object.defineProperty(HTMLCanvasElement.prototype, 'clientWidth', { get: () => 1000, configurable: true });
  vi.mocked(drawTimeline).mockClear();
  HTMLMediaElement.prototype.play = () => Promise.resolve();
  HTMLMediaElement.prototype.pause = () => {};
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

function client(): DashClient {
  const c = new DashClient();
  c.clips = [
    sidecar(ids.a, '2026-11-06T10:00:00Z'),
    sidecar(ids.b, '2026-11-06T11:00:00Z'),
    sidecar(ids.c, '2026-11-06T12:00:00Z', { triggers: [{ type: 'vehicle', first_at_ms: 0, last_at_ms: 5000 }] }),
  ];
  return c;
}

const mount = (c: DashClient) =>
  render(Home, { client: c, status: null, factory: fakePlayerFactory, zone: 'Asia/Jakarta', nowMs: NOW, profile: 'desktop' });

const rows = async () => within(await screen.findByRole('listbox', { name: /recordings/i })).findAllByRole('option');

describe('Home', () => {
  it("shows the live grid and today's events newest first", async () => {
    mount(client());
    const r = await rows();
    expect(r.map((x) => x.getAttribute('data-clip'))).toEqual([ids.c, ids.b, ids.a]);
    expect(screen.getByTestId('live-grid')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Today · 3 events' })).toBeInTheDocument();
    expect(screen.getByText('3 not checked yet')).toBeInTheDocument();
  });

  it('selecting an event shows the player and Back to live restores the grid', async () => {
    mount(client());
    const r = await rows();
    await fireEvent.click(r[1]!);
    expect(screen.queryByTestId('live-grid')).toBeNull();
    await waitFor(() => expect(FakePlayer.instances[0]?.loads).toEqual([ids.b]));
    await waitFor(() => expect(screen.getByText('2 not checked yet')).toBeInTheDocument());
    await fireEvent.click(screen.getByRole('button', { name: /back to live/i }));
    expect(screen.getByTestId('live-grid')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /back to live/i })).toBeNull();
  });

  it('says All verified once every event has been checked', async () => {
    const c = new DashClient();
    c.clips = [sidecar(ids.a, '2026-11-06T10:00:00Z')];
    mount(c);
    await fireEvent.click((await rows())[0]!);
    expect(await screen.findByText('All verified')).toBeInTheDocument();
  });

  it('a day with no events shows the sentence', async () => {
    const c = new DashClient();
    mount(c);
    expect(await screen.findByText('No recordings on this day.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Today · 0 events' })).toBeInTheDocument();
  });

  it('no cameras shows the sentence', async () => {
    const c = new DashClient();
    c.cameras = [];
    mount(c);
    expect(await screen.findByText('No cameras are set up yet.')).toBeInTheDocument();
  });

  it('a recordings failure shows Try again, which reloads', async () => {
    const c = client();
    const get = c.call.bind(c);
    let fail = true;
    c.call = (async (msg: Parameters<DashClient['call']>[0]) => {
      if (fail && msg.type === 'api.get' && msg.path === '/api/v1/clips') throw new Error('down');
      return get(msg);
    }) as DashClient['call'];
    mount(c);
    expect(await screen.findByText('Could not load recordings.')).toBeInTheDocument();
    fail = false;
    await fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect((await rows()).length).toBe(3);
    expect(screen.queryByText('Could not load recordings.')).toBeNull();
  });

  it('ErrNoKey shows the Unlock link', async () => {
    const c = new DashClient();
    c.call = (async () => {
      const e = new Error('no key');
      e.name = 'ErrNoKey';
      throw e;
    }) as DashClient['call'];
    mount(c);
    expect(await screen.findByText('Your key is locked.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Unlock' })).toHaveAttribute('href', '#/key');
  });

  it("previous day loads that day's events", async () => {
    const c = client();
    mount(c);
    await rows();
    await fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
    await waitFor(() => {
      const q = c.calls.filter((m) => m.type === 'api.get' && m.path === '/api/v1/clips').at(-1) as { query: Record<string, string> };
      expect(q.query).toMatchObject({ from: '2026-11-04T17:00:00.000Z', to: '2026-11-05T17:00:00.000Z' });
    });
    expect(await screen.findByRole('heading', { name: /^Thursday 5 November · \d+ events$/ })).toBeInTheDocument();
  });

  it('K selects the newest event, as on the Timeline page', async () => {
    mount(client());
    await rows();
    await fireEvent.keyDown(window, { key: 'k' });
    await waitFor(() => expect(FakePlayer.instances[0]?.loads.at(-1)).toBe(ids.c));
  });

  it('does not show the old day under the new heading while the new day loads', async () => {
    const c = client();
    const get = c.call.bind(c);
    let release: () => void = () => {};
    let hold = false;
    c.call = (async (msg: Parameters<DashClient['call']>[0]) => {
      if (hold && msg.type === 'api.get' && msg.path === '/api/v1/clips') await new Promise<void>((r) => (release = r));
      return get(msg);
    }) as DashClient['call'];
    mount(c);
    await rows();
    hold = true;
    await fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
    expect(screen.queryByRole('listbox', { name: /recordings/i })).toBeNull();
    expect(screen.queryByRole('heading', { name: /events$/ })).toBeNull();
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    hold = false;
    release();
    expect(await screen.findByRole('heading', { name: /^Thursday 5 November · 3 events$/ })).toBeInTheDocument();
    expect((await rows()).length).toBe(3);
  });

  it('changing the day returns to live and clears the selection', async () => {
    mount(client());
    await fireEvent.click((await rows())[0]!);
    expect(screen.queryByTestId('live-grid')).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
    expect(screen.getByTestId('live-grid')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /back to live/i })).toBeNull();
  });

  it('a recordings failure keeps the live grid mounted', async () => {
    const c = client();
    const get = c.call.bind(c);
    c.call = (async (msg: Parameters<DashClient['call']>[0]) => {
      if (msg.type === 'api.get' && msg.path === '/api/v1/clips') throw new Error('down');
      return get(msg);
    }) as DashClient['call'];
    mount(c);
    expect(await screen.findByText('Could not load recordings.')).toBeInTheDocument();
    expect(screen.getByTestId('live-grid')).toBeInTheDocument();
    expect(screen.queryByRole('listbox', { name: /recordings/i })).toBeNull();
  });

  it('in live mode Space and the arrows keep their default', async () => {
    mount(client());
    await rows();
    for (const key of [' ', 'ArrowLeft', 'ArrowRight']) {
      const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      window.dispatchEvent(e);
      expect(e.defaultPrevented, key).toBe(false);
    }
  });

  it('J and K keep their default when the day has no events', async () => {
    mount(new DashClient());
    await screen.findByText('No recordings on this day.');
    const e = new KeyboardEvent('keydown', { key: 'k', bubbles: true, cancelable: true });
    window.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
  });

  it('after Back to live, Space keeps its default again', async () => {
    mount(client());
    await fireEvent.click((await rows())[0]!);
    await waitFor(() => expect(FakePlayer.instances[0]?.loads.length).toBe(1));
    await fireEvent.click(screen.getByRole('button', { name: /back to live/i }));
    const e = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    window.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
  });

  it('while the day loads, [ and ] keep their default', async () => {
    const c = client();
    const get = c.call.bind(c);
    let hold = false;
    c.call = (async (msg: Parameters<DashClient['call']>[0]) => {
      if (hold && msg.type === 'api.get' && msg.path === '/api/v1/clips') await new Promise<void>(() => {});
      return get(msg);
    }) as DashClient['call'];
    mount(c);
    await rows();
    hold = true;
    await fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    for (const key of ['[', ']']) {
      const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      window.dispatchEvent(e);
      expect(e.defaultPrevented, key).toBe(false);
    }
  });
});
