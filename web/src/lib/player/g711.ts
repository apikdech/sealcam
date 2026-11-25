function alaw(a: number): number {
  a ^= 0x55;
  let t = (a & 0x0f) << 4;
  const seg = (a & 0x70) >> 4;
  if (seg === 0) t += 8;
  else {
    t += 0x108;
    t <<= seg - 1;
  }
  return a & 0x80 ? t : -t;
}

function ulaw(u: number): number {
  u = ~u & 0xff;
  const t = (((u & 0x0f) << 3) + 0x84) << ((u & 0x70) >> 4);
  return u & 0x80 ? 0x84 - t : t - 0x84;
}

const TABLES = { PCMA: new Float32Array(256), PCMU: new Float32Array(256) };
for (let i = 0; i < 256; i++) {
  TABLES.PCMA[i] = alaw(i) / 32768;
  TABLES.PCMU[i] = ulaw(i) / 32768;
}

/** One G.711 byte becomes one Float32 sample in [-1, 1). */
export function decodeG711(bytes: Uint8Array, codec: 'PCMA' | 'PCMU'): Float32Array {
  const table = TABLES[codec];
  const out = new Float32Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) out[i] = table[bytes[i]!]!;
  return out;
}
