// Real committed clips (testdata/clips/<name>), decrypted in Node so engine tests can feed true fMP4 bytes.
import { readFileSync, readdirSync } from 'node:fs';
import type { ClipOpenResult } from '../src/worker/protocol';
import { parseHeader } from '../src/lib/zrec/header';
import { deriveKeyId, deriveWrapKey, importMasterKey, parseMasterKey } from '../src/lib/zrec/keys';
import { chunkRange, decryptChunk, numChunks, openClip } from '../src/lib/zrec/reader';
import { openResult } from './player-fakes';

export interface FixtureClip {
  open: ClipOpenResult;
  /** Decrypted chunk `i`. With `tamper`, one ciphertext byte is flipped first, so this rejects as the worker would. */
  read(i: number, tamper?: boolean): Promise<ArrayBuffer>;
  /** The whole plaintext, in order. */
  plain(): Promise<Uint8Array>;
}

export async function loadFixtureClip(name: 'audio' | 'complete'): Promise<FixtureClip> {
  const root = new URL('../../testdata/clips/', import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8')) as { master_key: string };
  const descend = (p: URL): URL => {
    const d = readdirSync(p, { withFileTypes: true }).find((e) => e.isDirectory());
    return d ? descend(new URL(`${d.name}/`, p)) : p;
  };
  const leaf = descend(new URL(`${name}/zrelay/clips/`, root));
  const names = readdirSync(leaf);
  const zrec = names.find((n) => n.endsWith('.zrec'))!;
  const sidecar = JSON.parse(readFileSync(new URL(names.find((n) => n.endsWith('.json'))!, leaf), 'utf8')) as {
    video: { codec: string; init_segment_bytes: number; plaintext_size_bytes: number; seek_index: [number, number][] };
  };
  const file = new Uint8Array(readFileSync(new URL(zrec, leaf)));
  const base = await importMasterKey(parseMasterKey(manifest.master_key));
  const keyId = Array.from(await deriveKeyId(base), (x) => x.toString(16).padStart(2, '0')).join('');
  const ring = new Map([[keyId, await deriveWrapKey(base)]]);
  const h = parseHeader(file);
  const clip = await openClip(h, ring);
  const n = numChunks(h.headerLen, h.chunkSize, file.length);
  const read = async (i: number, tamper = false): Promise<ArrayBuffer> => {
    const [a, b] = chunkRange(i, h.headerLen, h.chunkSize, file.length);
    const ct = file.slice(a, b);
    if (tamper) ct[ct.length >> 1] = ct[ct.length >> 1]! ^ 0xff;
    return (await decryptChunk(clip, i, n, ct, { allowIncomplete: false })).plain as ArrayBuffer;
  };
  return {
    open: openResult({
      numChunks: n,
      codec: sidecar.video.codec,
      seekIndex: sidecar.video.seek_index,
      initSegmentBytes: sidecar.video.init_segment_bytes,
      plaintextSizeBytes: sidecar.video.plaintext_size_bytes,
    }),
    read,
    async plain() {
      const parts: Uint8Array[] = [];
      for (let i = 0; i < n; i++) parts.push(new Uint8Array(await read(i)));
      const o = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
      let at = 0;
      for (const p of parts) {
        o.set(p, at);
        at += p.length;
      }
      return o;
    },
  };
}
