// The relay status dot (ui-spec §4.7): red when relay.json is older than 3
// minutes or a camera is down, amber while something is degraded or the
// storage breaker is not closed, grey when no status could be read.
import type { Status } from '../worker/schemas';
import { formatClock } from './timeline/timezone';

/** Contract §7.5.1: viewers treat the relay as down when updated_at is older than this. */
export const STALE_AFTER_MS = 3 * 60_000;

export type HealthLevel = 'ok' | 'warn' | 'bad' | 'unknown';

export interface RelayHealth {
  level: HealthLevel;
  /** One line per finding; the title attribute of the dot. */
  tooltip: string;
  /** The most important finding, for the accessible name. */
  summary: string;
}

export function relayHealth(status: Status | null, nowMs: number): RelayHealth {
  if (status === null) {
    const s = 'Relay status unavailable';
    return { level: 'unknown', tooltip: s, summary: s };
  }
  const bad: string[] = [];
  const warn: string[] = [];

  const updated = Date.parse(status.updated_at);
  if (Number.isNaN(updated) || nowMs - updated > STALE_AFTER_MS) {
    bad.push(`Relay status is stale: last updated ${status.updated_at}`);
  }
  for (const c of status.cameras) {
    if (c.rtsp === 'down') bad.push(`${c.name}: camera is down since ${c.since}`);
    else if (c.rtsp === 'degraded') warn.push(`${c.name}: video is degraded since ${c.since}`);
    else if (c.events !== 'up') warn.push(`${c.name}: events ${c.events} since ${c.since}`);
  }
  const st = status.storage;
  if (st && st.state !== 'closed') {
    warn.push(`Storage breaker ${st.state.replace('_', '-')}${st.since ? ` since ${st.since}` : ''}`);
  }

  const lines = [...bad, ...warn];
  if (bad.length > 0) return { level: 'bad', tooltip: lines.join('\n'), summary: bad[0]! };
  if (warn.length > 0) return { level: 'warn', tooltip: lines.join('\n'), summary: warn[0]! };
  const ok = `Relay OK, updated ${status.updated_at}`;
  return { level: 'ok', tooltip: ok, summary: ok };
}

export interface RecorderWords {
  level: HealthLevel;
  /** A few plain words for the top bar. */
  short: string;
  /** One plain sentence per finding, times in the display zone. */
  details: string[];
}

/** The same health, in words a non-technical viewer can read. */
export function recorderWords(status: Status | null, nowMs: number, zone: string): RecorderWords {
  const { level } = relayHealth(status, nowMs);
  if (status === null) {
    return { level, short: 'Status unavailable', details: ['The recorder status could not be read.'] };
  }

  const at = (iso: string) => {
    const ms = Date.parse(iso);
    return Number.isNaN(ms) ? 'an unknown time' : formatClock(ms, zone);
  };
  const details: string[] = [];
  const updated = Date.parse(status.updated_at);
  const stale = Number.isNaN(updated) || nowMs - updated > STALE_AFTER_MS;
  if (stale) details.push(`The recorder last checked in at ${at(status.updated_at)}.`);

  const down = status.cameras.filter((c) => c.rtsp === 'down');
  const other = status.cameras.filter((c) => c.rtsp !== 'down' && (c.rtsp === 'degraded' || c.events !== 'up'));
  for (const c of down) details.push(`${c.name} has been offline since ${at(c.since)}.`);
  for (const c of other) details.push(`${c.name} has been degraded since ${at(c.since)}.`);
  const st = status.storage;
  const delayed = st !== undefined && st.state !== 'closed';
  if (delayed) details.push(`Saving to storage is delayed${st.since ? ` since ${at(st.since)}` : ''}.`);

  let short: string;
  if (stale) {
    const min = Math.floor((nowMs - updated) / 60_000);
    if (Number.isNaN(min)) short = 'Recorder quiet';
    else short = min >= 120 ? `Recorder quiet ${Math.floor(min / 60)} h` : `Recorder quiet ${min} min`;
  } else if (down.length > 1) short = `${down.length} cameras offline`;
  else if (down.length === 1) short = `${down[0]!.name} offline`;
  else if (other.length > 0) short = `${other[0]!.name} degraded`;
  else if (delayed) short = 'Storage delayed';
  else short = 'Recorder OK';

  if (details.length === 0) details.push(`The recorder checked in at ${at(status.updated_at)}.`);
  return { level, short, details };
}
