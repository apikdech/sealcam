// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeClient, FakePeer, FakeStream } from '../../../test-support/live-fakes';
import type { Camera, Status } from '../../worker/schemas';
import LiveGrid from './LiveGrid.svelte';

const cam = (id: string): Camera => ({ id, name: id.toUpperCase(), brand: '', tags: [], last_clip_at: null, online: true });
const cams = (...ids: string[]) => ids.map(cam);

function statusWith(down: string[], all: string[]): Status {
  return {
    schema: 'zrec.status/1',
    relay_id: 'r',
    version: '1',
    updated_at: '2026-01-01T00:00:00Z',
    key_id: '0123456789abcdef',
    cameras: all.map((id) => ({
      id,
      name: id,
      rtsp: down.includes(id) ? 'down' : 'up',
      events: 'up',
      since: '2026-01-01T00:00:00Z',
      last_clip_at: null,
    })),
  } as unknown as Status;
}

beforeEach(() => {
  FakePeer.instances = [];
  vi.stubGlobal('RTCPeerConnection', FakePeer);
  vi.stubGlobal('MediaStream', FakeStream);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const grid = () => screen.getByTestId('live-grid');
const cols = () => screen.getAllByTestId('live-tile')[0]!.parentElement!;
const props = (cameras: Camera[], status: Status | null = null) => ({ cameras, client: new FakeClient(), zone: 'UTC', status });

describe('LiveGrid', () => {
  it('one camera renders a single stage tile with no hint line', () => {
    render(LiveGrid, props(cams('a')));
    expect(screen.getByTestId('live-tile').className).toContain('h-full');
    expect(screen.getByTestId('live-tile').className).toContain('flex-col');
    expect(screen.queryByText(/tap a camera/)).toBeNull();
    expect(grid().className).toContain('h-full');
  });

  it('two cameras go side by side from md, with the hint line', () => {
    render(LiveGrid, props(cams('a', 'b')));
    expect(cols().className).toContain('md:grid-cols-2');
    expect(screen.getByText('Live now · tap a camera to see it alone')).toBeTruthy();
  });

  it('a tile click reports the camera id', async () => {
    const onFocus = vi.fn();
    render(LiveGrid, { ...props(cams('a', 'b')), onFocus });
    await fireEvent.click(screen.getAllByTestId('live-tile')[1]!.querySelector('video')!);
    await waitFor(() => expect(onFocus).toHaveBeenCalledWith('b'));
  });

  it('four cameras get two columns from sm', () => {
    render(LiveGrid, props(cams('a', 'b', 'c', 'd')));
    expect(cols().className).toContain('sm:grid-cols-2');
    expect(screen.getAllByTestId('live-tile')).toHaveLength(4);
  });

  it("a down camera's tile gets offline", async () => {
    render(LiveGrid, props(cams('a', 'b'), statusWith(['b'], ['a', 'b'])));
    const tiles = screen.getAllByTestId('live-tile');
    await waitFor(() => expect(tiles[1]!.dataset.state).toBe('offline'));
    expect(tiles[0]!.dataset.state).not.toBe('offline');
  });
});
