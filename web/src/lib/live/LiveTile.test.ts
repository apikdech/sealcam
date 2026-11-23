// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeClient, FakePeer, FakeStream } from '../../../test-support/live-fakes';
import LiveTile from './LiveTile.svelte';
import type { Tile, TileOptions, TileSnapshot } from './tile';

let request: ReturnType<typeof vi.fn>;

const flush = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};

function setFullscreenElement(el: Element | null) {
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: el });
  document.dispatchEvent(new Event('fullscreenchange'));
}

const ZONE = 'UTC';

function renderTile() {
  render(LiveTile, { cameraId: 'front', name: 'Front', client: new FakeClient(), zone: ZONE });
  return screen.getByTestId('live-tile');
}

async function goLive(tile: HTMLElement) {
  await flush();
  tile.querySelector('video')!.dispatchEvent(new Event('playing'));
  await tick();
}

/** A stand-in tile whose state the test drives. */
function fakeTile() {
  const f = {
    opts: null as TileOptions | null,
    tryNow: vi.fn(),
    setOffline: vi.fn(),
    toggleMute: vi.fn(),
    start: vi.fn(),
    destroy: vi.fn(),
    async emit(s: Partial<TileSnapshot>) {
      f.opts!.onChange({ state: 'connecting', canUnmute: false, muted: true, retryAt: null, ...s });
      await tick();
    },
    make: (o: TileOptions): Tile => {
      f.opts = o;
      return f as unknown as Tile;
    },
  };
  return f;
}

beforeEach(() => {
  FakePeer.instances = [];
  FakePeer.stallGathering = false;
  FakePeer.failSetRemote = false;
  FakePeer.tracksOnAnswer = [];
  vi.stubGlobal('RTCPeerConnection', FakePeer);
  vi.stubGlobal('MediaStream', FakeStream);
  Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: true });
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null });
  request = vi.fn(async () => {});
  HTMLElement.prototype.requestFullscreen = request as unknown as HTMLElement['requestFullscreen'];
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('LiveTile fullscreen', () => {
  it('offers Full screen only once the tile is live', async () => {
    const tile = renderTile();
    expect(tile.dataset.state).toBe('connecting');
    expect(screen.queryByRole('button', { name: 'Full screen' })).toBeNull();
    await goLive(tile);
    expect(screen.getByRole('button', { name: 'Full screen' })).toBeTruthy();
  });

  it('makes the whole tile fullscreen', async () => {
    const tile = renderTile();
    await goLive(tile);
    await fireEvent.click(screen.getByRole('button', { name: 'Full screen' }));
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.contexts[0]).toBe(tile);
  });

  it('labels the button Exit full screen while fullscreen, and Full screen after Esc, with no aria-pressed', async () => {
    const tile = renderTile();
    await goLive(tile);
    setFullscreenElement(tile);
    await flush();
    const exit = screen.getByRole('button', { name: 'Exit full screen' });
    expect(exit.hasAttribute('aria-pressed')).toBe(false);
    setFullscreenElement(null);
    await flush();
    expect(screen.getByRole('button', { name: 'Full screen' }).hasAttribute('aria-pressed')).toBe(false);
  });

  it('toggles fullscreen on a double-click on the video', async () => {
    const tile = renderTile();
    await goLive(tile);
    await fireEvent.dblClick(tile.querySelector('video')!);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.contexts[0]).toBe(tile);
  });

  it('hides the button when the browser cannot go fullscreen', async () => {
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: false });
    const tile = renderTile();
    await goLive(tile);
    expect(screen.queryByRole('button', { name: 'Full screen' })).toBeNull();
    await fireEvent.dblClick(tile.querySelector('video')!);
    expect(request).not.toHaveBeenCalled();
  });

  it('does not reopen the live session when going fullscreen', async () => {
    const tile = renderTile();
    await goLive(tile);
    const peers = FakePeer.instances.length;
    expect(peers).toBe(1);
    await fireEvent.click(screen.getByRole('button', { name: 'Full screen' }));
    setFullscreenElement(tile);
    await flush();
    setFullscreenElement(null);
    await flush();
    expect(FakePeer.instances.length).toBe(peers);
    expect(FakePeer.instances[0]!.closed).toBe(false);
  });
});

describe('LiveTile states', () => {
  it('shows the Live badge only when live', async () => {
    const tile = renderTile();
    expect(within(tile).queryByText('Live')).toBeNull();
    await goLive(tile);
    expect(within(tile).getByText('Live')).toBeTruthy();
  });

  it('as-of clock uses the display zone and ticks each second only while live', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
    try {
      const f = fakeTile();
      render(LiveTile, { cameraId: 'front', name: 'Front', client: new FakeClient(), zone: 'Asia/Tokyo', makeTile: f.make });
      await f.emit({ state: 'reconnecting', retryAt: null });
      expect(screen.queryByText(/as of/i)).toBeNull();
      await f.emit({ state: 'live' });
      expect(screen.getByText('as of 21:00:00')).toBeTruthy();
      await vi.advanceTimersByTimeAsync(2000);
      expect(screen.getByText('as of 21:00:02')).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('reconnecting shows Try now and calls tryNow', async () => {
    const f = fakeTile();
    render(LiveTile, { cameraId: 'front', name: 'Front', client: new FakeClient(), zone: ZONE, makeTile: f.make });
    await f.emit({ state: 'reconnecting', retryAt: Date.now() + 5000 });
    await fireEvent.click(screen.getByRole('button', { name: 'Try now' }));
    expect(f.tryNow).toHaveBeenCalledTimes(1);
  });

  it('limit says so and offers Try now', async () => {
    const f = fakeTile();
    render(LiveTile, { cameraId: 'front', name: 'Front', client: new FakeClient(), zone: ZONE, makeTile: f.make });
    await f.emit({ state: 'limit', retryAt: Date.now() + 5000 });
    expect(screen.getByRole('status')).toHaveTextContent('Too many people are watching. zview tries again');
    expect(screen.getByRole('button', { name: 'Try now' })).toBeTruthy();
  });

  it('locked shows an Unlock link to #/key', async () => {
    const f = fakeTile();
    render(LiveTile, { cameraId: 'front', name: 'Front', client: new FakeClient(), zone: ZONE, makeTile: f.make });
    await f.emit({ state: 'locked' });
    expect(screen.getByRole('status')).toHaveTextContent('Key locked.');
    expect(screen.getByRole('link', { name: 'Unlock' }).getAttribute('href')).toBe('#/key');
  });

  it('offline state says the camera reconnects by itself', async () => {
    const f = fakeTile();
    render(LiveTile, { cameraId: 'front', name: 'Front', client: new FakeClient(), zone: ZONE, makeTile: f.make });
    await f.emit({ state: 'offline' });
    expect(screen.getByRole('status')).toHaveTextContent('Camera offline. zview reconnects when it is back.');
  });

  it('offline prop calls setOffline', async () => {
    const f = fakeTile();
    const { rerender } = render(LiveTile, { cameraId: 'front', name: 'Front', client: new FakeClient(), zone: ZONE, offline: true, makeTile: f.make });
    await tick();
    expect(f.setOffline).toHaveBeenLastCalledWith(true);
    await rerender({ offline: false });
    expect(f.setOffline).toHaveBeenLastCalledWith(false);
  });

  it('the status element text has no digits while counting down', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
    try {
      const f = fakeTile();
      render(LiveTile, { cameraId: 'front', name: 'Front', client: new FakeClient(), zone: ZONE, makeTile: f.make });
      await f.emit({ state: 'reconnecting', retryAt: Date.now() + 5000 });
      const status = screen.getByRole('status');
      expect(status.textContent).not.toMatch(/\d/);
      expect(status.parentElement).toHaveTextContent('in 5 s');
      await vi.advanceTimersByTimeAsync(2000);
      expect(status.parentElement).toHaveTextContent('in 3 s');
      expect(status.textContent).not.toMatch(/\d/);
    } finally {
      vi.useRealTimers();
    }
  });

  it('drops the countdown when the retry time has passed or is unknown', async () => {
    const f = fakeTile();
    render(LiveTile, { cameraId: 'front', name: 'Front', client: new FakeClient(), zone: ZONE, makeTile: f.make });
    await f.emit({ state: 'reconnecting', retryAt: Date.now() - 500 });
    expect(screen.getByRole('status').parentElement).toHaveTextContent("Can't reach the camera. Trying again…");
    expect(screen.getByRole('status').parentElement).not.toHaveTextContent(/\d/);
    await f.emit({ state: 'reconnecting', retryAt: null });
    expect(screen.getByRole('status').parentElement).not.toHaveTextContent(/\d/);
  });

  it('turning sound on in one tile turns it off in the other', async () => {
    render(LiveTile, { cameraId: 'front', name: 'Front', client: new FakeClient(), zone: ZONE });
    render(LiveTile, { cameraId: 'yard', name: 'Yard', client: new FakeClient(), zone: ZONE });
    await flush();
    expect(FakePeer.instances).toHaveLength(2);
    FakePeer.instances.forEach((p) => p.addRemoteTrack('audio'));
    await tick();
    const [a, b] = screen.getAllByTestId('live-tile').map((t) => t.querySelector('video')!);
    await fireEvent.click(screen.getAllByRole('button', { name: 'Turn sound on' })[0]!);
    expect(a!.muted).toBe(false);
    await fireEvent.click(screen.getByRole('button', { name: 'Turn sound on' }));
    expect(b!.muted).toBe(false);
    expect(a!.muted).toBe(true);
    expect(screen.getByRole('button', { name: 'Turn sound off' })).toBeTruthy();
  });

  it('a tile that went offline while unmuted is muted when another tile takes the sound', async () => {
    const a = render(LiveTile, { cameraId: 'front', name: 'Front', client: new FakeClient(), zone: ZONE });
    render(LiveTile, { cameraId: 'yard', name: 'Yard', client: new FakeClient(), zone: ZONE });
    await flush();
    FakePeer.instances.forEach((p) => p.addRemoteTrack('audio'));
    await tick();
    const [va, vb] = screen.getAllByTestId('live-tile').map((t) => t.querySelector('video')!);
    await fireEvent.click(screen.getAllByRole('button', { name: 'Turn sound on' })[0]!);
    expect(va!.muted).toBe(false);
    await a.rerender({ offline: true });
    await flush();
    await tick();
    await fireEvent.click(screen.getByRole('button', { name: 'Turn sound on' }));
    expect(vb!.muted).toBe(false);
    expect(va!.muted).toBe(true);
  });

  it('keeps one status element across connecting, reconnecting and live, with stable text', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
    try {
      const f = fakeTile();
      render(LiveTile, { cameraId: 'front', name: 'Front', client: new FakeClient(), zone: ZONE, makeTile: f.make });
      await f.emit({ state: 'connecting' });
      const status = screen.getByRole('status');
      await f.emit({ state: 'reconnecting', retryAt: Date.now() + 2000 });
      expect(screen.getByRole('status')).toBe(status);
      const text = status.textContent;
      await vi.advanceTimersByTimeAsync(1000);
      expect(status.textContent).toBe(text);
      await vi.advanceTimersByTimeAsync(3000);
      expect(status.textContent).toBe(text);
      await f.emit({ state: 'live' });
      expect(screen.getByRole('status')).toBe(status);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps Exit full screen and double-click exit when a fullscreen tile leaves live', async () => {
    const f = fakeTile();
    render(LiveTile, { cameraId: 'front', name: 'Front', client: new FakeClient(), zone: ZONE, makeTile: f.make });
    const tile = screen.getByTestId('live-tile');
    const exit = vi.fn(async () => {});
    document.exitFullscreen = exit as unknown as Document['exitFullscreen'];
    await f.emit({ state: 'live' });
    setFullscreenElement(tile);
    await flush();
    await f.emit({ state: 'reconnecting', retryAt: null });
    expect(screen.getByRole('button', { name: 'Exit full screen' })).toBeTruthy();
    await fireEvent.dblClick(tile.querySelector('video')!);
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it('defines dark over-video colours on the tile root', () => {
    const tile = renderTile();
    expect(tile.getAttribute('style') ?? '').toMatch(/--z-ov-ground/);
  });
});

describe('LiveTile focus and single mode', () => {
  it('single: shows the bar with Live now, sound and Full screen, and no overlay scrim', async () => {
    const f = fakeTile();
    render(LiveTile, { cameraId: 'front', name: 'Front', client: new FakeClient(), zone: ZONE, makeTile: f.make, single: true });
    await f.emit({ state: 'live', canUnmute: true });
    const tile = screen.getByTestId('live-tile');
    expect(within(tile).getByText('Live now')).toBeTruthy();
    expect(within(tile).getByRole('button', { name: 'Turn sound on' })).toBeTruthy();
    expect(within(tile).getByRole('button', { name: 'Full screen' })).toBeTruthy();
    expect(tile.querySelector('.scrim')).toBeNull();
    expect(within(tile).getByText(/as of /)).toBeTruthy();
  });

  it('single: no sound button without canUnmute', async () => {
    const f = fakeTile();
    render(LiveTile, { cameraId: 'front', client: new FakeClient(), zone: ZONE, makeTile: f.make, single: true });
    await f.emit({ state: 'live' });
    expect(screen.queryByRole('button', { name: /Turn sound/ })).toBeNull();
  });

  it('grid: clicking the video calls onFocus, clicking Try now does not', async () => {
    const f = fakeTile();
    const onFocus = vi.fn();
    render(LiveTile, { cameraId: 'cam1', client: new FakeClient(), zone: ZONE, makeTile: f.make, onFocus });
    await f.emit({ state: 'reconnecting', retryAt: Date.now() + 5000 });
    await fireEvent.click(screen.getByRole('button', { name: 'Try now' }));
    expect(onFocus).not.toHaveBeenCalled();
    await fireEvent.click(screen.getByTestId('live-tile').querySelector('video')!);
    await waitFor(() => expect(onFocus).toHaveBeenCalledTimes(1));
  });

  it('grid: onFocus fires after a delay following a single click', async () => {
    vi.useFakeTimers();
    try {
      const f = fakeTile();
      const onFocus = vi.fn();
      render(LiveTile, { cameraId: 'cam1', client: new FakeClient(), zone: ZONE, makeTile: f.make, onFocus });
      await fireEvent.click(screen.getByTestId('live-tile').querySelector('video')!);
      expect(onFocus).not.toHaveBeenCalled();
      vi.advanceTimersByTime(300);
      expect(onFocus).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('grid: a double-click cancels focus and toggles fullscreen', async () => {
    vi.useFakeTimers();
    try {
      const f = fakeTile();
      const onFocus = vi.fn();
      render(LiveTile, { cameraId: 'cam1', client: new FakeClient(), zone: ZONE, makeTile: f.make, onFocus });
      await f.emit({ state: 'live' });
      const v = screen.getByTestId('live-tile').querySelector('video')!;
      await fireEvent.click(v);
      await fireEvent.click(v);
      await fireEvent.dblClick(v);
      vi.advanceTimersByTime(500);
      expect(onFocus).not.toHaveBeenCalled();
      expect(request).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('grid: unmounting clears a pending focus', async () => {
    vi.useFakeTimers();
    try {
      const f = fakeTile();
      const onFocus = vi.fn();
      render(LiveTile, { cameraId: 'cam1', client: new FakeClient(), zone: ZONE, makeTile: f.make, onFocus });
      await fireEvent.click(screen.getByTestId('live-tile').querySelector('video')!);
      cleanup();
      vi.advanceTimersByTime(500);
      expect(onFocus).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('the video wrapper fills the tile in fullscreen so the picture does too', () => {
    renderTile();
    const wrap = screen.getByTestId('live-tile').querySelector('video')!.parentElement!;
    expect(screen.getByTestId('live-tile').className).toContain('[&:fullscreen>div:not([role])]:h-full');
    expect(wrap.hasAttribute('role')).toBe(false);
  });

  it('single: clicking the video does not call onFocus', async () => {
    const f = fakeTile();
    const onFocus = vi.fn();
    render(LiveTile, { cameraId: 'cam1', client: new FakeClient(), zone: ZONE, makeTile: f.make, onFocus, single: true });
    await fireEvent.click(screen.getByTestId('live-tile').querySelector('video')!);
    expect(onFocus).not.toHaveBeenCalled();
  });
});
