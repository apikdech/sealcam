// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { createRawSnippet, untrack } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DashClient, FakePlayer, fakePlayerFactory, ids, sidecar } from '../../../test-support/dashboard-fakes';
import { FakePeer, FakeStream } from '../../../test-support/live-fakes';
import type { Request } from '../../worker/protocol';
import { drawTimeline } from '../../lib/timeline/render';
import { localDayRange } from '../../lib/timeline/timezone';
import Watch from './Watch.svelte';

// The viewer is in Berlin: any other zone must be chosen by hand.
vi.mock('../../lib/timeline/timezone', async (orig) => ({
  ...(await orig<typeof import('../../lib/timeline/timezone')>()),
  browserZone: () => 'Europe/Berlin',
}));

// Draw synchronously and record the layout, so the zoom the shortcuts reach
// can be read off the last frame. (untrack: the real scheduler draws outside effects.)
vi.mock('../../lib/timeline/render', async (orig) => ({
  ...(await orig<typeof import('../../lib/timeline/render')>()),
  createScheduler: (draw: () => void) => ({ invalidate: () => untrack(draw), dispose() {} }),
  drawTimeline: vi.fn(),
}));

// 2026-11-06 15:00 UTC, which is 22:00 on the 6th in Jakarta.
const NOW = Date.UTC(2026, 10, 6, 15, 0, 0);
const HOUR = 3_600_000;
const MIN = 60_000;
const [FROM, TO] = localDayRange('2026-11-06', 'Asia/Jakarta');
const iso = (ms: number) => new Date(ms).toISOString().replace('.000Z', 'Z');

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

function status(ageMs: number) {
  return {
    schema: 'zrec.status/1',
    relay_id: 'r',
    version: 'v',
    updated_at: iso(NOW - ageMs),
    key_id: '0123456789abcdef',
    cameras: [{ id: 'front-door', name: 'Front Door', rtsp: 'up', events: 'up', since: iso(NOW - 3_600_000), last_clip_at: null }],
  };
}

function client(): DashClient {
  const c = new DashClient();
  c.status = status(30_000);
  c.clips = [
    sidecar(ids.a, '2026-11-06T10:00:00Z'),
    sidecar(ids.b, '2026-11-06T11:00:00Z'),
    sidecar(ids.c, '2026-11-06T12:00:00Z', { triggers: [{ type: 'vehicle', first_at_ms: 0, last_at_ms: 5000 }] }),
  ];
  return c;
}

const twoCameras = (c: DashClient) => {
  c.cameras = [
    { id: 'front-door', name: 'Front Door' },
    { id: 'yard', name: 'Yard' },
  ];
  return c;
};

/** The relay filters by trigger; the fake does not, so do it here. */
function filtersTriggers(c: DashClient): DashClient {
  const get = c.call.bind(c);
  c.call = (async (m: Request) => {
    const r = await get(m);
    if (m.type === 'api.get' && m.path === '/api/v1/clips' && m.query.trigger) {
      const want = m.query.trigger as string[];
      const res = r as { clips: ReturnType<typeof sidecar>[]; invalid: number };
      return { ...res, clips: res.clips.filter((s) => (s.triggers as { type: string }[]).some((t) => want.includes(t.type))) };
    }
    return r;
  }) as never;
  return c;
}

const topRight = createRawSnippet(() => ({ render: () => '<span data-testid="top-right"></span>' }));

const mount = (c: DashClient, over: Record<string, unknown> = {}) =>
  render(Watch, { client: c, status: null, factory: fakePlayerFactory, zone: 'Asia/Jakarta', nowMs: NOW, profile: 'desktop', topRight, ...over });

const list = () => within(screen.getByRole('listbox', { name: /recordings/i }));
const listRows = async () => within(await screen.findByRole('listbox', { name: /recordings/i })).findAllByRole('option');
const selected = () => list().queryByRole('option', { selected: true })?.getAttribute('data-clip') ?? null;
const getsFor = (c: DashClient, path: string) =>
  c.calls.filter((m): m is Extract<Request, { type: 'api.get' }> => m.type === 'api.get' && m.path === path);
const lastClips = (c: DashClient) => getsFor(c, '/api/v1/clips').at(-1)!.query;

/** The day title button ("Friday 6 November Jakarta time · today"). */
const dayButton = () => screen.getByRole('button', { name: /day \d+ \w+.*time/ });
async function openDayMenu() {
  if (dayButton().getAttribute('aria-expanded') !== 'true') await fireEvent.click(dayButton());
  return within(screen.getByRole('dialog', { name: 'Day and time zone' }));
}
async function pickDate(day: string) {
  const menu = await openDayMenu();
  await fireEvent.change(menu.getByLabelText('Choose a date'), { target: { value: day } });
}
async function pickZone(zone: string) {
  const menu = await openDayMenu();
  await fireEvent.change(menu.getByLabelText('Time zone'), { target: { value: zone } });
}
const chip = (name: string) => within(screen.getByRole('group', { name: 'Filter by trigger' })).getByRole('button', { name });
const backToLive = () => screen.getByRole('button', { name: 'Back to live' });

describe('Watch', () => {
  it('is the main landmark with a Watch h1, and renders the top-right snippet', async () => {
    mount(client());
    expect(screen.getByRole('main')).toBe(screen.getByTestId('watch'));
    expect(screen.getByRole('heading', { level: 1, name: 'Watch' })).toBeInTheDocument();
    expect(screen.getByTestId('top-right')).toBeInTheDocument();
  });

  it('fills the window and never scrolls; only the rows scroll (jsdom has no layout, so the classes are pinned)', async () => {
    mount(client());
    expect(screen.getByTestId('watch')).toHaveClass('grid', 'h-dvh', 'overflow-hidden');
    const box = await screen.findByRole('listbox', { name: /recordings/i });
    // On phones the rows keep three rows (64 px each); e2e/dashboard.spec.ts checks the real layout.
    expect(box.parentElement).toHaveClass('overflow-y-auto', 'min-h-48', 'contain-size', 'wide:min-h-0');
  });

  it('no bottom sheet: the list is in the screen flow on phones', async () => {
    mount(client());
    const box = await screen.findByRole('listbox', { name: /recordings/i });
    expect(screen.queryByRole('button', { name: /^Events/ })).toBeNull();
    for (let el: HTMLElement | null = box; el; el = el.parentElement) {
      expect(el).not.toHaveClass('fixed');
      expect(el.className).not.toMatch(/max-md:h-|max-md:hidden/);
    }
  });

  it("shows the live grid and today's events newest first", async () => {
    mount(client());
    const r = await listRows();
    expect(r.map((x) => x.getAttribute('data-clip'))).toEqual([ids.c, ids.b, ids.a]);
    expect(screen.getByTestId('live-grid')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Today · 3 events' })).toBeInTheDocument();
    expect(screen.getByText('3 not checked yet')).toBeInTheDocument();
  });

  it('lists the day in local time', async () => {
    mount(client());
    const rows = await listRows();
    // 12:00Z is 19:00 in Jakarta.
    expect(rows[0]).toHaveTextContent('19:00');
  });

  it('opens on live with no Player; an event unmounts the grid for the Player; Back to live remounts the grid', async () => {
    mount(client());
    const r = await listRows();
    expect(screen.getByTestId('live-grid')).toBeInTheDocument();
    expect(screen.queryByTestId('player')).toBeNull();
    await fireEvent.click(r[1]!);
    expect(selected()).toBe(ids.b);
    expect(screen.queryByTestId('live-grid')).toBeNull();
    expect(screen.getByTestId('player')).toBeInTheDocument();
    await waitFor(() => expect(FakePlayer.instances[0]?.loads).toEqual([ids.b]));
    await waitFor(() => expect(screen.getByText('2 not checked yet')).toBeInTheDocument());
    await fireEvent.click(backToLive());
    expect(screen.getByTestId('live-grid')).toBeInTheDocument();
    expect(screen.queryByTestId('player')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Back to live' })).toBeNull();
    expect(selected()).toBeNull();
  });

  it('the Recording badge shows the playing clip’s trigger chips', async () => {
    mount(client());
    await fireEvent.click((await listRows())[0]!); // c: vehicle
    await waitFor(() => expect(within(screen.getByTestId('badge')).getByRole('img', { name: 'Vehicle' })).toHaveTextContent('V'));
  });

  it('a past day with a recording playing shows the prompt and no Player; today again shows live', async () => {
    mount(client());
    await fireEvent.click((await listRows())[0]!);
    expect(screen.getByTestId('player')).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
    expect(screen.getByText('Pick an event or a time on the timeline')).toBeInTheDocument();
    expect(screen.queryByTestId('player')).toBeNull();
    expect(screen.queryByTestId('live-grid')).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'Next day' }));
    expect(screen.getByTestId('live-grid')).toBeInTheDocument();
    expect(screen.queryByText('Pick an event or a time on the timeline')).toBeNull();
  });

  it('a live view follows the day over midnight and stays live', async () => {
    const c = client();
    const r = mount(c);
    await listRows();
    // 17:00Z on the 6th is midnight in Jakarta: the 7th starts.
    await r.rerender({ nowMs: Date.UTC(2026, 10, 6, 17, 0, 30) });
    expect(screen.getByTestId('live-grid')).toBeInTheDocument();
    expect(screen.queryByText('Pick an event or a time on the timeline')).toBeNull();
    expect(await screen.findByRole('heading', { name: /^Today · \d+ events$/ })).toBeInTheDocument();
    expect(dayButton()).toHaveTextContent('Saturday 7 November');
    await waitFor(() => expect(lastClips(c)).toMatchObject({ from: '2026-11-06T17:00:00.000Z', to: '2026-11-07T17:00:00.000Z' }));
  });

  it('a past day stays put over midnight', async () => {
    const r = mount(client());
    await listRows();
    await fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
    await r.rerender({ nowMs: Date.UTC(2026, 10, 6, 17, 0, 30) });
    expect(dayButton()).toHaveTextContent('Thursday 5 November');
  });

  it('Go to today on a past day returns to live today', async () => {
    mount(client());
    await listRows();
    await fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Go to today' }));
    expect(screen.getByTestId('live-grid')).toBeInTheDocument();
    expect(dayButton()).toHaveTextContent('Friday 6 November');
  });

  it('picking an event on a past day plays it', async () => {
    mount(client());
    await listRows();
    await fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
    await fireEvent.click((await listRows())[0]!);
    expect(screen.getByTestId('player')).toBeInTheDocument();
    expect(screen.queryByText('Pick an event or a time on the timeline')).toBeNull();
  });

  it('T on today returns to live from a recording', async () => {
    mount(client());
    await fireEvent.click((await listRows())[0]!);
    expect(screen.queryByTestId('live-grid')).toBeNull();
    await fireEvent.keyDown(window, { key: 't' });
    expect(screen.getByTestId('live-grid')).toBeInTheDocument();
    expect(screen.queryByTestId('player')).toBeNull();
  });

  it('Now on today returns to live from a recording', async () => {
    mount(client());
    await fireEvent.click((await listRows())[0]!);
    await fireEvent.click(screen.getByRole('button', { name: 'Now' }));
    expect(screen.getByTestId('live-grid')).toBeInTheDocument();
  });

  it('a timeline click after the now line returns to live', async () => {
    mount(client());
    await fireEvent.click((await listRows())[0]!);
    const canvas = screen.getByRole('application');
    // The canvas is 1000 px for the whole Jakarta day; now (22:00) is at about 917 px.
    await fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 960, clientY: 30 });
    await fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 960, clientY: 30 });
    expect(screen.getByTestId('live-grid')).toBeInTheDocument();
    expect(screen.queryByTestId('player')).toBeNull();
  });

  it('says All verified once every event has been checked', async () => {
    const c = new DashClient();
    c.clips = [sidecar(ids.a, '2026-11-06T10:00:00Z')];
    mount(c);
    await fireEvent.click((await listRows())[0]!);
    expect(await screen.findByText('All verified')).toBeInTheDocument();
  });

  it('a day with no events shows the sentence', async () => {
    mount(new DashClient());
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
    expect(screen.queryByRole('listbox', { name: /recordings/i })).toBeNull();
    fail = false;
    await fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect((await listRows()).length).toBe(3);
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

  it("previous day loads that day's events", async () => {
    const c = client();
    mount(c);
    await listRows();
    await fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
    await waitFor(() => expect(lastClips(c)).toMatchObject({ from: '2026-11-04T17:00:00.000Z', to: '2026-11-05T17:00:00.000Z' }));
    expect(await screen.findByRole('heading', { name: /^Thursday 5 November · \d+ events$/ })).toBeInTheDocument();
  });

  it('re-queries for a day picked in the day menu', async () => {
    const c = client();
    mount(c);
    await listRows();
    await pickDate('2026-11-05');
    await waitFor(() => expect(lastClips(c)).toMatchObject({ from: '2026-11-04T17:00:00.000Z', to: '2026-11-05T17:00:00.000Z' }));
    expect(screen.queryByRole('dialog', { name: 'Day and time zone' })).toBeNull();
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
    await listRows();
    hold = true;
    await fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
    expect(screen.queryByRole('listbox', { name: /recordings/i })).toBeNull();
    expect(screen.queryByRole('heading', { name: /events$/ })).toBeNull();
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    hold = false;
    release();
    expect(await screen.findByRole('heading', { name: /^Thursday 5 November · 3 events$/ })).toBeInTheDocument();
    expect((await listRows()).length).toBe(3);
  });

  it('in live mode Space and the arrows keep their default', async () => {
    mount(client());
    await listRows();
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
    await fireEvent.click((await listRows())[0]!);
    await waitFor(() => expect(FakePlayer.instances[0]?.loads.length).toBe(1));
    await fireEvent.click(backToLive());
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
    await listRows();
    hold = true;
    await fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    for (const key of ['[', ']']) {
      const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      window.dispatchEvent(e);
      expect(e.defaultPrevented, key).toBe(false);
    }
  });

  it('does not poll the relay status itself', async () => {
    const c = client();
    mount(c);
    await listRows();
    expect(getsFor(c, '/api/v1/status')).toHaveLength(0);
    expect(screen.queryByRole('img', { name: /relay/i })).toBeNull();
  });

  it('the legend names every trigger and not monitored', async () => {
    mount(client());
    await listRows();
    const legend = within(screen.getByRole('list', { name: 'Legend' }));
    for (const word of ['Person', 'Vehicle', 'Pet', 'Motion', 'Other', 'not monitored', 'Failed verification', 'Metadata mismatch']) {
      expect(legend.getByText(word)).toBeInTheDocument();
    }
  });

  it('the ? button discloses Space, J, K, [, ] and T', async () => {
    mount(client());
    await listRows();
    const toggle = screen.getByRole('button', { name: 'Keyboard shortcuts' });
    expect(toggle).toHaveTextContent('?');
    expect(toggle).toHaveAttribute('aria-controls', 'shortcuts');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Space')).toBeNull();
    await fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    for (const key of ['Space', 'J', 'K', '[', ']', 'T']) expect(screen.getByText(key)).toBeInTheDocument();
  });

  it('the span readout updates after zoom', async () => {
    mount(client());
    await listRows();
    const readout = screen.getByText('24 h');
    expect(readout).toHaveAttribute('aria-live', 'polite');
    await fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(readout).toHaveTextContent('6 h');
    await fireEvent.keyDown(window, { key: ']' });
    expect(readout).toHaveTextContent('1 h');
  });

  it('asks for the Jakarta day in UTC', async () => {
    const c = client();
    mount(c);
    await listRows();
    expect(getsFor(c, '/api/v1/clips')[0]!.query).toMatchObject({
      from: '2026-11-05T17:00:00.000Z',
      to: '2026-11-06T17:00:00.000Z',
    });
  });

  it('K selects the next clip and J the previous one', async () => {
    mount(client());
    await listRows();
    expect(selected()).toBeNull();
    await fireEvent.keyDown(window, { key: 'k' }); // nothing selected: the newest
    expect(selected()).toBe(ids.c);
    await fireEvent.keyDown(window, { key: 'J' });
    expect(selected()).toBe(ids.b);
    await fireEvent.keyDown(window, { key: 'j' });
    expect(selected()).toBe(ids.a);
    await fireEvent.keyDown(window, { key: 'j' });
    expect(selected()).toBe(ids.a);
    await fireEvent.keyDown(window, { key: 'K' });
    expect(selected()).toBe(ids.b);
    await waitFor(() => expect(FakePlayer.instances[0]?.loads.at(-1)).toBe(ids.b));
  });

  it('ignores the shortcuts while typing in a field', async () => {
    mount(client());
    await listRows();
    const menu = await openDayMenu();
    await fireEvent.keyDown(menu.getByLabelText('Choose a date'), { key: 'k' });
    expect(selected()).toBeNull();
  });

  it('says how many recordings could not be read', async () => {
    const c = client();
    c.invalid = 2;
    mount(c);
    expect(await screen.findByText(/2 recordings could not be read/i)).toBeInTheDocument();
  });

  it('marks an incomplete clip in the list before it is opened', async () => {
    const c = client();
    c.clips = [sidecar(ids.a, '2026-11-06T10:00:00Z', { status: 'incomplete', end_time: null, duration_ms: null })];
    mount(c);
    const row = (await listRows())[0]!;
    expect(row.querySelector('[data-seal-state="incomplete"]')).not.toBeNull();
  });

  it('records the integrity the player reports in the list', async () => {
    FakePlayer.nextIntegrity = 'tampered';
    mount(client());
    const rows = await listRows();
    await fireEvent.click(rows[0]!);
    await waitFor(() => expect(rows[0]!.querySelector('[data-seal-state="tampered"]')).not.toBeNull());
  });
});

describe('filters', () => {
  it('the camera select is absent with one camera and present with two', async () => {
    const a = mount(client());
    await listRows();
    expect(screen.queryByRole('combobox', { name: 'Camera' })).toBeNull();
    a.unmount();
    mount(twoCameras(client()));
    await listRows();
    expect(screen.getByRole('combobox', { name: 'Camera' })).toHaveValue('');
  });

  it('tapping a tile with two cameras filters to that camera', async () => {
    const c = twoCameras(client());
    mount(c);
    await listRows();
    expect(screen.getAllByTestId('live-tile')).toHaveLength(2);
    const yard = screen.getAllByTestId('live-tile').find((t) => t.dataset.camera === 'yard')!;
    await fireEvent.click(yard.querySelector('video')!);
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Camera' })).toHaveValue('yard'));
    expect(screen.getAllByTestId('live-tile')).toHaveLength(1);
    expect(screen.getByTestId('live-tile').dataset.camera).toBe('yard');
    await waitFor(() => expect(lastClips(c)).toMatchObject({ camera: 'yard' }));
    // The live bar offers the way back.
    await fireEvent.click(screen.getByRole('button', { name: 'All cameras' }));
    await waitFor(() => expect(screen.getAllByTestId('live-tile')).toHaveLength(2));
    expect(screen.getByRole('combobox', { name: 'Camera' })).toHaveValue('');
  });

  it('with one camera the live bar has no All cameras button', async () => {
    mount(client());
    await listRows();
    expect(screen.getByTestId('live-tile')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'All cameras' })).toBeNull();
  });

  it('pressing Person reloads the day with that trigger and lists only person rows', async () => {
    const c = filtersTriggers(client());
    mount(c);
    expect(await listRows()).toHaveLength(3);
    expect(chip('All')).toHaveAttribute('aria-pressed', 'true');
    await fireEvent.click(chip('Person'));
    expect(chip('Person')).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(lastClips(c)).toMatchObject({ trigger: ['person'] }));
    await waitFor(async () => expect((await listRows()).map((r) => r.getAttribute('data-clip'))).toEqual([ids.b, ids.a]));
  });

  it('re-queries with the camera and trigger filters', async () => {
    const c = twoCameras(client());
    mount(c);
    await listRows();
    await fireEvent.change(screen.getByLabelText('Camera'), { target: { value: 'yard' } });
    await fireEvent.click(chip('Person'));
    await waitFor(() => expect(lastClips(c)).toMatchObject({ camera: 'yard', trigger: ['person'] }));
  });

  it('hides the could-not-be-read note while a day error shows', async () => {
    const c = client();
    c.invalid = 2;
    mount(c);
    expect(await screen.findByText(/2 recordings could not be read/i)).toBeInTheDocument();
    const ok = c.call.bind(c);
    let fail = true;
    c.call = (async (m: Request) => {
      if (fail && m.type === 'api.get' && m.path === '/api/v1/clips') throw new Error('down');
      return ok(m);
    }) as never;
    await fireEvent.click(chip('Person'));
    await screen.findByRole('button', { name: 'Try again' });
    // Back to the filter that did load: the loaded rows match again, but the error is current.
    await fireEvent.click(chip('All'));
    await screen.findByRole('button', { name: 'Try again' });
    expect(screen.queryByText(/could not be read/i)).toBeNull();
    fail = false;
  });

  it('keeps the zoom when a filter changes', async () => {
    mount(client());
    await listRows();
    await fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(screen.getByText('6 h')).toBeInTheDocument();
    await fireEvent.click(chip('Person'));
    await listRows();
    expect(screen.getByText('6 h')).toBeInTheDocument();
    expect(screen.queryByText('24 h')).toBeNull();
  });

  it('never shows the previous filter rows under a new filter', async () => {
    const c = twoCameras(client());
    mount(c);
    await listRows();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const ok = c.call.bind(c);
    c.call = (async (m: Request) => {
      if (m.type === 'api.get' && m.path === '/api/v1/clips') await gate;
      return ok(m);
    }) as never;
    await fireEvent.change(screen.getByLabelText('Camera'), { target: { value: 'yard' } });
    expect(await screen.findByText('Loading…')).toBeInTheDocument();
    expect(screen.queryByRole('listbox', { name: /recordings/i })).toBeNull();
    release();
    expect(await listRows()).toHaveLength(3);
    expect(screen.queryByText('Loading…')).toBeNull();
  });
});

// ---- shortcuts and transport reach the player and the timeline -----------------

describe('shortcuts and transport', () => {
  const video = () => screen.getByTestId('player') as HTMLVideoElement;
  const view = () => vi.mocked(drawTimeline).mock.calls.at(-1)![1].view;
  const canvas = () => screen.getByRole('application');
  const keys = (key: string, times = 1) => {
    for (let i = 0; i < times; i++) fireEvent.keyDown(window, { key });
  };

  /** Controls what the page sees of the video: its play state and clock. */
  function stubVideo(over: { paused?: boolean; currentTimeSec?: number } = {}) {
    const v = video();
    let paused = over.paused ?? true;
    Object.defineProperty(v, 'paused', { get: () => paused, configurable: true });
    Object.defineProperty(v, 'currentTime', { get: () => over.currentTimeSec ?? 0, configurable: true });
    const play = vi.fn(() => {
      paused = false;
      return Promise.resolve();
    });
    const pause = vi.fn(() => {
      paused = true;
    });
    v.play = play;
    v.pause = pause;
    return { play, pause };
  }

  /** A recording playing: row `i` of the list (newest first; 2 is the oldest, a). */
  async function ready(i = 2) {
    const c = client();
    mount(c);
    await fireEvent.click((await listRows())[i]!);
    await waitFor(() => expect(FakePlayer.instances).toHaveLength(1));
    return c;
  }

  describe('keyboard', () => {
    it('Space plays a paused video and pauses a playing one', async () => {
      await ready();
      const { play, pause } = stubVideo({ paused: true });
      keys(' ');
      expect(play).toHaveBeenCalledTimes(1);
      keys(' ');
      expect(pause).toHaveBeenCalledTimes(1);
    });

    it('ArrowRight and ArrowLeft seek the player 10 s from the playhead', async () => {
      await ready();
      stubVideo({ currentTimeSec: 30 });
      const engine = FakePlayer.instances[0]!;
      keys('ArrowRight');
      keys('ArrowLeft');
      expect(engine.seeks).toEqual([40_000, 20_000]);
    });

    it('ArrowLeft stops at the start of the clip', async () => {
      await ready();
      stubVideo({ currentTimeSec: 3 });
      keys('ArrowLeft');
      expect(FakePlayer.instances[0]!.seeks).toEqual([0]);
    });

    it('] zooms the timeline in and [ zooms it out', async () => {
      await ready();
      expect(view().spanMs).toBe(TO - FROM);
      keys(']');
      expect(view().spanMs).toBe(6 * HOUR);
      keys(']');
      expect(view().spanMs).toBe(HOUR);
      keys('[');
      expect(view().spanMs).toBe(6 * HOUR);
      keys('[', 2);
      expect(view().spanMs).toBe(TO - FROM);
    });

    it('T centres the timeline on now', async () => {
      await ready();
      keys(']', 3); // 10 min around now
      // The focused timeline pans on ArrowLeft by itself, and the page leaves that key to it.
      for (let i = 0; i < 30; i++) fireEvent.keyDown(canvas(), { key: 'ArrowLeft' });
      expect(NOW).toBeGreaterThan(view().startMs + view().spanMs);
      keys('t');
      expect(view().spanMs).toBe(10 * MIN);
      expect(view().startMs + view().spanMs / 2).toBe(NOW);
      expect(FakePlayer.instances[0]!.seeks).toEqual([]); // the arrows moved the timeline, not the player
    });

    it('T on another day switches to today, reloads it and shows it', async () => {
      const c = await ready();
      await pickDate('2026-11-05');
      await waitFor(() => expect(view().startMs).toBe(FROM - 24 * HOUR));
      keys(']');
      expect(view().spanMs).toBe(6 * HOUR);
      keys('T');
      await waitFor(() => expect(dayButton()).toHaveTextContent('Friday 6 November'));
      await waitFor(() => expect(view().startMs).toBe(FROM));
      expect(lastClips(c)).toMatchObject({
        from: '2026-11-05T17:00:00.000Z',
        to: '2026-11-06T17:00:00.000Z',
      });
      // Centring on now within the freshly shown whole day leaves the whole day in view.
      await waitFor(() => expect(view()).toEqual({ startMs: FROM, spanMs: TO - FROM }));
      expect(screen.getByTestId('live-grid')).toBeInTheDocument();
    });

    it('highlights the selected clip in the timeline', async () => {
      mount(client());
      await listRows();
      keys('k');
      await waitFor(() => expect(vi.mocked(drawTimeline).mock.calls.at(-1)![2].selectedClipId).toBe(ids.c));
    });
  });

  describe('transport buttons', () => {
    const press = (name: string) => fireEvent.click(screen.getByRole('button', { name }));

    it('Play/Pause toggles playback', async () => {
      await ready();
      const { play, pause } = stubVideo({ paused: true });
      await press('Play');
      expect(play).toHaveBeenCalledTimes(1);
      await press('Play');
      expect(pause).toHaveBeenCalledTimes(1);
    });

    it('-10 s and +10 s seek the player', async () => {
      await ready();
      stubVideo({ currentTimeSec: 30 });
      await press('Forward 10 seconds');
      await press('Back 10 seconds');
      expect(FakePlayer.instances[0]!.seeks).toEqual([40_000, 20_000]);
    });

    it('Prev and Next select the neighbouring clips', async () => {
      await ready();
      expect(selected()).toBe(ids.a);
      await press('Next clip');
      expect(selected()).toBe(ids.b);
      await press('Next clip');
      expect(selected()).toBe(ids.c);
      await press('Previous clip');
      expect(selected()).toBe(ids.b);
    });

    it('Zoom in and Zoom out step the timeline', async () => {
      await ready();
      await press('Zoom in');
      expect(view().spanMs).toBe(6 * HOUR);
      await press('Zoom in');
      expect(view().spanMs).toBe(HOUR);
      await press('Zoom out');
      expect(view().spanMs).toBe(6 * HOUR);
    });

    it('Now centres the timeline on now', async () => {
      await ready();
      await press('Zoom in');
      await press('Zoom in');
      await press('Zoom in');
      for (let i = 0; i < 30; i++) fireEvent.keyDown(canvas(), { key: 'ArrowRight' });
      await press('Now');
      expect(view().startMs + view().spanMs / 2).toBe(NOW);
    });

    it('Now on another day returns to today', async () => {
      await ready();
      await pickDate('2026-11-04');
      await waitFor(() => expect(view().startMs).toBe(FROM - 2 * 24 * HOUR));
      await press('Now');
      await waitFor(() => expect(dayButton()).toHaveTextContent('Friday 6 November'));
      await waitFor(() => expect(view().startMs).toBe(FROM));
    });
  });

  describe('while the export confirmation is open', () => {
    async function openExport() {
      await ready(1); // b
      const btn = await screen.findByRole('button', { name: 'Export' });
      await waitFor(() => expect(btn).toBeEnabled());
      const vid = stubVideo({ paused: true });
      await fireEvent.click(btn);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      return vid;
    }

    it('J and K leave the selection and the loaded clip alone', async () => {
      await openExport();
      const dialog = screen.getByRole('dialog');
      await fireEvent.keyDown(dialog, { key: 'k' });
      await fireEvent.keyDown(dialog, { key: 'J' });
      await fireEvent.keyDown(window, { key: 'k' });
      expect(selected()).toBe(ids.b);
      expect(FakePlayer.instances[0]!.loads).toEqual([ids.b]);
    });

    it('Space and the arrows do not control playback behind the dialog', async () => {
      const { play } = await openExport();
      const engine = FakePlayer.instances[0]!;
      const dialog = screen.getByRole('dialog');
      for (const key of [' ', 'ArrowLeft', 'ArrowRight']) await fireEvent.keyDown(dialog, { key });
      await fireEvent.keyDown(window, { key: ' ' });
      expect(play).not.toHaveBeenCalled();
      expect(engine.seeks).toEqual([]);
    });

    it('the zoom and now shortcuts are ignored too', async () => {
      await openExport();
      const before = view().spanMs;
      keys(']');
      keys('t');
      expect(view().spanMs).toBe(before);
      expect(screen.getByTestId('player')).toBeInTheDocument();
    });

    it('works again once the dialog is closed', async () => {
      await openExport();
      await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(screen.queryByRole('dialog')).toBeNull();
      keys('j');
      expect(selected()).toBe(ids.a);
    });
  });
});

describe('forced display zone', () => {
  // 20:00 UTC: 21:00 on the 6th in Berlin, but already 03:00 on the 7th at home in Jakarta.
  const EVENING = Date.UTC(2026, 10, 6, 20, 0, 0);
  const mountAbroad = (c: DashClient) =>
    render(Watch, { client: c, status: null, factory: fakePlayerFactory, nowMs: EVENING, profile: 'desktop', topRight });
  const firstRange = (c: DashClient) => getsFor(c, '/api/v1/clips')[0]!.query;
  const dayRange = (day: string, zone: string) => {
    const [from, to] = localDayRange(day, zone);
    return { from: new Date(from).toISOString(), to: new Date(to).toISOString() };
  };

  it('the time zone select is in the day menu, not on the screen', async () => {
    mountAbroad(client());
    await listRows();
    expect(screen.queryByRole('combobox', { name: 'Time zone' })).toBeNull();
    const menu = await openDayMenu();
    expect(menu.getByRole('combobox', { name: 'Time zone' })).toBeInTheDocument();
    expect(menu.getByRole('option', { name: 'Jakarta' })).toHaveValue('Asia/Jakarta');
  });

  it("follows the viewer's own zone until one is forced", async () => {
    const c = client();
    mountAbroad(c);
    await listRows();
    expect(firstRange(c)).toMatchObject(dayRange('2026-11-06', 'Europe/Berlin'));
    expect((await openDayMenu()).getByLabelText('Time zone')).toHaveValue('');
  });

  it("lets a relative abroad see the house's day in Asia/Jakarta", async () => {
    const c = client();
    mountAbroad(c);
    await listRows();
    await pickZone('Asia/Jakarta');
    // "Today" is now Jakarta's today (the 7th) and the range is that Jakarta day.
    await waitFor(() => expect(lastClips(c)).toMatchObject(dayRange('2026-11-07', 'Asia/Jakarta')));
    expect((await openDayMenu()).getByLabelText('Choose a date')).toHaveValue('2026-11-07');
    // The evening of the 6th at home reads 19:00 for a 12:00Z clip, not 13:00 as in Berlin.
    await pickDate('2026-11-06');
    await waitFor(() => expect(lastClips(c)).toMatchObject(dayRange('2026-11-06', 'Asia/Jakarta')));
    const rows = await listRows();
    expect(rows[0]).toHaveTextContent('19:00');
  });

  it('remembers the choice for the next visit', async () => {
    const { unmount } = mountAbroad(client());
    await listRows();
    await pickZone('Asia/Jakarta');
    expect(localStorage.getItem('zview.zone')).toBe('Asia/Jakarta');
    unmount();
    const c = client();
    mountAbroad(c);
    await listRows();
    expect(firstRange(c)).toMatchObject(dayRange('2026-11-07', 'Asia/Jakarta'));
    expect((await openDayMenu()).getByLabelText('Time zone')).toHaveValue('Asia/Jakarta');
  });

  it("goes back to the viewer's zone when the choice is cleared", async () => {
    localStorage.setItem('zview.zone', 'Asia/Jakarta');
    const c = client();
    mountAbroad(c);
    await listRows();
    await pickZone('');
    await waitFor(() => expect(lastClips(c)).toMatchObject(dayRange('2026-11-06', 'Europe/Berlin')));
    expect(localStorage.getItem('zview.zone')).toBeNull();
  });

  it('ignores a remembered zone that is not valid', async () => {
    localStorage.setItem('zview.zone', 'Mars/Olympus');
    const c = client();
    mountAbroad(c);
    await listRows();
    expect(firstRange(c)).toMatchObject(dayRange('2026-11-06', 'Europe/Berlin'));
  });
});
