// One live tile's lifecycle: opens a WHEP session, reconnects with backoff,
// closes while the tab is hidden and reopens when it is visible again.
import { startWhep, type WhepClient, type WhepSession } from './whep';

export type TileState = 'connecting' | 'live' | 'reconnecting' | 'limit' | 'locked' | 'offline';

export interface TileSnapshot {
  state: TileState;
  /** An audio track exists, so unmuting is possible. */
  canUnmute: boolean;
  muted: boolean;
  /** Epoch ms of the next attempt; null when none is scheduled. */
  retryAt: number | null;
}

export interface TileOptions {
  video: HTMLVideoElement;
  cameraId: string;
  client: WhepClient;
  /** Visibility source; defaults to `document`. */
  doc?: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>;
  /** Clock source; defaults to `Date.now`. */
  now?: () => number;
  onChange(s: TileSnapshot): void;
}

export interface Tile {
  start(): void;
  destroy(): void;
  toggleMute(): void;
  /** Mute unconditionally (audio focus), even when the audio track is gone. */
  mute(): void;
  /** Cancel the timer, reset the backoff and open now. No-op while live or offline. */
  tryNow(): void;
  /** The relay reports the camera down (true) or back (false). */
  setOffline(down: boolean): void;
  snapshot(): TileSnapshot;
}

const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 30_000;

/** Reconnect delay before attempt `n` (0-based): 1 s doubling up to 30 s. */
export function backoffDelay(n: number): number {
  return Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** Math.min(n, 16));
}

export function createTile(opts: TileOptions): Tile {
  const { video, cameraId, client } = opts;
  const doc = opts.doc ?? document;
  const now = opts.now ?? Date.now;
  let state: TileState = 'connecting';
  let canUnmute = false;
  let session: WhepSession | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let attempt = 0;
  let retryAt: number | null = null;
  // Bumped whenever the current attempt is superseded (hide, destroy, new attempt).
  let epoch = 0;
  let running = false;
  video.muted = true;

  const snapshot = (): TileSnapshot => ({ state, canUnmute, muted: video.muted, retryAt });
  const emit = () => opts.onChange(snapshot());
  const setState = (s: TileState) => {
    if (s === state) return;
    state = s;
    emit();
  };
  const onPlaying = () => {
    if (session === null) return;
    retryAt = null;
    setState('live');
  };
  video.addEventListener('playing', onPlaying);
  const visible = () => doc.visibilityState !== 'hidden';

  function clearTimer() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  }

  function schedule(next: TileState) {
    clearTimer();
    const mine = epoch;
    const delay = backoffDelay(attempt);
    retryAt = now() + delay;
    timer = setTimeout(() => {
      timer = null;
      retryAt = null;
      if (mine === epoch) void open();
    }, delay);
    attempt++;
    if (state === next) emit();
    else setState(next);
  }

  async function open() {
    if (!running || !visible() || state === 'offline') return;
    const mine = ++epoch;
    let s: WhepSession;
    try {
      s = await startWhep(video, cameraId, client);
    } catch (e) {
      if (mine !== epoch) return;
      const err = e as { name?: string; status?: number };
      if (err.name === 'ErrNoKey' || err.status === 401) {
        retryAt = null;
        setState('locked');
        return;
      }
      schedule(err.name === 'LiveBusy' || err.status === 503 ? 'limit' : 'reconnecting');
      return;
    }
    if (mine !== epoch) {
      void s.close();
      return;
    }
    session = s;
    s.onaudio = () => {
      if (session !== s) return;
      canUnmute = true;
      emit();
    };
    s.onstate = (st) => {
      if (session !== s) return;
      if (st === 'connected') {
        attempt = 0;
      } else if (st === 'lost') {
        session = null;
        void s.close();
        schedule('reconnecting');
      }
    };
    if (s.hasAudio) canUnmute = true;
    if (s.state === 'connected') {
      attempt = 0;
    } else if (s.state === 'lost') {
      s.onstate('lost');
    }
    emit();
  }

  function teardown() {
    epoch++;
    clearTimer();
    retryAt = null;
    const s = session;
    session = null;
    canUnmute = false;
    if (s) void s.close();
  }

  const onVisibility = () => {
    if (!running) return;
    if (state === 'offline' || state === 'locked') return;
    if (!visible()) {
      teardown();
      attempt = 0;
      setState('connecting');
      emit();
    } else if (session === null && timer === null) {
      void open();
    }
  };

  return {
    start() {
      if (running) return;
      running = true;
      doc.addEventListener('visibilitychange', onVisibility);
      void open();
    },
    destroy() {
      running = false;
      doc.removeEventListener('visibilitychange', onVisibility);
      video.removeEventListener('playing', onPlaying);
      teardown();
    },
    toggleMute() {
      if (!canUnmute) return;
      video.muted = !video.muted;
      if (!video.muted) void video.play?.()?.catch?.(() => {});
      emit();
    },
    mute() {
      video.muted = true;
      emit();
    },
    tryNow() {
      if (!running || state === 'live' || state === 'offline') return;
      teardown();
      attempt = 0;
      if (state === 'locked') setState('connecting');
      else emit();
      void open();
    },
    setOffline(down) {
      if (!running) return;
      if (down) {
        teardown();
        attempt = 0;
        setState('offline');
        emit();
      } else if (state === 'offline') {
        setState('connecting');
        void open();
      }
    },
    snapshot,
  };
}
