import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ErrFormat } from '../zrec/errors';
import { parseHeader } from '../zrec/header';
import { importMasterKey, deriveKeyId, deriveWrapKey, parseMasterKey } from '../zrec/keys';
import { chunkRange, decryptChunk, numChunks, openClip } from '../zrec/reader';
import { Fmp4Filter, type AudioRun } from './fmp4filter';

const enc = new TextEncoder();
const u32 = (n: number) => Uint8Array.of(n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);
const cat = (...p: Uint8Array[]): Uint8Array => {
  const o = new Uint8Array(p.reduce((a, b) => a + b.length, 0));
  let at = 0;
  for (const b of p) {
    o.set(b, at);
    at += b.length;
  }
  return o;
};
const box = (type: string, ...p: Uint8Array[]): Uint8Array => {
  const body = cat(...p);
  return cat(u32(8 + body.length), enc.encode(type), body);
};
const bigBox = (type: string, body: Uint8Array): Uint8Array =>
  cat(u32(1), enc.encode(type), u32(0), u32(16 + body.length), body);
const full = (v: number, flags: number) => cat(Uint8Array.of(v), u32(flags).subarray(1));

function trak(id: number, handler: string, timescale: number, entry?: string): Uint8Array {
  const tkhd = box('tkhd', full(0, 3), u32(0), u32(0), u32(id), new Uint8Array(68));
  const mdhd = box('mdhd', full(0, 0), u32(0), u32(0), u32(timescale), u32(0), new Uint8Array(4));
  const hdlr = box('hdlr', full(0, 0), u32(0), enc.encode(handler), new Uint8Array(13));
  const stsd = box('stsd', full(0, 0), u32(1), box(entry ?? 'avc1', new Uint8Array(20)));
  return box('trak', tkhd, box('mdia', mdhd, hdlr, box('minf', box('stbl', stsd))));
}
const trex = (id: number) => box('trex', full(0, 0), u32(id), u32(1), u32(0), u32(0), u32(0));
const mvhd = box('mvhd', new Uint8Array(100));
const ftyp = box('ftyp', enc.encode('isom'), u32(512), enc.encode('isom'));
const videoMoov = box('moov', mvhd, trak(1, 'vide', 90000), box('mvex', trex(1)));
const audioMoov = (entry = 'alaw') =>
  box('moov', mvhd, trak(1, 'vide', 90000), trak(2, 'soun', 8000, entry), box('mvex', trex(1), trex(2)));

function moof(track: number, tfdt: number): Uint8Array {
  const tfhd = box('tfhd', full(0, 0x20018), u32(track), u32(1), u32(1));
  const tfdtBox = box('tfdt', full(1, 0), u32(Math.floor(tfdt / 2 ** 32)), u32(tfdt >>> 0));
  const trun = box('trun', full(0, 1), u32(1), u32(0));
  return box('moof', box('mfhd', full(0, 0), u32(1)), box('traf', tfhd, tfdtBox, trun));
}
const vFrag = (tfdt: number, payload = Uint8Array.of(9, 9, 9, 9)) => cat(moof(1, tfdt), box('mdat', payload));
const aFrag = (tfdt: number, payload: Uint8Array) => cat(moof(2, tfdt), box('mdat', payload));

function run(f: Fmp4Filter, input: Uint8Array, step = input.length): Uint8Array {
  const out: Uint8Array[] = [];
  for (let i = 0; i < input.length; i += step) out.push(...f.push(input.subarray(i, i + step)));
  return cat(...out);
}
function children(b: Uint8Array): { type: string; body: Uint8Array }[] {
  const r = [];
  for (let at = 0; at < b.length; ) {
    const size = new DataView(b.buffer, b.byteOffset + at).getUint32(0);
    r.push({ type: new TextDecoder().decode(b.subarray(at + 4, at + 8)), body: b.subarray(at + 8, at + size) });
    at += size;
  }
  return r;
}

describe('Fmp4Filter', () => {
  it('passes a video-only stream through unchanged', () => {
    const input = cat(ftyp, videoMoov, box('free', Uint8Array.of(1, 2)), vFrag(0), vFrag(90000), bigBox('mdat', Uint8Array.of(5, 6)));
    for (const step of [input.length, 7, 1]) {
      const f = new Fmp4Filter(() => {
        throw new Error('no audio expected');
      });
      expect(run(f, input, step)).toEqual(input);
      expect(f.audio).toBeNull();
    }
  });

  it('removes the audio trak and trex from moov and fixes the sizes', () => {
    for (const step of [100000, 1]) {
      const f = new Fmp4Filter(() => {});
      const out = run(f, cat(ftyp, audioMoov()), step);
      const top = children(out);
      expect(top.map((c) => c.type)).toEqual(['ftyp', 'moov']);
      const moovKids = children(top[1]!.body);
      expect(moovKids.map((c) => c.type)).toEqual(['mvhd', 'trak', 'mvex']);
      expect(children(moovKids[2]!.body).map((c) => c.type)).toEqual(['trex']);
      expect(f.audio).toEqual({ codec: 'PCMA', trackId: 2, timescale: 8000 });
    }
    const f = new Fmp4Filter(() => {});
    run(f, audioMoov('ulaw'));
    expect(f.audio?.codec).toBe('PCMU');
  });

  it('drops audio fragments and reports their samples', () => {
    const runs: AudioRun[] = [];
    const f = new Fmp4Filter((r) => runs.push(r));
    const a1 = Uint8Array.of(1, 2, 3);
    const a2 = Uint8Array.of(4, 5);
    const input = cat(ftyp, audioMoov(), vFrag(0), aFrag(0, a1), aFrag(5000, a2), vFrag(90000));
    const out = run(f, input, 3);
    expect(out).toEqual(cat(ftyp, run(new Fmp4Filter(() => {}), audioMoov()), vFrag(0), vFrag(90000)));
    expect(runs.map((r) => r.tfdt)).toEqual([0, 5000]);
    expect([...runs[0]!.bytes]).toEqual([1, 2, 3]);
    expect([...runs[1]!.bytes]).toEqual([4, 5]);
  });

  it('streams a large video mdat without buffering it', () => {
    const f = new Fmp4Filter(() => {});
    run(f, cat(ftyp, audioMoov()));
    const frag = vFrag(0, new Uint8Array(2 * 1024 * 1024));
    const half = frag.subarray(0, frag.length / 2);
    const out = cat(...f.push(half));
    expect(out.length).toBeGreaterThan(half.length - 1000);
    expect(out).toEqual(half);
  });

  it('resumes after reset at a moof', () => {
    const runs: AudioRun[] = [];
    const f = new Fmp4Filter((r) => runs.push(r));
    run(f, cat(ftyp, audioMoov(), vFrag(0)).subarray(0, -3));
    f.reset();
    const out = run(f, cat(vFrag(90000), aFrag(8000, Uint8Array.of(7)), vFrag(180000)), 5);
    expect(out).toEqual(cat(vFrag(90000), vFrag(180000)));
    expect(runs).toHaveLength(1);
    expect(runs[0]!.tfdt).toBe(8000);
    expect(f.audio?.trackId).toBe(2);
  });

  it('keeps audio bytes independent of later pushes', () => {
    const runs: AudioRun[] = [];
    const f = new Fmp4Filter((r) => runs.push(r));
    run(f, audioMoov());
    const input = aFrag(0, Uint8Array.of(1, 2, 3));
    f.push(input);
    input.fill(0);
    expect([...runs[0]!.bytes]).toEqual([1, 2, 3]);
  });

  it('throws ErrFormat for a moof larger than 1 MiB or an audio mdat larger than 1 MiB', () => {
    const f1 = new Fmp4Filter(() => {});
    expect(() => f1.push(cat(u32(2 * 1024 * 1024), enc.encode('moof')))).toThrow(ErrFormat);
    const f2 = new Fmp4Filter(() => {});
    run(f2, audioMoov());
    f2.push(moof(2, 0));
    expect(() => f2.push(cat(u32(2 * 1024 * 1024), enc.encode('mdat')))).toThrow(ErrFormat);
    const f3 = new Fmp4Filter(() => {});
    expect(() => f3.push(cat(u32(4), enc.encode('free')))).toThrow(ErrFormat);
  });

  it('splits the real encrypted audio fixture clip', async () => {
    const root = new URL('../../../../testdata/clips/', import.meta.url);
    const manifest = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8'));
    const dir = new URL('audio/zrelay/clips/front-door/', root);
    const day = (p: URL): URL => {
      const d = readdirSync(p, { withFileTypes: true }).find((e) => e.isDirectory());
      return d ? day(new URL(`${d.name}/`, p)) : p;
    };
    const leaf = day(dir);
    const name = readdirSync(leaf).find((n) => n.endsWith('.zrec'))!;
    const file = new Uint8Array(readFileSync(new URL(name, leaf)));
    const base = await importMasterKey(parseMasterKey(manifest.master_key));
    const ring = new Map([[Array.from(await deriveKeyId(base), (x) => x.toString(16).padStart(2, '0')).join(''), await deriveWrapKey(base)]]);
    const h = parseHeader(file);
    const clip = await openClip(h, ring);
    const n = numChunks(h.headerLen, h.chunkSize, file.length);
    const plain: Uint8Array[] = [];
    for (let i = 0; i < n; i++) {
      const [a, b] = chunkRange(i, h.headerLen, h.chunkSize, file.length);
      plain.push(new Uint8Array((await decryptChunk(clip, i, n, file.subarray(a, b), { allowIncomplete: false })).plain));
    }
    const runs: AudioRun[] = [];
    const f = new Fmp4Filter((r) => runs.push(r));
    const out: Uint8Array[] = [];
    for (const p of plain) out.push(...f.push(p));
    expect(f.audio).toEqual({ codec: 'PCMA', trackId: 2, timescale: 8000 });
    const moov = children(cat(...out)).find((c) => c.type === 'moov')!;
    expect(children(moov.body).filter((c) => c.type === 'trak')).toHaveLength(1);
    expect(runs.length).toBeGreaterThan(0);
    const samples = runs.reduce((a, r) => a + r.bytes.length, 0);
    expect(samples).toBeGreaterThan(8000 * 8);
    // The beep makes some samples differ from A-law silence (0xD5).
    expect(runs.some((r) => r.bytes.some((b) => b !== 0xd5))).toBe(true);
    expect(runs.map((r) => r.tfdt)).toEqual([...runs.map((r) => r.tfdt)].sort((a, b) => a - b));
    // Output holds only video fragments.
    for (const c of children(cat(...out))) expect(['ftyp', 'moov', 'moof', 'mdat']).toContain(c.type);
    expect(cat(...out).length).toBeLessThan(plain.reduce((a, p) => a + p.length, 0));
  });
});
