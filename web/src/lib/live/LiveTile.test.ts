// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeClient, FakePeer, FakeStream } from '../../../test-support/live-fakes';
import LiveTile from './LiveTile.svelte';

let request: ReturnType<typeof vi.fn>;

const flush = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};

function setFullscreenElement(el: Element | null) {
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: el });
  document.dispatchEvent(new Event('fullscreenchange'));
}

function renderTile() {
  render(LiveTile, { cameraId: 'front', name: 'Front', client: new FakeClient() });
  return screen.getByTestId('live-tile');
}

beforeEach(() => {
  FakePeer.instances = [];
  FakePeer.stallGathering = false;
  FakePeer.failSetRemote = false;
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
  it('shows a Fullscreen button while the tile is still connecting', () => {
    const tile = renderTile();
    expect(tile.dataset.state).toBe('connecting');
    expect(screen.getByRole('button', { name: 'Fullscreen' })).toBeTruthy();
  });

  it('makes the whole tile fullscreen', async () => {
    const tile = renderTile();
    await fireEvent.click(screen.getByRole('button', { name: 'Fullscreen' }));
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.contexts[0]).toBe(tile);
  });

  it('labels the button Exit fullscreen while fullscreen, and Fullscreen after Esc', async () => {
    const tile = renderTile();
    setFullscreenElement(tile);
    await flush();
    const exit = screen.getByRole('button', { name: 'Exit fullscreen' });
    expect(exit.getAttribute('aria-pressed')).toBe('true');
    setFullscreenElement(null);
    await flush();
    expect(screen.getByRole('button', { name: 'Fullscreen' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('toggles fullscreen on a double-click on the video', async () => {
    const tile = renderTile();
    await fireEvent.dblClick(tile.querySelector('video')!);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.contexts[0]).toBe(tile);
  });

  it('hides the button when the browser cannot go fullscreen', async () => {
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: false });
    const tile = renderTile();
    expect(screen.queryByRole('button', { name: 'Fullscreen' })).toBeNull();
    await fireEvent.dblClick(tile.querySelector('video')!);
    expect(request).not.toHaveBeenCalled();
  });

  it('does not reopen the live session when going fullscreen', async () => {
    const tile = renderTile();
    await flush();
    const peers = FakePeer.instances.length;
    expect(peers).toBe(1);
    await fireEvent.click(screen.getByRole('button', { name: 'Fullscreen' }));
    setFullscreenElement(tile);
    await flush();
    setFullscreenElement(null);
    await flush();
    expect(FakePeer.instances.length).toBe(peers);
    expect(FakePeer.instances[0]!.closed).toBe(false);
  });
});
