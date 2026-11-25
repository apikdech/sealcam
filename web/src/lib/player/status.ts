// User-facing wording for the integrity states (ui-spec §4.4).
import { fingerprint } from '../../routes/onboarding/keyInput';
import { formatClock } from '../timeline/timezone';
import type { PlayerState } from './engine';

export function initialState(): PlayerState {
  return {
    clipId: null,
    integrity: 'verifying',
    engine: null,
    failedAtMs: null,
    verification: null,
    header: null,
    keyId: null,
    message: null,
    hasAudio: false,
  };
}

/** `mm:ss`, rounded to the nearest second. */
export function formatMmss(ms: number): string {
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export interface IntegrityView {
  kind: PlayerState['integrity'];
  /** Short text for the badge or banner. */
  text: string;
  /** Tooltip. */
  title: string;
  spinner: boolean;
  /** Whether exporting the recording may be offered. */
  export: boolean;
  /** What the viewer can do about it, when anything. */
  next: string | null;
  /** Where `next` leads, when it is a link. */
  nextHref: string | null;
}

export interface IntegrityContext {
  zone: string;
  cameraName: (id: string) => string;
}

export function describeIntegrity(s: PlayerState, ctx: IntegrityContext): IntegrityView {
  switch (s.integrity) {
    case 'verifying':
      // The clip could not be opened (network, no key): there is nothing left to wait for.
      if (s.message !== null) {
        return { kind: 'verifying', text: 'Could not verify this recording', title: 'Not verified', spinner: false, export: false, next: null, nextHref: null };
      }
      // Nothing selected yet: nothing is being verified.
      if (s.clipId === null) {
        return { kind: 'verifying', text: '', title: 'No recording selected', spinner: false, export: false, next: null, nextHref: null };
      }
      return { kind: 'verifying', text: 'Verifying…', title: 'Verifying the encrypted recording', spinner: true, export: false, next: null, nextHref: null };
    case 'verified':
      return { kind: 'verified', text: 'Verified', title: 'Encrypted recording verified', spinner: false, export: true, next: null, nextHref: null };
    case 'mismatch': {
      const h = s.header;
      const shown = h ? ` Showing the header's values: ${ctx.cameraName(h.cameraId)}, started ${formatClock(h.startUnixMs, ctx.zone, true)}.` : '';
      return {
        kind: 'mismatch',
        text: `This recording's description disagrees with its encrypted header.${shown}`,
        title: 'Description mismatch',
        spinner: false,
        export: true,
        next: null,
        nextHref: null,
      };
    }
    case 'tampered': {
      const at = s.failedAtMs === null ? '' : ` at ~${formatMmss(s.failedAtMs)}`;
      return {
        kind: 'tampered',
        text: `This recording failed verification${at}`,
        title: 'Tampered or corrupted',
        spinner: false,
        export: false,
        next: 'Export is turned off for this recording.',
        nextHref: null,
      };
    }
    case 'incomplete':
      return {
        kind: 'incomplete',
        text: 'Recording was interrupted',
        title: 'Incomplete: only the verified portion plays',
        spinner: false,
        export: true,
        next: null,
        nextHref: null,
      };
    case 'unknown-key':
      return {
        kind: 'unknown-key',
        text: `Recorded with key ${s.keyId ? fingerprint(s.keyId.replaceAll('-', '')) : '(unknown)'}; add that key to play`,
        title: 'Unknown key',
        spinner: false,
        export: false,
        next: 'Open Keys',
        nextHref: '#/key',
      };
  }
}
