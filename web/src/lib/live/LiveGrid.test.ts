// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
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
const props = (cameras: Camera[], status: Status | null = null) => ({ cameras, client: new FakeClient(), zone: 'UTC', status });

describe('LiveGrid', () => {
  it('one camera gets a single column class', () => {
    render(LiveGrid, props(cams('a')));
    expect(grid().className).toContain('grid-cols-1');
    expect(grid().className).not.toContain('md:grid-cols-2');
  });

  it('two cameras go side by side from md', () => {
    render(LiveGrid, props(cams('a', 'b')));
    expect(grid().className).toContain('md:grid-cols-2');
  });

  it('a single camera is capped in height on desktop, keeping 16:9 by width', () => {
    render(LiveGrid, props(cams('a')));
    expect(grid().className).toContain('md:w-[min(100%,calc(56vh*16/9))]');
    cleanup();
    render(LiveGrid, props(cams('a', 'b')));
    expect(grid().className).not.toContain('56vh');
  });

  it('four cameras get two columns from sm', () => {
    render(LiveGrid, props(cams('a', 'b', 'c', 'd')));
    expect(grid().className).toContain('sm:grid-cols-2');
    expect(screen.getAllByTestId('live-tile')).toHaveLength(4);
  });

  it("a down camera's tile gets offline", async () => {
    render(LiveGrid, props(cams('a', 'b'), statusWith(['b'], ['a', 'b'])));
    const tiles = screen.getAllByTestId('live-tile');
    await waitFor(() => expect(tiles[1]!.dataset.state).toBe('offline'));
    expect(tiles[0]!.dataset.state).not.toBe('offline');
  });
});
