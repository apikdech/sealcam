// What the Watch screen draws from: the cameras, one day's clips and coverage, how loading
// them went, and the views drawn from them. Call it while a component initialises.
import { onMount } from 'svelte';
import type { Request } from '../../worker/protocol';
import type { Camera, Sidecar } from '../../worker/schemas';
import type { Coverage } from '../timeline/model';
import { loadDay, toEventRow, toTimelineClip } from './data';

type Caller = { call<T = unknown>(msg: Request): Promise<T> };
export type LoadError = '' | 'key' | 'failed';

export interface DayQueryInput {
  /** YYYY-MM-DD in `zone`. */
  day: string;
  zone: string;
  camera?: string;
  triggers?: readonly string[];
}

const noKey = (e: unknown): boolean => e instanceof Error && e.name === 'ErrNoKey';

export function createDayData(client: Caller, query: () => DayQueryInput) {
  let cameras = $state<Camera[] | null>(null);
  let clips = $state<Sidecar[]>([]);
  let coverage = $state<Coverage[]>([]);
  let invalid = $state(0);
  // A failed cameras request leaves nothing to show; a failed day only replaces the day section.
  let error = $state<LoadError>('');
  let dayError = $state<LoadError>('');
  /** The query `clips` and `coverage` belong to; the views wait for it to match the current one. */
  let loadedKey = $state('');
  let attempt = $state(0);

  const keyOf = (q: DayQueryInput) => JSON.stringify([q.day, q.zone, q.camera ?? '', [...(q.triggers ?? [])].sort()]);
  const ready = $derived(loadedKey === keyOf(query()));

  // Cameras load again on every retry.
  $effect(() => {
    void attempt;
    let alive = true;
    client
      .call<Camera[]>({ type: 'api.get', path: '/api/v1/cameras', query: {} })
      .then((c) => {
        if (alive) cameras = c;
      })
      .catch((e: unknown) => {
        if (alive) error = noKey(e) ? 'key' : 'failed';
      });
    return () => {
      alive = false;
    };
  });

  let loadGen = 0;
  $effect(() => {
    if (cameras === null) return;
    void attempt;
    const q = query();
    const gen = ++loadGen;
    dayError = '';
    loadDay(client, { day: q.day, zone: q.zone, camera: q.camera ?? '', triggers: q.triggers ?? [], cameras: cameras.map((c) => c.id) })
      .then((d) => {
        if (gen !== loadGen) return;
        clips = d.clips;
        coverage = d.coverage;
        invalid = d.invalid;
        loadedKey = keyOf(q);
      })
      .catch((e: unknown) => {
        if (gen === loadGen) dayError = noKey(e) ? 'key' : 'failed';
      });
  });

  const timelineClips = $derived(clips.map(toTimelineClip).sort((a, b) => a.startMs - b.startMs));
  const rows = $derived([...clips].sort((a, b) => Date.parse(b.start_time) - Date.parse(a.start_time)).map(toEventRow));
  const nameOf = $derived((id: string) => cameras?.find((c) => c.id === id)?.name ?? id);

  return {
    get cameras() {
      return cameras;
    },
    get coverage() {
      return coverage;
    },
    get invalid() {
      return invalid;
    },
    get error() {
      return error;
    },
    get dayError() {
      return dayError;
    },
    get ready() {
      return ready;
    },
    get timelineClips() {
      return timelineClips;
    },
    get rows() {
      return rows;
    },
    get nameOf() {
      return nameOf;
    },
    retry(): void {
      error = '';
      dayError = '';
      attempt++;
    },
  };
}

/** The wall clock (refreshed every 30 s) and whether the viewport is a phone. */
export function createViewEnv() {
  let wall = $state(Date.now());
  let phone = $state(false);
  onMount(() => {
    const clock = setInterval(() => (wall = Date.now()), 30_000);
    const mq = window.matchMedia?.('(max-width: 767px)');
    const sync = () => (phone = mq?.matches ?? false);
    sync();
    mq?.addEventListener?.('change', sync);
    return () => {
      clearInterval(clock);
      mq?.removeEventListener?.('change', sync);
    };
  });
  return {
    get wall() {
      return wall;
    },
    get phone() {
      return phone;
    },
  };
}
