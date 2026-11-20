// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakePlayer, fakePlayerFactory, ids } from '../../../test-support/dashboard-fakes';
import type { PlayerState } from '../player/engine';
import { initialState } from '../player/status';
import ExportDialog from './ExportDialog.svelte';
import Player from './Player.svelte';

beforeEach(() => {
  FakePlayer.instances = [];
  FakePlayer.nextIntegrity = 'verified';
  HTMLMediaElement.prototype.play = () => Promise.resolve();
  HTMLMediaElement.prototype.pause = () => {};
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('ExportDialog', () => {
  it('shows Saved after a save', () => {
    render(ExportDialog, { filename: 'a.mp4', busy: false, saved: true, bytes: 0, error: '', onConfirm: () => {}, onCancel: () => {} });
    expect(screen.getByRole('status')).toHaveTextContent('Saved.');
  });
  it('states that the copy is unencrypted, with the word emphasised', () => {
    render(ExportDialog, { filename: 'a.mp4', busy: false, bytes: 0, error: '', onConfirm: () => {}, onCancel: () => {} });
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('This saves an unencrypted copy on this device.');
    expect(dialog.querySelector('strong')?.textContent).toBe('unencrypted');
    expect(dialog).toHaveTextContent('a.mp4');
  });
  it('confirms and cancels', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(ExportDialog, { filename: 'a.mp4', busy: false, bytes: 0, error: '', onConfirm, onCancel });
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onCancel).toHaveBeenCalledOnce();
  });
  it('cancels on Escape', async () => {
    const onCancel = vi.fn();
    render(ExportDialog, { filename: 'a.mp4', busy: false, bytes: 0, error: '', onConfirm: () => {}, onCancel });
    await fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledOnce();
  });
  it('disables Save while busy and shows the error', () => {
    render(ExportDialog, { filename: 'a.mp4', busy: true, bytes: 1_500_000, error: 'boom', onConfirm: () => {}, onCancel: () => {} });
    expect(screen.getByRole('button', { name: /sav/i })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('boom');
    expect(screen.getByRole('dialog')).toHaveTextContent('1.4 MiB');
  });

  describe('focus trap', () => {
    const open = (over: Record<string, unknown> = {}) => {
      render(ExportDialog, { filename: 'a.mp4', busy: false, bytes: 0, error: '', onConfirm: () => {}, onCancel: () => {}, ...over });
      return {
        dialog: screen.getByRole('dialog'),
        cancel: screen.getByRole('button', { name: 'Cancel' }),
        save: screen.getByRole('button', { name: /sav/i }),
      };
    };

    it('takes focus when it opens', () => {
      const { dialog } = open();
      expect(document.activeElement).toBe(dialog);
    });

    it('Tab from the last button wraps to the first', async () => {
      const { save, cancel } = open();
      save.focus();
      const ev = await fireEvent.keyDown(save, { key: 'Tab' });
      expect(document.activeElement).toBe(cancel);
      expect(ev).toBe(false); // default prevented: the browser must not move focus out
    });

    it('Shift+Tab from the first button wraps to the last', async () => {
      const { save, cancel } = open();
      cancel.focus();
      await fireEvent.keyDown(cancel, { key: 'Tab', shiftKey: true });
      expect(document.activeElement).toBe(save);
    });

    it('Shift+Tab from the dialog itself goes to the last button, Tab to the first', async () => {
      const { dialog, save, cancel } = open();
      await fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
      expect(document.activeElement).toBe(save);
      dialog.focus();
      await fireEvent.keyDown(dialog, { key: 'Tab' });
      expect(document.activeElement).toBe(cancel);
    });

    it('lets Tab move normally between the buttons inside the dialog', async () => {
      const { cancel } = open();
      cancel.focus();
      const notPrevented = await fireEvent.keyDown(cancel, { key: 'Tab' });
      expect(notPrevented).toBe(true);
    });

    it('keeps focus on the dialog while both buttons are disabled', async () => {
      const { dialog, cancel } = open({ busy: true });
      expect(cancel).toBeDisabled();
      const ev = await fireEvent.keyDown(dialog, { key: 'Tab' });
      expect(ev).toBe(false);
      expect(document.activeElement).toBe(dialog);
    });
  });
});

describe('Player', () => {
  const props = (over: Record<string, unknown> = {}) => ({
    client: { call: async () => ({}) } as never,
    cue: { clipId: ids.a, offsetMs: 0, n: 1 },
    factory: fakePlayerFactory,
    zone: 'Asia/Jakarta',
    profile: 'desktop' as const,
    ...over,
  });

  it('loads the target clip', async () => {
    render(Player, props());
    await waitFor(() => expect(FakePlayer.instances[0]?.loads).toEqual([ids.a]));
  });

  it('marks its video as clip playback so the update prompt can tell it from live tiles', () => {
    render(Player, props());
    expect(screen.getByTestId('player')).toHaveAttribute('data-clip-player');
  });

  it('has no native controls: the custom transport covers them', () => {
    render(Player, props());
    expect(screen.getByTestId('player')).not.toHaveAttribute('controls');
  });

  it('shows the empty state on the plate, not a black slab, until a clip is loaded', async () => {
    render(Player, props({ cue: null }));
    const video = screen.getByTestId('player');
    const frame = video.parentElement!;
    expect(frame).toHaveClass('bg-plate');
    expect(frame).not.toHaveClass('bg-black');
    expect(video).not.toHaveClass('bg-black');
    expect(within(frame).getByText('Select a recording')).toBeInTheDocument();
    expect(frame.querySelector('[data-seal-state]')).not.toBeNull();
    expect(frame.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
  });

  it('goes dark over video only while a clip is loaded', async () => {
    render(Player, props());
    const video = screen.getByTestId('player');
    await waitFor(() => expect(video.parentElement).toHaveClass('bg-black'));
    expect(video).toHaveClass('bg-black');
    expect(within(video.parentElement!).queryByText('Select a recording')).toBeNull();
  });

  it('caps its height on desktop, keeping 16:9 by width', () => {
    render(Player, props());
    expect(screen.getByTestId('player').parentElement!.className).toContain('md:w-[min(100%,calc(56vh*16/9))]');
  });

  it('seeks to the offset after loading', async () => {
    render(Player, props({ cue: { clipId: ids.a, offsetMs: 12_000, n: 1 } }));
    await waitFor(() => expect(FakePlayer.instances[0]?.seeks).toEqual([12_000]));
  });

  it('seeks within the loaded clip instead of reloading it', async () => {
    const { rerender } = render(Player, props());
    await waitFor(() => expect(FakePlayer.instances[0]?.loads).toHaveLength(1));
    await rerender(props({ cue: { clipId: ids.a, offsetMs: 30_000, n: 2 } }));
    await waitFor(() => expect(FakePlayer.instances[0]?.seeks).toEqual([30_000]));
    expect(FakePlayer.instances[0]?.loads).toHaveLength(1);
  });

  it('enables export for a verified clip', async () => {
    render(Player, props());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Export' })).toBeEnabled());
  });

  it('disables export for a tampered clip', async () => {
    FakePlayer.nextIntegrity = 'tampered';
    render(Player, props());
    await waitFor(() => expect(FakePlayer.instances[0]?.loads).toHaveLength(1));
    const btn = screen.getByRole('button', { name: 'Export' });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('title', expect.stringMatching(/failed verification|cannot be exported/i));
  });

  it('keeps export disabled while verifying', () => {
    render(Player, props({ cue: null }));
    expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled();
  });

  it('shows the confirmation before exporting', async () => {
    render(Player, props());
    const btn = await screen.findByRole('button', { name: 'Export' });
    await waitFor(() => expect(btn).toBeEnabled());
    await fireEvent.click(btn);
    expect(screen.getByRole('dialog')).toHaveTextContent('This saves an unencrypted copy on this device.');
  });

  it('proposes the filename <camera>_<local time>.mp4 from the verified header', async () => {
    render(Player, props());
    const btn = await screen.findByRole('button', { name: 'Export' });
    await waitFor(() => expect(btn).toBeEnabled());
    await fireEvent.click(btn);
    // Header start 2026-11-06T14:59:05Z, zone Asia/Jakarta.
    expect(screen.getByRole('dialog')).toHaveTextContent('front-door_20261106-215905.mp4');
  });

  it('adds -incomplete for an incomplete clip', async () => {
    FakePlayer.nextIntegrity = 'incomplete';
    render(Player, props());
    const btn = await screen.findByRole('button', { name: 'Export' });
    await waitFor(() => expect(btn).toBeEnabled());
    await fireEvent.click(btn);
    expect(screen.getByRole('dialog')).toHaveTextContent('front-door_20261106-215905-incomplete.mp4');
  });

  it('shows the integrity text from the player state', async () => {
    render(Player, props());
    await waitFor(() => expect(FakePlayer.instances).toHaveLength(1));
    const s: PlayerState = { ...initialState(), clipId: ids.a, integrity: 'tampered', failedAtMs: 83_000 };
    FakePlayer.instances[0]!.emit(s);
    expect(await screen.findByRole('alert')).toHaveTextContent('failed verification at ~01:23');
  });

  it('exports through the confirmation, then restores the playing clip', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const written: number[] = [];
    const calls: string[] = [];
    const client = {
      call: async (m: { type: string; chunk?: number }) => {
        calls.push(m.type);
        if (m.type === 'clip.open') return { numChunks: 2, plaintextSizeBytes: 8 };
        if (m.type === 'clip.read') return { plaintext: new Uint8Array(4).fill((m.chunk ?? 0) + 1).buffer, final: m.chunk === 1 };
        return {};
      },
    };
    const env = {
      isIOS: false,
      showSaveFilePicker: async () => ({
        createWritable: async () => ({
          write: async (b: Uint8Array) => void written.push(b[0]!),
          close: async () => {},
          abort: async () => {},
        }),
      }),
      download: () => {},
    };
    render(Player, props({ client, env }));
    const btn = await screen.findByRole('button', { name: 'Export' });
    await waitFor(() => expect(btn).toBeEnabled());
    await fireEvent.click(btn);
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Saved.')).toHaveAttribute('role', 'status');
    vi.advanceTimersByTime(4000);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(written).toEqual([1, 2]);
    // The export replaced the worker's session for this clip, so the player opens it again.
    await waitFor(() => expect(FakePlayer.instances[0]!.loads).toEqual([ids.a, ids.a]));
  });

  it('shows the fixed error text when the export fails', async () => {
    const client = {
      call: async (m: { type: string }) => {
        if (m.type === 'clip.open') throw new Error('network down');
        return {};
      },
    };
    const env = { isIOS: false, download: () => {} };
    render(Player, props({ client, env }));
    const btn = await screen.findByRole('button', { name: 'Export' });
    await waitFor(() => expect(btn).toBeEnabled());
    await fireEvent.click(btn);
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog).toHaveTextContent('Could not save the file. Try again.'));
    expect(dialog).not.toHaveTextContent(/network down/);
  });

  it('says when the recording is too large for this browser', async () => {
    const client = {
      call: async (m: { type: string }) => (m.type === 'clip.open' ? { numChunks: 2, plaintextSizeBytes: 1e12 } : {}),
    };
    render(Player, props({ client, env: { isIOS: false, download: () => {} } }));
    const btn = await screen.findByRole('button', { name: 'Export' });
    await waitFor(() => expect(btn).toBeEnabled());
    await fireEvent.click(btn);
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This recording is too large to save in this browser.');
  });

  it('a cancelled Saved dialog does not close a dialog reopened within 4 s', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const client = {
      call: async (m: { type: string; chunk?: number }) => {
        if (m.type === 'clip.open') return { numChunks: 1, plaintextSizeBytes: 4 };
        if (m.type === 'clip.read') return { plaintext: new Uint8Array(4).buffer, final: true };
        return {};
      },
    };
    const env = {
      isIOS: false,
      showSaveFilePicker: async () => ({ createWritable: async () => ({ write: async () => {}, close: async () => {}, abort: async () => {} }) }),
      download: () => {},
    };
    render(Player, props({ client, env }));
    const btn = await screen.findByRole('button', { name: 'Export' });
    await waitFor(() => expect(btn).toBeEnabled());
    await fireEvent.click(btn);
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('Saved.');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(btn).toBeEnabled());
    await fireEvent.click(btn);
    vi.advanceTimersByTime(4500);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.queryByText('Saved.')).toBeNull();
  });

  it('shows a verifying seal under the video while verifying', async () => {
    render(Player, props());
    await waitFor(() => expect(FakePlayer.instances).toHaveLength(1));
    FakePlayer.instances[0]!.emit({ ...initialState(), clipId: ids.a, integrity: 'verifying' });
    const row = await screen.findByTestId('integrity');
    expect(row).toHaveTextContent('Verifying…');
    expect(row).not.toHaveTextContent('Not checked yet');
    expect(screen.getByRole('progressbar')).toHaveStyle('color: var(--z-ov-ink)');
  });

  it.each([
    ['tampered', {}, 'border-void'],
    ['mismatch', { header: { cameraId: 'x', startUnixMs: 0 } }, 'border-amber'],
    ['incomplete', {}, 'border-amber'],
    ['unknown-key', {}, 'border-muted'],
    ['verifying', { message: 'ErrNoKey' }, 'border-muted'],
  ] as const)('banner border for %s is %s', async (integrity, extra, cls) => {
    render(Player, props());
    await waitFor(() => expect(FakePlayer.instances).toHaveLength(1));
    FakePlayer.instances[0]!.emit({ ...initialState(), clipId: ids.a, integrity, ...extra } as PlayerState);
    const banner = await screen.findByRole(integrity === 'incomplete' ? 'status' : 'alert');
    expect(banner.className).toContain(cls);
    expect(banner.className).toContain('border ');
  });

  it('Back to live calls onBack', async () => {
    const onBack = vi.fn();
    render(Player, props({ onBack }));
    await fireEvent.click(screen.getByRole('button', { name: 'Back to live' }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('has no Back to live button without onBack', () => {
    render(Player, props());
    expect(screen.queryByRole('button', { name: 'Back to live' })).toBeNull();
  });

  it('play button label follows the state', async () => {
    render(Player, props());
    const v = screen.getByTestId('player') as HTMLVideoElement;
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
    await fireEvent.play(v);
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    await fireEvent.pause(v);
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
  });

  it('prev and next call their handlers', async () => {
    const onPrev = vi.fn();
    const onNext = vi.fn();
    render(Player, props({ onPrev, onNext }));
    await fireEvent.click(screen.getByRole('button', { name: 'Previous clip' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Next clip' }));
    expect(onPrev).toHaveBeenCalledOnce();
    expect(onNext).toHaveBeenCalledOnce();
  });

  it('names the camera in the mismatch banner and links unknown keys to Keys', async () => {
    render(Player, props({ cameraName: () => 'Front door' }));
    await waitFor(() => expect(FakePlayer.instances).toHaveLength(1));
    FakePlayer.instances[0]!.emit({
      ...initialState(),
      clipId: ids.a,
      integrity: 'mismatch',
      header: { cameraId: 'front-door', startUnixMs: Date.UTC(2026, 10, 6, 16, 44, 6) },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('Front door, started 23:44:06.');
    FakePlayer.instances[0]!.emit({ ...initialState(), clipId: ids.a, integrity: 'unknown-key', keyId: 'a1b2-c3d4-e5f6-0718' });
    const link = await screen.findByRole('link', { name: 'Open Keys' });
    expect(link).toHaveAttribute('href', '#/key');
  });

  describe('transport', () => {
    type Handle = { togglePlay(): void; skip(ms: number): void };
    /** A video whose paused flag and clock the test controls. */
    function stubVideo(paused: boolean, currentTimeSec = 0) {
      const v = screen.getByTestId('player') as HTMLVideoElement;
      let isPaused = paused;
      Object.defineProperty(v, 'paused', { get: () => isPaused, configurable: true });
      Object.defineProperty(v, 'currentTime', { get: () => currentTimeSec, configurable: true });
      const play = vi.fn(() => {
        isPaused = false;
        return Promise.resolve();
      });
      const pause = vi.fn(() => {
        isPaused = true;
      });
      v.play = play;
      v.pause = pause;
      return { v, play, pause };
    }
    const mount = async (over: Record<string, unknown> = {}) => {
      const r = render(Player, props({ cue: null, ...over }));
      await waitFor(() => expect(FakePlayer.instances).toHaveLength(1));
      return { ...r, handle: r.component as unknown as Handle, engine: FakePlayer.instances[0]! };
    };

    it('togglePlay plays a paused video', async () => {
      const { handle } = await mount();
      const { play, pause } = stubVideo(true);
      handle.togglePlay();
      expect(play).toHaveBeenCalledTimes(1);
      expect(pause).not.toHaveBeenCalled();
    });

    it('togglePlay pauses a playing video', async () => {
      const { handle } = await mount();
      const { play, pause } = stubVideo(false);
      handle.togglePlay();
      expect(pause).toHaveBeenCalledTimes(1);
      expect(play).not.toHaveBeenCalled();
    });

    it('togglePlay twice plays, then pauses', async () => {
      const { handle } = await mount();
      const { play, pause } = stubVideo(true);
      handle.togglePlay();
      handle.togglePlay();
      expect(play).toHaveBeenCalledTimes(1);
      expect(pause).toHaveBeenCalledTimes(1);
    });

    it('togglePlay shows no error when the browser refuses autoplay', async () => {
      const { handle } = await mount();
      const { v } = stubVideo(true);
      v.play = vi.fn(() => Promise.reject(new DOMException('blocked', 'NotAllowedError')));
      handle.togglePlay();
      await Promise.resolve();
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('skip(+10 s) seeks the engine 10 s past the playhead', async () => {
      const { handle, engine } = await mount();
      stubVideo(false, 42.5);
      handle.skip(10_000);
      expect(engine.seeks).toEqual([52_500]);
    });

    it('skip(-10 s) seeks 10 s before the playhead', async () => {
      const { handle, engine } = await mount();
      stubVideo(false, 42.5);
      handle.skip(-10_000);
      expect(engine.seeks).toEqual([32_500]);
    });

    it('skip never goes before the start', async () => {
      const { handle, engine } = await mount();
      stubVideo(false, 4);
      handle.skip(-10_000);
      expect(engine.seeks).toEqual([0]);
    });
  });

  it('destroys the engine on unmount', async () => {
    const { unmount } = render(Player, props());
    await waitFor(() => expect(FakePlayer.instances).toHaveLength(1));
    unmount();
    expect(FakePlayer.instances[0]!.destroyed).toBe(true);
  });
});
