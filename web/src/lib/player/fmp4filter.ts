import { ErrFormat } from '../zrec/errors';

export interface AudioTrackInfo {
  codec: 'PCMA' | 'PCMU';
  trackId: number;
  timescale: number;
}
/** tfdt is in track timescale units. */
export interface AudioRun {
  tfdt: number;
  bytes: Uint8Array;
}

/** Cap for a buffered moov or moof and for a captured audio mdat. */
const MAX_BOX = 1 << 20;

const dv = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, b.byteLength);
const fourcc = (b: Uint8Array, at: number) => String.fromCharCode(b[at]!, b[at + 1]!, b[at + 2]!, b[at + 3]!);
const concat = (parts: Uint8Array[]): Uint8Array => {
  const o = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    o.set(p, at);
    at += p.length;
  }
  return o;
};

interface Child {
  type: string;
  /** The whole box, header included. */
  raw: Uint8Array;
  body: Uint8Array;
}

/** Splits the payload of a container box into children (32-bit sizes only). */
function children(b: Uint8Array): Child[] {
  const out: Child[] = [];
  for (let at = 0; at < b.length; ) {
    if (at + 8 > b.length) throw new ErrFormat('truncated box header');
    const size = dv(b).getUint32(at);
    if (size < 8 || at + size > b.length) throw new ErrFormat('bad child box size');
    out.push({ type: fourcc(b, at + 4), raw: b.subarray(at, at + size), body: b.subarray(at + 8, at + size) });
    at += size;
  }
  return out;
}
const find = (kids: Child[], type: string): Child | undefined => kids.find((k) => k.type === type);
const need = (c: Child | undefined, what: string): Child => {
  if (!c) throw new ErrFormat(`missing ${what}`);
  return c;
};
const box = (type: string, kids: Uint8Array[]): Uint8Array => {
  const body = concat(kids);
  const o = new Uint8Array(8 + body.length);
  dv(o).setUint32(0, o.length);
  for (let i = 0; i < 4; i++) o[4 + i] = type.charCodeAt(i);
  o.set(body, 8);
  return o;
};
const checked = (b: Uint8Array, len: number): Uint8Array => {
  if (b.length < len) throw new ErrFormat('short box');
  return b;
};

function parseAudioTrak(trak: Child): AudioTrackInfo {
  const kids = children(trak.body);
  const tkhd = checked(need(find(kids, 'tkhd'), 'tkhd').body, 24);
  const trackId = dv(tkhd).getUint32(tkhd[0] === 1 ? 20 : 12);
  const mdia = children(need(find(kids, 'mdia'), 'mdia').body);
  const mdhd = checked(need(find(mdia, 'mdhd'), 'mdhd').body, 24).subarray(0);
  const timescale = dv(mdhd).getUint32(mdhd[0] === 1 ? 20 : 12);
  const stbl = children(need(find(children(need(find(mdia, 'minf'), 'minf').body), 'stbl'), 'stbl').body);
  const stsd = checked(need(find(stbl, 'stsd'), 'stsd').body, 16);
  const entry = fourcc(stsd, 12);
  if (entry !== 'alaw' && entry !== 'ulaw') throw new ErrFormat(`unsupported audio sample entry ${entry}`);
  return { codec: entry === 'alaw' ? 'PCMA' : 'PCMU', trackId, timescale };
}

function isAudioTrak(trak: Child): boolean {
  const mdia = find(children(trak.body), 'mdia');
  const hdlr = mdia && find(children(mdia.body), 'hdlr');
  return !!hdlr && hdlr.body.length >= 12 && fourcc(hdlr.body, 8) === 'soun';
}

/** Returns the moov without its audio trak and trex, and the audio info if any. */
function rewriteMoov(moov: Uint8Array): { moov: Uint8Array; audio: AudioTrackInfo | null } {
  const kids = children(moov.subarray(8));
  const trak = kids.find((k) => k.type === 'trak' && isAudioTrak(k));
  if (!trak) return { moov, audio: null };
  const audio = parseAudioTrak(trak);
  const parts = kids
    .filter((k) => k !== trak)
    .map((k) => {
      if (k.type !== 'mvex') return k.raw;
      const keep = children(k.body).filter(
        (t) => !(t.type === 'trex' && t.body.length >= 8 && dv(t.body).getUint32(4) === audio.trackId),
      );
      return box('mvex', keep.map((t) => t.raw));
    });
  return { moov: box('moov', parts), audio };
}

/** The track_ID of the first traf and its tfdt. */
function parseMoof(moof: Uint8Array): { trackId: number; tfdt: number } {
  const traf = need(find(children(moof.subarray(8)), 'traf'), 'traf');
  const kids = children(traf.body);
  const tfhd = checked(need(find(kids, 'tfhd'), 'tfhd').body, 8);
  const trackId = dv(tfhd).getUint32(4);
  const t = find(kids, 'tfdt')?.body;
  let tfdt = 0;
  if (t) {
    checked(t, t[0] === 1 ? 12 : 8);
    tfdt = t[0] === 1 ? dv(t).getUint32(4) * 2 ** 32 + dv(t).getUint32(8) : dv(t).getUint32(4);
  }
  return { trackId, tfdt };
}

type Mode = 'header' | 'pass' | 'buffer' | 'audio';

/**
 * Streaming fMP4 filter: strips the audio track from the stream bound for
 * MediaSource and hands the audio samples to a callback. Input may be split
 * at any byte. moov, moof and audio mdat are buffered whole (max 1 MiB each);
 * everything else streams through.
 */
export class Fmp4Filter {
  private info: AudioTrackInfo | null = null;
  private head = new Uint8Array(16);
  private headLen = 0;
  private mode: Mode = 'header';
  private remaining = 0;
  private buf = new Uint8Array(0);
  private bufLen = 0;
  private bufType = '';
  private audioNext: { tfdt: number } | null = null;

  constructor(private readonly onAudio: (run: AudioRun) => void) {}

  get audio(): AudioTrackInfo | null {
    return this.info;
  }

  reset(): void {
    this.headLen = 0;
    this.mode = 'header';
    this.remaining = 0;
    this.buf = new Uint8Array(0);
    this.bufLen = 0;
    this.audioNext = null;
  }

  push(bytes: Uint8Array): Uint8Array[] {
    const out: Uint8Array[] = [];
    let pos = 0;
    while (pos < bytes.length || (this.mode !== 'header' && this.remaining === 0)) {
      if (this.mode === 'header') {
        const want = this.headLen >= 8 && dv(this.head).getUint32(0) === 1 ? 16 : 8;
        const take = Math.min(want - this.headLen, bytes.length - pos);
        this.head.set(bytes.subarray(pos, pos + take), this.headLen);
        this.headLen += take;
        pos += take;
        if (this.headLen === 8 && dv(this.head).getUint32(0) === 1) continue;
        if (this.headLen === want) this.startBox(out);
      } else if (this.remaining === 0) {
        this.finishBox(out);
      } else {
        const take = Math.min(this.remaining, bytes.length - pos);
        const part = bytes.subarray(pos, pos + take);
        if (this.mode === 'pass') out.push(part);
        else {
          this.buf.set(part, this.bufLen);
          this.bufLen += take;
        }
        this.remaining -= take;
        pos += take;
      }
    }
    return out;
  }

  private startBox(out: Uint8Array[]): void {
    const h = dv(this.head);
    const type = fourcc(this.head, 4);
    let hdrLen = 8;
    let total = h.getUint32(0);
    if (total === 1) {
      hdrLen = 16;
      total = h.getUint32(8) * 2 ** 32 + h.getUint32(12);
      if (!Number.isSafeInteger(total)) throw new ErrFormat('box too large');
    } else if (total === 0) {
      total = Infinity;
    }
    if (total < hdrLen) throw new ErrFormat(`bad ${type} box size`);
    const header = this.head.slice(0, hdrLen);
    this.headLen = 0;
    this.bufType = type;
    this.remaining = total - hdrLen;
    if (type === 'moov' || type === 'moof') {
      if (total > MAX_BOX) throw new ErrFormat(`${type} larger than ${MAX_BOX} bytes`);
      this.mode = 'buffer';
      this.buf = new Uint8Array(total);
      this.buf.set(header);
      this.bufLen = hdrLen;
    } else if (type === 'mdat' && this.audioNext) {
      if (this.remaining > MAX_BOX) throw new ErrFormat(`audio mdat larger than ${MAX_BOX} bytes`);
      this.mode = 'audio';
      this.buf = new Uint8Array(this.remaining);
      this.bufLen = 0;
    } else {
      this.mode = 'pass';
      this.audioNext = null;
      out.push(header);
    }
  }

  private finishBox(out: Uint8Array[]): void {
    const mode = this.mode;
    this.mode = 'header';
    if (mode === 'audio') {
      const { tfdt } = this.audioNext!;
      this.audioNext = null;
      this.onAudio({ tfdt, bytes: this.buf });
      this.buf = new Uint8Array(0);
    } else if (mode === 'buffer') {
      const whole = this.buf;
      this.buf = new Uint8Array(0);
      if (this.bufType === 'moov') {
        const r = rewriteMoov(whole);
        if (r.audio) this.info = r.audio;
        out.push(r.moov);
      } else {
        const m = parseMoof(whole);
        if (this.info && m.trackId === this.info.trackId) this.audioNext = { tfdt: m.tfdt };
        else {
          this.audioNext = null;
          out.push(whole);
        }
      }
    }
  }
}
