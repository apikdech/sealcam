import type { KeyListResult } from '../../worker/protocol';

const LOCKED_REMEMBERED = 'Locked. Opening a recording unlocks it again on this device.';
const LOCKED_SESSION = 'Locked. Add the key again to watch.';

/** What to tell the viewer after a lock: a kept key unlocks itself again, a session-only key must be added again. */
export const lockedNotice = (result: KeyListResult): string =>
  result.keys.some((k) => k.remembered) ? LOCKED_REMEMBERED : LOCKED_SESSION;
