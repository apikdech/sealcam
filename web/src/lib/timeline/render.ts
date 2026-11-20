// Canvas 2D drawing for the timeline. Nothing here owns state: Timeline.svelte
// owns the view and calls drawTimeline from a dirty-flag rAF scheduler.
import type { IntegrityState } from '../player/engine';
import { glyphFits, RULER_HEIGHT, rulerTicks, timeToX, triggerStyle, type GapRect, type Layout } from './model';

export interface Scheduler {
  /** Marks the canvas dirty; draws once on the next animation frame. */
  invalidate(): void;
  dispose(): void;
}

/**
 * Redraw on requestAnimationFrame only when state changed: any number of
 * invalidations before the next frame cost one draw, and an idle timeline
 * costs no frames at all.
 */
export function createScheduler(
  draw: () => void,
  raf: (cb: () => void) => number = (cb) => requestAnimationFrame(cb),
  cancel: (id: number) => void = (id) => cancelAnimationFrame(id),
): Scheduler {
  let pending: number | null = null;
  let disposed = false;
  return {
    invalidate() {
      if (disposed || pending !== null) return;
      pending = raf(() => {
        pending = null;
        draw();
      });
    },
    dispose() {
      disposed = true;
      if (pending !== null) cancel(pending);
      pending = null;
    },
  };
}

/** Backing-store size for a CSS size at `dpr` (DPR scaling keeps lines crisp). */
export function backingSize(cssW: number, cssH: number, dpr: number): { width: number; height: number } {
  const k = dpr >= 1 ? dpr : 1;
  return { width: Math.max(1, Math.round(cssW * k)), height: Math.max(1, Math.round(cssH * k)) };
}

export interface Palette {
  bg: string;
  lane: string;
  grid: string;
  text: string;
  textDim: string;
  bar: string;
  barEdge: string;
  hatch: string;
  foil: string;
  /** Integrity mismatch (amber). */
  mismatch: string;
  /** Integrity tampered (void). */
  tampered: string;
  /** Text on a trigger colour. */
  onTrigger: string;
}

export const DARK: Palette = {
  bg: '#0E1A1F',
  lane: '#132429',
  grid: '#22393F',
  text: '#E6E2D6',
  textDim: '#93A6A4',
  bar: '#5FA8A0',
  barEdge: '#5FA8A0',
  hatch: '#93A6A4',
  foil: '#C9A44C',
  mismatch: '#D9A441',
  tampered: '#D2554A',
  onTrigger: '#071014',
};

export const LIGHT: Palette = {
  bg: '#EDE9DF',
  lane: '#E3DED1',
  grid: '#C9C2B1',
  text: '#1B2A2E',
  textDim: '#56656A',
  bar: '#2F6F73',
  barEdge: '#2F6F73',
  hatch: '#56656A',
  foil: '#8A6A1F',
  mismatch: '#9A6A12',
  tampered: '#A8322A',
  onTrigger: '#071014',
};

const TOKENS: Record<keyof Palette, string> = {
  bg: '--z-ground',
  lane: '--z-plate',
  grid: '--z-rule',
  text: '--z-ink',
  textDim: '--z-muted',
  bar: '--z-line',
  barEdge: '--z-line',
  hatch: '--z-muted',
  foil: '--z-foil',
  mismatch: '--z-amber',
  tampered: '--z-void',
  onTrigger: '--z-on-trigger',
};

/** The palette from the `--z-*` custom properties in force on `el`; DARK fills any gap. */
export function readPalette(el: Element): Palette {
  const cs = getComputedStyle(el);
  const p = { ...DARK };
  for (const key of Object.keys(TOKENS) as (keyof Palette)[]) {
    const v = cs.getPropertyValue(TOKENS[key]).trim();
    if (v) p[key] = v;
  }
  return p;
}

export interface DrawOptions {
  zone: string;
  palette?: Palette;
  /** Per clip id; tampered and mismatch clips are marked on the bar (ui-spec §4.4). */
  integrity: Readonly<Record<string, IntegrityState | undefined>>;
  /** Draws the now line when it falls inside the view. */
  nowMs?: number;
  selectedClipId?: string | null;
  /** The not-monitored region under the pointer; gets a label. */
  hoverGap?: GapRect | null;
  hoverX?: number;
  hoverY?: number;
}

const FONT = '11px system-ui, sans-serif';

let hatchCache: { color: string; pattern: CanvasPattern } | null = null;

function hatchPattern(ctx: CanvasRenderingContext2D, color: string): CanvasPattern | string {
  if (hatchCache?.color === color) return hatchCache.pattern;
  const tile = document.createElement('canvas');
  tile.width = tile.height = 8;
  const t = tile.getContext('2d');
  const pattern = t ? ((): CanvasPattern | null => {
    t.strokeStyle = color;
    t.lineWidth = 1.5;
    t.beginPath();
    t.moveTo(0, 8);
    t.lineTo(8, 0);
    t.moveTo(-2, 2);
    t.lineTo(2, -2);
    t.moveTo(6, 10);
    t.lineTo(10, 6);
    t.stroke();
    return ctx.createPattern(tile, 'repeat');
  })() : null;
  if (!pattern) return color;
  hatchCache = { color, pattern };
  return pattern;
}

/** Draws one frame. The caller has already applied the DPR transform to `ctx`. */
export function drawTimeline(ctx: CanvasRenderingContext2D, layout: Layout, o: DrawOptions): void {
  const p = o.palette ?? DARK;
  const { width, height, view } = layout;

  ctx.fillStyle = p.bg;
  ctx.fillRect(0, 0, width, height);

  // Lane backgrounds, then the hatched not-monitored regions on top.
  ctx.fillStyle = p.lane;
  for (const lane of layout.lanes) ctx.fillRect(0, lane.y, width, lane.height);

  ctx.fillStyle = hatchPattern(ctx, p.hatch);
  ctx.globalAlpha = 0.45;
  for (const lane of layout.lanes) {
    for (const g of lane.gaps) ctx.fillRect(g.x0, lane.y, g.x1 - g.x0, lane.height);
  }
  ctx.globalAlpha = 1;

  // Ruler and vertical grid in the display zone.
  ctx.font = FONT;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.strokeStyle = p.grid;
  ctx.fillStyle = p.textDim;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const t of rulerTicks(view, width, o.zone)) {
    const x = Math.round(timeToX(view, width, t.ms)) + 0.5;
    ctx.moveTo(x, RULER_HEIGHT - 6);
    ctx.lineTo(x, height);
    ctx.fillText(t.label, x + 3, RULER_HEIGHT / 2 - 2);
  }
  ctx.stroke();

  // Clip bars in one path.
  ctx.fillStyle = p.bar;
  ctx.strokeStyle = p.barEdge;
  ctx.beginPath();
  for (const lane of layout.lanes) for (const c of lane.clips) ctx.rect(c.x0, c.y, c.x1 - c.x0, c.h);
  ctx.fill();

  // Trigger spans in the lower half of the bar, batched per color.
  const byColor = new Map<string, { x0: number; x1: number; y: number; h: number }[]>();
  for (const lane of layout.lanes) {
    for (const c of lane.clips) {
      for (const t of c.triggers) {
        let list = byColor.get(t.color);
        if (!list) byColor.set(t.color, (list = []));
        list.push({ x0: t.x0, x1: t.x1, y: c.y + c.h * 0.35, h: c.h * 0.65 });
      }
    }
  }
  for (const [color, rects] of byColor) {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (const r of rects) ctx.rect(r.x0, r.y, r.x1 - r.x0, r.h);
    ctx.fill();
  }

  // Glyphs where they fit, so meaning never rests on color alone.
  ctx.fillStyle = p.onTrigger;
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  for (const lane of layout.lanes) {
    for (const c of lane.clips) {
      for (const t of c.triggers) {
        const w = t.x1 - t.x0;
        if (!glyphFits(w) || t.x1 < 0 || t.x0 > width) continue;
        ctx.fillText(t.glyph, t.x0 + w / 2, c.y + c.h * 0.68);
      }
    }
  }
  ctx.textAlign = 'left';

  // Integrity markers (ui-spec §4.4): colour plus shape, never colour alone.
  for (const lane of layout.lanes) {
    for (const c of lane.clips) {
      const state = o.integrity[c.clipId];
      if (state !== 'tampered' && state !== 'mismatch') continue;
      const w = c.x1 - c.x0;
      if (state === 'tampered') {
        ctx.save();
        ctx.beginPath();
        ctx.rect(c.x0, c.y, w, c.h);
        ctx.clip();
        ctx.fillStyle = hatchPattern(ctx, p.tampered);
        ctx.fillRect(c.x0, c.y, w, c.h);
        ctx.restore();
      }
      ctx.strokeStyle = state === 'tampered' ? p.tampered : p.mismatch;
      ctx.lineWidth = 2;
      ctx.strokeRect(c.x0, c.y, w, c.h);
      if (state === 'mismatch') {
        ctx.fillStyle = p.mismatch;
        ctx.beginPath();
        ctx.moveTo(c.x0, c.y);
        ctx.lineTo(c.x0 + 8, c.y);
        ctx.lineTo(c.x0, c.y + 8);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  // Camera names last, on a plate backing so they stay legible over the bars.
  ctx.font = FONT;
  for (const lane of layout.lanes) {
    const w = ctx.measureText(lane.name).width + 8;
    ctx.fillStyle = p.lane;
    ctx.fillRect(0, lane.y, w, 16);
    ctx.fillStyle = p.textDim;
    ctx.fillText(lane.name, 4, lane.y + 8);
  }

  if (o.selectedClipId) {
    ctx.strokeStyle = p.foil;
    ctx.lineWidth = 2;
    for (const lane of layout.lanes) {
      for (const c of lane.clips) {
        if (c.clipId === o.selectedClipId) ctx.strokeRect(c.x0 - 1, c.y - 1, c.x1 - c.x0 + 2, c.h + 2);
      }
    }
  }

  if (o.nowMs !== undefined) {
    const x = timeToX(view, width, o.nowMs);
    if (x >= 0 && x <= width) {
      ctx.strokeStyle = p.foil;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, RULER_HEIGHT - 8);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
  }

  if (o.hoverGap && o.hoverX !== undefined && o.hoverY !== undefined) {
    const label = 'not monitored';
    ctx.font = FONT;
    const w = ctx.measureText(label).width + 12;
    const x = Math.min(Math.max(0, o.hoverX + 10), Math.max(0, width - w));
    const y = Math.max(0, o.hoverY - 24);
    ctx.fillStyle = p.bg;
    ctx.globalAlpha = 0.9;
    ctx.fillRect(x, y, w, 20);
    ctx.globalAlpha = 1;
    ctx.fillStyle = p.text;
    ctx.fillText(label, x + 6, y + 10);
  }
}

export { triggerStyle };
