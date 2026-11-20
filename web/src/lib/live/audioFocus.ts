// Only one live tile plays sound at a time: the newest claimant mutes the previous one.
let current: { id: string; mute: () => void } | null = null;

/** Claim the audio focus; returns a function that releases it. */
export function claimAudio(id: string, mute: () => void): () => void {
  const prev = current;
  const mine = { id, mute };
  current = mine;
  if (prev) prev.mute();
  return () => {
    if (current === mine) current = null;
  };
}
