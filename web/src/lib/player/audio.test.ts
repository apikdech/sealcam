import { describe, expect, it } from 'vitest';
import { ClipAudio, type VideoClock } from './audio';
import type { AudioTrackInfo } from './fmp4filter';

const TRACK: AudioTrackInfo = { codec: 'PCMA', trackId: 2, timescale: 8000 };

class FakeVideo implements VideoClock {
  currentTime = 0;
  paused = true;
  playbackRate = 1;
  private l = new Map<string, Set<() => void>>();
  addEventListener(t: string, f: () => void) {
    if (!this.l.has(t)) this.l.set(t, new Set());
    this.l.get(t)!.add(f);
  }
  removeEventListener(t: string, f: () => void) {
    this.l.get(t)?.delete(f);
  }
  emit(t: string) {
    for (const f of [...(this.l.get(t) ?? [])]) f();
  }
}

interface Start { when: number; offset: number; stopped: boolean; src: FakeSource }
class FakeSource {
  buffer: unknown = null;
  onended: (() => void) | null = null;
  constructor(private log: Start[]) {}
  connect(_: unknown) { return _; }
  start(when: number, offset: number) {
    this.log.push({ when, offset, stopped: false, src: this });
  }
  stop() {
    for (const s of this.log) if (s.src === this) s.stopped = true;
  }
}
class FakeCtx {
  currentTime = 10;
  state = 'running';
  destination = {};
  starts: Start[] = [];
  buffers: Array<{ ch: number; len: number; rate: number }> = [];
  resumed = 0;
  createBuffer(ch: number, len: number, rate: number) {
    this.buffers.push({ ch, len, rate });
    return { copyToChannel() {}, getChannelData: () => new Float32Array(len), duration: len / rate };
  }
  createBufferSource() { return new FakeSource(this.starts); }
  resume() { this.resumed++; this.state = 'running'; return Promise.resolve(); }
  closed = 0;
  close() { this.closed++; return Promise.resolve(); }
}

function setup() {
  const v = new FakeVideo();
  const ctx = new FakeCtx();
  let made = 0;
  const a = new ClipAudio(v, () => { made++; return ctx as unknown as AudioContext; });
  a.setTrack(TRACK);
  return { v, ctx, a, made: () => made };
}
const run = (sec: number, len = 8000) => ({ tfdt: sec * 8000, bytes: new Uint8Array(len) });
const live = (c: FakeCtx) => c.starts.filter((s) => !s.stopped);

describe('ClipAudio', () => {
  it('schedules runs from the video position', () => {
    const { v, ctx, a } = setup();
    v.currentTime = 3.0;
    v.paused = false;
    a.add(run(2, 16000)); // 2s..4s
    a.setEnabled(true);
    expect(ctx.buffers[0]).toEqual({ ch: 1, len: 16000, rate: 8000 });
    expect(live(ctx)).toHaveLength(1);
    expect(live(ctx)[0]!.when).toBeCloseTo(ctx.currentTime + 0, 9);
    expect(live(ctx)[0]!.offset).toBeCloseTo(1.0, 9);
  });

  it('schedules a future run at its video-relative time', () => {
    const { v, ctx, a } = setup();
    v.currentTime = 3.0;
    v.paused = false;
    a.add(run(5));
    a.setEnabled(true);
    expect(live(ctx)[0]!.when).toBeCloseTo(ctx.currentTime + 2, 9);
    expect(live(ctx)[0]!.offset).toBe(0);
  });

  it('does nothing while disabled', () => {
    const { v, ctx, a, made } = setup();
    v.paused = false;
    a.add(run(0));
    v.emit('play');
    expect(ctx.starts).toHaveLength(0);
    expect(made()).toBe(0);
  });

  it('creates the AudioContext lazily on first enable', () => {
    const { ctx, a, made } = setup();
    expect(made()).toBe(0);
    ctx.state = 'suspended';
    a.setEnabled(true);
    expect(made()).toBe(1);
    expect(ctx.resumed).toBe(1);
    a.setEnabled(false);
    a.setEnabled(true);
    expect(made()).toBe(1);
  });

  it('stops on pause and reschedules on play', () => {
    const { v, ctx, a } = setup();
    v.paused = false;
    a.add(run(0, 16000));
    a.setEnabled(true);
    expect(live(ctx)).toHaveLength(1);
    v.paused = true;
    v.emit('pause');
    expect(live(ctx)).toHaveLength(0);
    v.paused = false;
    v.emit('play');
    expect(live(ctx)).toHaveLength(1);
  });

  it('reschedules on seeked and stops on seeking', () => {
    const { v, ctx, a } = setup();
    v.paused = false;
    a.add(run(0, 8000 * 10));
    a.setEnabled(true);
    v.emit('seeking');
    expect(live(ctx)).toHaveLength(0);
    v.currentTime = 4;
    v.emit('seeked');
    expect(live(ctx)).toHaveLength(1);
    expect(live(ctx)[0]!.offset).toBeCloseTo(4, 9);
  });

  it('stops on waiting and resumes on playing', () => {
    const { v, ctx, a } = setup();
    v.paused = false;
    a.add(run(0, 16000));
    a.setEnabled(true);
    v.emit('waiting');
    expect(live(ctx)).toHaveLength(0);
    v.emit('playing');
    expect(live(ctx)).toHaveLength(1);
  });

  it('mutes at other rates and resumes at 1', () => {
    const { v, ctx, a } = setup();
    v.paused = false;
    a.add(run(0, 16000));
    a.setEnabled(true);
    v.playbackRate = 2;
    v.emit('ratechange');
    expect(live(ctx)).toHaveLength(0);
    v.emit('seeked');
    v.emit('play');
    expect(live(ctx)).toHaveLength(0);
    v.playbackRate = 1;
    v.emit('ratechange');
    expect(live(ctx)).toHaveLength(1);
  });

  it('corrects drift above 50 ms', () => {
    const { v, ctx, a } = setup();
    v.paused = false;
    a.add(run(0, 8000 * 10));
    a.setEnabled(true);
    ctx.currentTime += 1;
    v.currentTime = 1.03; // 30 ms off
    v.emit('timeupdate');
    expect(ctx.starts).toHaveLength(1);
    expect(live(ctx)).toHaveLength(1);
    v.currentTime = 1.06; // 60 ms off
    v.emit('timeupdate');
    expect(ctx.starts).toHaveLength(2);
    expect(live(ctx)).toHaveLength(1);
    expect(live(ctx)[0]!.offset).toBeCloseTo(1.06, 9);
  });

  it('schedules runs added while playing', () => {
    const { v, ctx, a } = setup();
    v.paused = false;
    a.setEnabled(true);
    v.currentTime = 1;
    v.emit('play');
    a.add(run(2));
    expect(live(ctx)).toHaveLength(1);
    expect(live(ctx)[0]!.when).toBeCloseTo(ctx.currentTime + 1, 9);
  });

  it('starts a late-added run at now with the elapsed offset', () => {
    const { v, ctx, a } = setup();
    v.paused = false;
    a.setEnabled(true);
    ctx.currentTime += 0.2;
    a.add(run(0));
    expect(live(ctx)).toHaveLength(1);
    expect(live(ctx)[0]!.when).toBeCloseTo(ctx.currentTime, 9);
    expect(live(ctx)[0]!.offset).toBeCloseTo(0.2, 9);
  });

  it('skips a run that already ended at the current position', () => {
    const { v, ctx, a } = setup();
    v.paused = false;
    v.currentTime = 0;
    a.setEnabled(true);
    ctx.currentTime += 1.5;
    a.add(run(0)); // 0..1, ends before vNow = 1.5
    expect(ctx.starts).toHaveLength(0);
  });

  it('evictBefore drops old runs', () => {
    const { v, ctx, a } = setup();
    a.add(run(0)); // 0..1
    a.add(run(1)); // 1..2
    a.add(run(2)); // 2..3
    a.evictBefore(1.5);
    a.setEnabled(true);
    v.paused = false;
    v.currentTime = 0;
    v.emit('play');
    expect(live(ctx)).toHaveLength(2);
  });

  it('clear stops everything', () => {
    const { v, ctx, a } = setup();
    v.paused = false;
    a.add(run(0));
    a.setEnabled(true);
    a.clear();
    expect(live(ctx)).toHaveLength(0);
    v.emit('play');
    expect(live(ctx)).toHaveLength(0);
  });

  it('setEnabled(false) and dispose stop sources; dispose detaches listeners', () => {
    const { v, ctx, a } = setup();
    v.paused = false;
    a.add(run(0));
    a.setEnabled(true);
    a.setEnabled(false);
    expect(live(ctx)).toHaveLength(0);
    a.setEnabled(true);
    expect(live(ctx)).toHaveLength(1);
    a.dispose();
    expect(live(ctx)).toHaveLength(0);
    const n = ctx.starts.length;
    v.emit('play');
    expect(ctx.starts).toHaveLength(n);
  });

  it('adding the same tfdt twice keeps one run', () => {
    const { v, ctx, a } = setup();
    v.paused = false;
    a.add(run(0));
    a.add(run(0));
    a.setEnabled(true);
    expect(live(ctx)).toHaveLength(1);
  });

  it('dispose does not close an injected context', () => {
    const { ctx, a } = setup();
    a.setEnabled(true);
    a.dispose();
    expect(ctx.closed).toBe(0);
  });
});
