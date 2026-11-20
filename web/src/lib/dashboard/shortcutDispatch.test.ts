// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleKeydown, runCommand, type DispatchContext } from './shortcutDispatch';

const clips = [
  { id: 'a', startMs: 1 },
  { id: 'b', startMs: 2 },
  { id: 'c', startMs: 3 },
];

function ctx(over: Partial<DispatchContext> = {}): DispatchContext {
  return {
    playerView: { togglePlay: vi.fn(), skip: vi.fn() },
    timeline: { stepZoom: vi.fn(), jumpToNow: vi.fn() },
    timelineClips: clips,
    selectedId: null,
    select: vi.fn(),
    goToday: vi.fn(() => false),
    ...over,
  };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('runCommand', () => {
  it('drives the player', () => {
    const c = ctx();
    expect(runCommand('toggle', c)).toBe(true);
    expect(runCommand('back10', c)).toBe(true);
    expect(runCommand('fwd10', c)).toBe(true);
    expect(c.playerView!.togglePlay).toHaveBeenCalledOnce();
    expect(vi.mocked(c.playerView!.skip).mock.calls).toEqual([[-10_000], [10_000]]);
  });

  it('did not act without a player or a timeline (false, so the key keeps its default)', () => {
    const c = ctx({ playerView: null, timeline: undefined });
    for (const cmd of ['toggle', 'back10', 'fwd10', 'zoomIn', 'zoomOut', 'now'] as const) expect(runCommand(cmd, c)).toBe(false);
  });

  it('selects the neighbouring clip, and acts only when there is one', () => {
    const c = ctx({ selectedId: 'b' });
    expect(runCommand('prev', c)).toBe(true);
    expect(runCommand('next', c)).toBe(true);
    expect(vi.mocked(c.select).mock.calls).toEqual([['a'], ['c']]);
    const empty = ctx({ timelineClips: [] });
    expect(runCommand('next', empty)).toBe(false);
    expect(empty.select).not.toHaveBeenCalled();
  });

  it('steps the zoom', () => {
    const c = ctx();
    runCommand('zoomIn', c);
    runCommand('zoomOut', c);
    expect(vi.mocked(c.timeline!.stepZoom).mock.calls).toEqual([['in'], ['out']]);
  });

  it('now goes to today when elsewhere, otherwise centres the timeline', () => {
    const away = ctx({ goToday: vi.fn(() => true) });
    expect(runCommand('now', away)).toBe(true);
    expect(away.timeline!.jumpToNow).not.toHaveBeenCalled();
    const here = ctx();
    expect(runCommand('now', here)).toBe(true);
    expect(here.timeline!.jumpToNow).toHaveBeenCalledOnce();
  });
});

describe('handleKeydown', () => {
  const key = (k: string) => new KeyboardEvent('keydown', { key: k, cancelable: true });

  it('prevents the default only when it acted', () => {
    const e = key(' ');
    handleKeydown(e, ctx());
    expect(e.defaultPrevented).toBe(true);
    const idle = key(' ');
    handleKeydown(idle, ctx({ playerView: undefined }));
    expect(idle.defaultPrevented).toBe(false);
  });

  it('ignores keys that are not shortcuts', () => {
    const c = ctx();
    const e = key('x');
    handleKeydown(e, c);
    expect(e.defaultPrevented).toBe(false);
  });

  it('leaves everything alone while a modal dialog is open', () => {
    const dialog = document.createElement('div');
    dialog.setAttribute('aria-modal', 'true');
    document.body.append(dialog);
    const c = ctx();
    const e = key(' ');
    handleKeydown(e, c);
    expect(c.playerView!.togglePlay).not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(false);
  });
});
