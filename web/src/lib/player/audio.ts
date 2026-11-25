import { decodeG711 } from './g711';
import type { AudioRun, AudioTrackInfo } from './fmp4filter';

export interface VideoClock {
  currentTime: number;
  paused: boolean;
  playbackRate: number;
  addEventListener(t: string, f: () => void): void;
  removeEventListener(t: string, f: () => void): void;
}

const DRIFT_SEC = 0.05;
const SAMPLE_RATE = 8000;

interface Run {
  start: number; // seconds on the video timeline
  end: number;
  samples: Float32Array;
  buffer?: AudioBuffer;
}

/** Plays decoded G.711 runs through Web Audio, kept in step with a video clock. */
export class ClipAudio {
  private ctx: AudioContext | null = null;
  private ownsCtx = false;
  private track: AudioTrackInfo | null = null;
  private runs: Run[] = [];
  private sources: AudioBufferSourceNode[] = [];
  private enabled = false;
  private active = false;
  private ctxTime0 = 0;
  private videoTime0 = 0;

  private readonly onStop = () => this.stopAll();
  private readonly onSchedule = () => this.schedule();
  private readonly onRate = () => (this.video.playbackRate === 1 ? this.schedule() : this.stopAll());
  private readonly onTime = () => {
    if (!this.active || !this.ctx) return;
    const expected = this.videoTime0 + (this.ctx.currentTime - this.ctxTime0);
    if (Math.abs(expected - this.video.currentTime) > DRIFT_SEC) this.schedule();
  };
  private readonly handlers: Array<[string, () => void]> = [
    ['pause', this.onStop],
    ['seeking', this.onStop],
    ['waiting', this.onStop],
    ['play', this.onSchedule],
    ['playing', this.onSchedule],
    ['seeked', this.onSchedule],
    ['ratechange', this.onRate],
    ['timeupdate', this.onTime],
  ];

  constructor(
    private readonly video: VideoClock,
    /** Supplies a context that the caller owns and closes. Without it, the context is created here and closed by dispose(). */
    private readonly makeContext?: () => AudioContext,
  ) {
    for (const [t, f] of this.handlers) video.addEventListener(t, f);
  }

  setTrack(info: AudioTrackInfo | null): void {
    this.track = info;
    this.clear();
  }

  add(run: AudioRun): void {
    if (!this.track) return;
    const start = run.tfdt / this.track.timescale;
    if (this.runs.some((r) => r.start === start)) return;
    const samples = decodeG711(run.bytes, this.track.codec);
    const r: Run = { start, end: start + samples.length / SAMPLE_RATE, samples };
    this.runs.push(r);
    if (this.active) this.scheduleRun(r);
  }

  evictBefore(tSec: number): void {
    this.runs = this.runs.filter((r) => r.end >= tSec);
  }

  clear(): void {
    this.stopAll();
    this.runs = [];
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) {
      this.stopAll();
      return;
    }
    if (!this.ctx) {
      this.ownsCtx = !this.makeContext;
      this.ctx = this.makeContext ? this.makeContext() : new AudioContext();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    this.schedule();
  }

  dispose(): void {
    this.stopAll();
    for (const [t, f] of this.handlers) this.video.removeEventListener(t, f);
    this.runs = [];
    this.enabled = false;
    const ctx = this.ctx;
    this.ctx = null;
    if (this.ownsCtx) void ctx?.close?.();
  }

  private stopAll(): void {
    this.active = false;
    for (const s of this.sources) {
      s.onended = null;
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    }
    this.sources = [];
  }

  private schedule(): void {
    this.stopAll();
    const ctx = this.ctx;
    if (!this.enabled || !ctx || !this.track || this.video.paused || this.video.playbackRate !== 1) return;
    this.ctxTime0 = ctx.currentTime;
    this.videoTime0 = this.video.currentTime;
    this.active = true;
    for (const r of this.runs) this.scheduleRun(r);
  }

  private scheduleRun(r: Run): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    const vNow = this.videoTime0 + (now - this.ctxTime0);
    if (r.end <= vNow) return;
    // The output path delays the sound by outputLatency, so start it that much earlier.
    const latency = ctx.outputLatency ?? ctx.baseLatency ?? 0;
    const ideal = this.ctxTime0 + (r.start - this.videoTime0) - latency;
    const when = Math.max(ideal, now);
    const offset = Math.max(now - ideal, 0);
    if (offset >= r.samples.length / SAMPLE_RATE) return;
    if (!r.buffer) {
      r.buffer = ctx.createBuffer(1, r.samples.length, SAMPLE_RATE);
      r.buffer.copyToChannel(r.samples as Float32Array<ArrayBuffer>, 0);
    }
    const src = ctx.createBufferSource();
    src.buffer = r.buffer;
    src.connect(ctx.destination);
    src.onended = () => {
      this.sources = this.sources.filter((s) => s !== src);
    };
    src.start(when, offset);
    this.sources.push(src);
  }
}
