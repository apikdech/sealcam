// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { layoutLanes } from './model';
import { backingSize, createScheduler, DARK, drawTimeline, LIGHT, readPalette } from './render';

function fakeRaf() {
  let next = 1;
  const pending = new Map<number, () => void>();
  return {
    raf: (cb: () => void) => {
      const id = next++;
      pending.set(id, cb);
      return id;
    },
    cancel: (id: number) => void pending.delete(id),
    flush() {
      const cbs = [...pending.values()];
      pending.clear();
      for (const cb of cbs) cb();
    },
    get pending() {
      return pending.size;
    },
  };
}

describe('createScheduler (redraw on rAF only when dirty)', () => {
  it('does nothing until invalidated', () => {
    const f = fakeRaf();
    let draws = 0;
    createScheduler(() => draws++, f.raf, f.cancel);
    f.flush();
    expect(draws).toBe(0);
    expect(f.pending).toBe(0);
  });

  it('coalesces many invalidations into one draw per frame', () => {
    const f = fakeRaf();
    let draws = 0;
    const s = createScheduler(() => draws++, f.raf, f.cancel);
    s.invalidate();
    s.invalidate();
    s.invalidate();
    expect(f.pending).toBe(1);
    f.flush();
    expect(draws).toBe(1);
    f.flush();
    expect(draws).toBe(1); // clean: no further frame
    expect(f.pending).toBe(0);
  });

  it('an invalidation during a draw schedules the next frame', () => {
    const f = fakeRaf();
    let draws = 0;
    const s = createScheduler(
      () => {
        draws++;
        if (draws === 1) s.invalidate();
      },
      f.raf,
      f.cancel,
    );
    s.invalidate();
    f.flush();
    expect(f.pending).toBe(1);
    f.flush();
    expect(draws).toBe(2);
  });

  it('dispose cancels a pending frame and ignores later invalidations', () => {
    const f = fakeRaf();
    let draws = 0;
    const s = createScheduler(() => draws++, f.raf, f.cancel);
    s.invalidate();
    s.dispose();
    s.invalidate();
    f.flush();
    expect(draws).toBe(0);
  });
});

describe('backingSize (DPR scaling)', () => {
  it('scales the backing store by devicePixelRatio', () => {
    expect(backingSize(300, 100, 2)).toEqual({ width: 600, height: 200 });
    expect(backingSize(333, 101, 1.5)).toEqual({ width: 500, height: 152 });
  });
  it('never goes below 1x or to zero', () => {
    expect(backingSize(300, 100, 0)).toEqual({ width: 300, height: 100 });
    expect(backingSize(0, 0, 2)).toEqual({ width: 1, height: 1 });
  });
});

interface Op {
  op: string;
  args: unknown[];
  fill: unknown;
  stroke: unknown;
}

/** A canvas context that records every call with the fill/stroke style in force. */
function spyCtx() {
  const ops: Op[] = [];
  const state: Record<string, unknown> = {};
  const ctx = new Proxy(state, {
    get(_t, key: string) {
      if (key === 'measureText') return () => ({ width: 50 });
      if (key === 'createPattern')
        return () => {
          ops.push({ op: 'createPattern', args: [], fill: null, stroke: null });
          return { pattern: true };
        };
      if (key in state) return state[key];
      return (...args: unknown[]) => {
        ops.push({ op: key, args, fill: state.fillStyle, stroke: state.strokeStyle });
      };
    },
    set(_t, key: string, v) {
      state[key] = v;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, ops };
}

const H = 3_600_000;
const T0 = 1_000_000_000_000;
const clip = (id: string) => ({ id, cameraId: 'cam', startMs: T0 + H, endMs: T0 + 2 * H, triggers: [] });
function frame(integrity: Record<string, 'tampered' | 'mismatch' | 'verified'>, over = {}) {
  const view = { startMs: T0, spanMs: 24 * H };
  const layout = layoutLanes({
    cameras: [{ id: 'cam', name: 'Front Door' }],
    clips: [clip('c1')],
    coverage: [],
    range: [T0, T0 + 24 * H],
    view,
    width: 1000,
    ...over,
  });
  const { ctx, ops } = spyCtx();
  drawTimeline(ctx, layout, { zone: 'UTC', integrity, selectedClipId: 'c1', nowMs: T0 + 5 * H });
  return { ops, layout };
}

describe('readPalette', () => {
  afterEach(() => document.documentElement.removeAttribute('style'));

  it('reads the --z-* custom properties', () => {
    const el = document.createElement('div');
    el.style.setProperty('--z-ground', '#112233');
    el.style.setProperty('--z-void', '#aa0000');
    document.body.append(el);
    const p = readPalette(el);
    expect(p.bg).toBe('#112233');
    expect(p.tampered).toBe('#aa0000');
    el.remove();
  });

  it('falls back to the dark palette for missing values', () => {
    const el = document.createElement('div');
    document.body.append(el);
    expect(readPalette(el)).toEqual(DARK);
    el.remove();
  });

  it('keeps the dark palette under the brightness ceiling', () => {
    for (const v of Object.values(DARK)) expect(v.toLowerCase()).not.toBe('#ffffff');
    expect(LIGHT.bg).toBe('#EDE9DF');
  });
});

describe('drawTimeline integrity markers', () => {
  it('tampered hatch pattern is built once, not on every frame', () => {
    const tile = spyCtx();
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = (() => tile.ctx) as never;
    const pal = { ...DARK, tampered: '#123456', hatch: '#654321' };
    const draw = () => {
      const { ctx, ops } = spyCtx();
      const layout = frame({}).layout;
      drawTimeline(ctx, layout, { zone: 'UTC', palette: pal, integrity: { c1: 'tampered' } });
      return ops.filter((o) => o.op === 'createPattern').length;
    };
    try {
      expect(draw()).toBe(2); // hatch + tampered, first draw only
      expect(draw()).toBe(0);
    } finally {
      HTMLCanvasElement.prototype.getContext = orig;
    }
  });

  it('integrity markers are drawn after the lane names', () => {
    const { ops } = frame({ c1: 'mismatch' });
    const name = ops.findIndex((o) => o.op === 'fillText' && o.args[0] === 'Front Door');
    const marker = ops.findIndex((o) => o.op === 'strokeRect' && o.stroke === DARK.mismatch);
    expect(marker).toBeGreaterThan(name);
  });

  it('canvas text uses the app face', () => {
    const { ctx } = spyCtx();
    const { layout } = frame({});
    drawTimeline(ctx, layout, { zone: 'UTC', integrity: {} });
    expect((ctx as unknown as { font: string }).font).toContain('Atkinson Hyperlegible Next');
  });

  it('tampered bar is stroked with the tampered colour', () => {
    const { ops } = frame({ c1: 'tampered' });
    expect(ops.some((o) => o.op === 'strokeRect' && o.stroke === DARK.tampered)).toBe(true);
  });

  it('mismatch draws an outline and a filled triangle marker at the bar start', () => {
    const { ops, layout } = frame({ c1: 'mismatch' });
    expect(ops.some((o) => o.op === 'strokeRect' && o.stroke === DARK.mismatch)).toBe(true);
    const x0 = layout.lanes[0]!.clips[0]!.x0;
    const i = ops.findIndex((o) => o.op === 'moveTo' && o.args[0] === x0 && o.fill === DARK.mismatch);
    expect(i).toBeGreaterThan(-1);
    expect(ops.slice(i).find((o) => o.op === 'fill')?.fill).toBe(DARK.mismatch);
  });

  it('a verified or unknown clip gets no integrity colour', () => {
    const { ops } = frame({ c1: 'verified' });
    expect(ops.some((o) => o.stroke === DARK.tampered || o.stroke === DARK.mismatch)).toBe(false);
  });

  it('selection outline and now line use foil', () => {
    const { ops } = frame({});
    expect(ops.some((o) => o.op === 'strokeRect' && o.stroke === DARK.foil)).toBe(true);
    expect(ops.some((o) => o.op === 'stroke' && o.stroke === DARK.foil)).toBe(true);
  });

  it('lane name is drawn after the bars, on a plate-coloured backing', () => {
    const { ops } = frame({});
    const name = ops.findIndex((o) => o.op === 'fillText' && o.args[0] === 'Front Door');
    const barFill = ops.map((o) => o.op === 'fill' && o.fill === DARK.bar).lastIndexOf(true);
    expect(name).toBeGreaterThan(barFill);
    const backing = ops.findIndex((o, i) => i > barFill && o.op === 'fillRect' && o.fill === DARK.lane);
    expect(backing).toBeGreaterThan(-1);
    expect(backing).toBeLessThan(name);
  });
});
