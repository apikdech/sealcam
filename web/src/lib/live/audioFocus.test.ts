import { describe, expect, it, vi } from 'vitest';
import { claimAudio } from './audioFocus';

describe('audioFocus', () => {
  it('claim mutes the previous claimant', () => {
    const muteA = vi.fn();
    const muteB = vi.fn();
    claimAudio('a', muteA);
    claimAudio('b', muteB);
    expect(muteA).toHaveBeenCalledTimes(1);
    expect(muteB).not.toHaveBeenCalled();
  });

  it('release clears focus', () => {
    const muteA = vi.fn();
    const release = claimAudio('a', muteA);
    release();
    claimAudio('b', vi.fn());
    expect(muteA).not.toHaveBeenCalled();
  });

  it('a stale release does not clear a newer claim', () => {
    const muteB = vi.fn();
    const releaseA = claimAudio('a', vi.fn());
    claimAudio('b', muteB);
    releaseA();
    claimAudio('c', vi.fn());
    expect(muteB).toHaveBeenCalledTimes(1);
  });
});
