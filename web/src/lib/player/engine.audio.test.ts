// Clip audio in the playback engine (clip-audio design §5.6-§5.7): the audio track is stripped from what the
// browser's player receives and handed to ClipAudio, from authenticated chunks only.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeClient, installMedia, until, type Env } from '../../../test-support/player-fakes';
import { loadFixtureClip, type FixtureClip } from '../../../test-support/clip-fixtures';
import type { ClipReadResult } from '../../worker/protocol';
import type { WorkerClient } from '../workerClient';
import type { AudioRun, AudioTrackInfo } from './fmp4filter';
import { Fmp4Filter } from './fmp4filter';
import { createPlayer, type Player, type PlayerState } from './engine';

type Call = ['setTrack', AudioTrackInfo | null] | ['add', AudioRun] | ['evictBefore', number] | ['clear'] | ['setEnabled', boolean] | ['dispose'];

const fake = vi.hoisted(() => ({ instances: [] as { calls: unknown[][]; runs: { tfdt: number; bytes: Uint8Array }[]; ctx: unknown }[] }));
// Faithful to the real ClipAudio: `add` is ignored before `setTrack`, `setTrack` clears, a tfdt is held once,
// and an injected context is asked for on enable and never closed.
vi.mock('./audio', () => ({
  ClipAudio: class {
    calls: unknown[][] = [];
    runs: { tfdt: number; bytes: Uint8Array }[] = [];
    track: unknown = null;
    ctx: unknown = null;
    constructor(_v: unknown, private readonly makeContext: () => unknown) {
      fake.instances.push(this);
    }
    setTrack(i: unknown) {
      this.calls.push(['setTrack', i]);
      this.track = i;
      this.runs = [];
    }
    add(r: { tfdt: number; bytes: Uint8Array }) {
      this.calls.push(['add', r]);
      if (!this.track || this.runs.some((x) => x.tfdt === r.tfdt)) return;
      this.runs.push(r);
    }
    evictBefore(t: number) {
      this.calls.push(['evictBefore', t]);
      this.runs = this.runs.filter((r) => (r.tfdt + r.bytes.length) / 8000 >= t);
    }
    clear() {
      this.calls.push(['clear']);
      this.runs = [];
    }
    setEnabled(on: boolean) {
      this.calls.push(['setEnabled', on]);
      if (on) this.ctx = this.makeContext();
    }
    dispose() {
      this.calls.push(['dispose']);
    }
  },
}));

let env: Env;
let audio: FixtureClip;
let plain: FixtureClip;
beforeEach(async () => {
  env = installMedia({ mms: false });
  (globalThis as unknown as Record<string, unknown>).AudioContext ??= class {
    close() {}
  };
  fake.instances.length = 0;
  audio ??= await loadFixtureClip('audio');
  plain ??= await loadFixtureClip('complete');
});
afterEach(() => env.restore());

const CLIP = '01M893949RGGXBHCCZ8E94D1J5';
const clientFor = (f: FixtureClip, tamperAt = -1): FakeClient =>
  new FakeClient({
    open: f.open,
    read: (i): Promise<ClipReadResult> => f.read(i, i === tamperAt).then((plaintext) => ({ plaintext, final: i === f.open.numChunks - 1 })),
  });
function make(client: FakeClient): { p: Player; states: PlayerState[] } {
  const p = createPlayer(env.video as unknown as HTMLVideoElement, client as unknown as WorkerClient, { profile: 'desktop' });
  const states: PlayerState[] = [];
  p.onState((s) => states.push(s));
  return { p, states };
}
const last = (s: PlayerState[]) => s[s.length - 1]!;
const calls = (i = 0) => fake.instances[i]!.calls as Call[];
const adds = (c: Call[]) => c.filter((x): x is ['add', AudioRun] => x[0] === 'add').map((x) => x[1]);
const startOf = (r: AudioRun) => r.tfdt / 8000;
const u32 = (b: Uint8Array, at: number) => new DataView(b.buffer, b.byteOffset).getUint32(at);
const cat = (parts: Uint8Array[]): Uint8Array => {
  const o = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let at = 0;
  for (const p of parts) {
    o.set(p, at);
    at += p.length;
  }
  return o;
};
function boxes(b: Uint8Array): { type: string; body: Uint8Array }[] {
  const out = [];
  for (let at = 0; at < b.length; ) {
    const size = u32(b, at);
    out.push({ type: new TextDecoder().decode(b.subarray(at + 4, at + 8)), body: b.subarray(at + 8, at + size) });
    at += size;
  }
  return out;
}
/** Track count in the moov and the track id of every moof, from a stream of top-level boxes. */
function describeStream(b: Uint8Array): { traks: number; moofTracks: number[] } {
  const top = boxes(b);
  const moov = top.find((x) => x.type === 'moov')!;
  const moofTracks = top
    .filter((x) => x.type === 'moof')
    .map((m) => {
      const tfhd = boxes(boxes(m.body).find((x) => x.type === 'traf')!.body).find((x) => x.type === 'tfhd')!;
      return u32(tfhd.body, 4);
    });
  return { traks: boxes(moov.body).filter((x) => x.type === 'trak').length, moofTracks };
}
const sb = () => env.mediaSources()[0]!.sb!;
const finished = () => until(() => env.mediaSources().at(-1)?.readyState === 'ended', 'ended');

describe('engine clip audio', () => {
  it('MediaSource never receives the audio track', async () => {
    const { p } = make(clientFor(audio));
    await p.load(CLIP);
    await finished();
    const got = describeStream(cat(sb().appends));
    expect(got.traks).toBe(1);
    expect(got.moofTracks.length).toBeGreaterThan(0);
    expect(got.moofTracks.every((t) => t === 1)).toBe(true);
    expect(adds(calls()).length).toBeGreaterThan(0);
  });

  it('a clip without audio appends exactly the decrypted bytes', async () => {
    const { p } = make(clientFor(plain));
    await p.load(CLIP);
    await finished();
    expect(cat(sb().appends)).toEqual(await plain.plain());
    expect(adds(calls())).toHaveLength(0);
  });

  it('hasAudio follows the init segment', async () => {
    const a = make(clientFor(audio));
    expect(last(a.states).hasAudio).toBe(false);
    await a.p.load(CLIP);
    await until(() => last(a.states).hasAudio, 'hasAudio');
    expect(calls().find((c) => c[0] === 'setTrack')).toEqual(['setTrack', { codec: 'PCMA', trackId: 2, timescale: 8000 }]);
    a.p.destroy();

    const b = make(clientFor(plain));
    await b.p.load(CLIP);
    await finished();
    expect(last(b.states).hasAudio).toBe(false);
  });

  it('schedules from the seek point', async () => {
    const client = clientFor(audio);
    client.hold.add(3); // the fill stalls part-way through the clip, with the filter inside a box
    const { p } = make(client);
    await p.load(CLIP);
    await until(() => client.reads.includes(3) && sb().appends.length >= 3, 'fill stalled at chunk 3');
    const before = calls().length;
    sb().ranges = [];
    await p.seek(10_000);
    client.releaseAll();
    const after = calls().slice(before);
    // Fetch seeks keep the audio of older buffered ranges.
    expect(after.some((c) => c[0] === 'clear')).toBe(false);
    const held = fake.instances[0]!.runs;
    expect(held.some((r) => startOf(r) < 2)).toBe(true);
    const fed = adds(after);
    expect(fed.length).toBeGreaterThan(0);
    expect(Math.min(...fed.map(startOf))).toBeGreaterThanOrEqual(9);
    expect(new Set(held.map((r) => r.tfdt)).size).toBe(held.length);
  });

  it('evicts audio together with the video behind the playhead', async () => {
    const { p } = make(clientFor(audio));
    env.video.currentTime = 45;
    await p.load(CLIP);
    await finished();
    expect(calls().filter((c) => c[0] === 'evictBefore').map((c) => c[1])).toContain(15);
  });

  it('stops audio at the failure point', async () => {
    const { p, states } = make(clientFor(audio, 8));
    await p.load(CLIP);
    await until(() => last(states).integrity === 'tampered', 'tampered');
    await finished();
    const c = calls();
    expect(c.some((x) => x[0] === 'clear')).toBe(false);
    // Nothing from the failing chunk or after it was fed, and what was verified stays.
    const reference: AudioRun[] = [];
    const f = new Fmp4Filter((r) => reference.push(r));
    for (let i = 0; i < 8; i++) f.push(new Uint8Array(await audio.read(i)));
    expect(adds(c)).toEqual(reference);
    expect(fake.instances[0]!.runs.length).toBeGreaterThan(0);
  });

  it('the Blob path filters too', async () => {
    env.restore();
    env = installMedia({ mse: false, mms: false });
    const { p } = make(clientFor(audio));
    await p.load(CLIP);
    await until(() => env.video.src !== '', 'blob src');
    const blob = env.registry.get(env.video.src) as Blob;
    const got = describeStream(new Uint8Array(await blob.arrayBuffer()));
    expect(got.traks).toBe(1);
    expect(got.moofTracks.every((t) => t === 1)).toBe(true);
    expect(adds(calls()).length).toBeGreaterThan(0);
    expect(calls().find((c) => c[0] === 'setTrack')).toBeDefined();
  });

  it('a cached Blob restores its audio', async () => {
    env.restore();
    env = installMedia({ mse: false, mms: false });
    const { p } = make(clientFor(audio));
    await p.load(CLIP);
    await until(() => env.video.src !== '', 'blob src');
    const n = adds(calls()).length;
    await p.load(CLIP);
    await until(() => adds(calls(1)).length > 0, 'audio restored');
    expect(adds(calls(1))).toHaveLength(n);
    expect(calls(1).find((c) => c[0] === 'setTrack')).toBeDefined();
  });

  it('setSound survives the next clip', async () => {
    const { p } = make(clientFor(audio));
    p.setSound(true);
    await p.load(CLIP);
    await p.load('01M893949RGGXBHCCZ8E94D1K6');
    expect(calls(0).at(-1)).toEqual(['dispose']);
    expect(calls(1).find((c) => c[0] === 'setEnabled')).toEqual(['setEnabled', true]);
    p.setSound(false);
    expect(calls(1).at(-1)).toEqual(['setEnabled', false]);
  });

  it('keeps the audio of a chunk that holds the moov', async () => {
    const whole = await audio.plain();
    const reference: AudioRun[] = [];
    const f = new Fmp4Filter((r) => reference.push(r));
    f.push(whole);
    expect(reference.length).toBeGreaterThan(0);
    const client = new FakeClient({
      open: { ...audio.open, numChunks: 1 },
      read: () => ({ plaintext: whole.buffer.slice(whole.byteOffset, whole.byteOffset + whole.length) as ArrayBuffer, final: true }),
    });
    const { p } = make(client);
    await p.load(CLIP);
    await finished();
    expect(fake.instances[0]!.runs).toEqual(reference);
  });

  it('uses one AudioContext for the player and closes it on destroy', async () => {
    const closed = vi.fn(() => Promise.resolve());
    const made: unknown[] = [];
    const g = globalThis as unknown as Record<string, unknown>;
    const saved = g.AudioContext;
    g.AudioContext = class {
      close = closed;
      constructor() {
        made.push(this);
      }
    };
    try {
      const { p } = make(clientFor(audio));
      p.setSound(true);
      await p.load(CLIP);
      await p.load('01M893949RGGXBHCCZ8E94D1K6');
      expect(made).toHaveLength(1);
      expect(fake.instances[0]!.ctx).toBe(made[0]);
      expect(fake.instances[1]!.ctx).toBe(made[0]);
      expect(closed).not.toHaveBeenCalled();
      p.destroy();
      expect(closed).toHaveBeenCalledTimes(1);
    } finally {
      g.AudioContext = saved;
    }
  });

  describe('iOS audio session', () => {
    afterEach(() => {
      delete (navigator as unknown as Record<string, unknown>).audioSession;
    });

    it('setSound(true) sets the audio session to playback', () => {
      const session = { type: 'auto' };
      Object.defineProperty(navigator, 'audioSession', { value: session, configurable: true });
      const { p } = make(clientFor(audio));
      p.setSound(false);
      expect(session.type).toBe('auto');
      p.setSound(true);
      expect(session.type).toBe('playback');
    });

    it('setSound(true) is fine without navigator.audioSession', () => {
      const { p } = make(clientFor(audio));
      expect(() => p.setSound(true)).not.toThrow();
    });
  });
});
