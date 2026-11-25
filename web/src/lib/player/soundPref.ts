/** The viewer's sound choice for this page session. Module memory only: nothing is stored. */
let on = false;

export const loadSoundPref = (): boolean => on;

export function saveSoundPref(v: boolean): void {
  on = v;
}
