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
    // A neutral mark: it claims nothing was checked.
    expect(frame.querySelector('[data-seal-state]')).toHaveAttribute('data-seal-state', 'unchecked');
    expect(frame.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
  });

  it('goes dark over video only while a clip is loaded', async () => {
    render(Player, props());
    const video = screen.getByTestId('player');
    await waitFor(() => expect(video.parentElement).toHaveClass('bg-black'));
    expect(video).toHaveClass('bg-black');
    expect(within(video.parentElement!).queryByText('Select a recording')).toBeNull();
  });

  it('fills its parent: no width cap, a stage above one bar with the integrity text and Export', () => {
    render(Player, props());
    const column = screen.getByTestId('player-column');
    expect(column.className).toContain('h-full');
    expect(column.className).toContain('flex-col');
    expect(column.className).not.toContain('calc(56vh');
    expect(screen.getByTestId('player').parentElement!.className).toContain('flex-1');
    const bar = screen.getByRole('group', { name: 'Player controls' });
    expect(bar).toContainElement(screen.getByRole('button', { name: 'Export' }));
    expect(bar).toContainElement(screen.getByTestId('integrity'));
    expect(bar).toContainElement(screen.getByRole('slider', { name: 'Position' }));
    expect(bar).toContainElement(screen.getByText('Autoplay next'));
  });

  it('the integrity banner seal is decorative: the alert already says it in words', async () => {
    FakePlayer.nextIntegrity = 'tampered';
    render(Player, props());
    const alert = await screen.findByRole('alert');
    expect(within(alert).queryByRole('img')).toBeNull();
    expect(alert.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  describe('clip controls', () => {
    const stub = (v: HTMLElement, key: string, value: unknown) => Object.defineProperty(v, key, { value, configurable: true });

    it('has an accessible Position range that shows the clip time and seeks on input', async () => {
      render(Player, props());
      const v = screen.getByTestId('player') as HTMLVideoElement;
      const range = (await screen.findByRole('slider', { name: 'Position' })) as HTMLInputElement;
      expect(range).toBeDisabled();
      stub(v, 'duration', 120);
      stub(v, 'currentTime', 12);
      await fireEvent(v, new Event('loadedmetadata'));
      expect(range).toBeEnabled();
      expect(range.max).toBe('120');
      expect(range.value).toBe('12');
      await fireEvent.input(range, { target: { value: '30' } });
      expect(FakePlayer.instances[0]!.seeks).toContain(30_000);
      stub(v, 'currentTime', 31);
      await fireEvent(v, new Event('timeupdate'));
      expect(range.value).toBe('31');
    });

    it('has no sound control: clips are video-only', async () => {
      render(Player, props());
      const v = screen.getByTestId('player') as HTMLVideoElement;
      await screen.findByRole('slider', { name: 'Position' });
      stub(v, 'webkitAudioDecodedByteCount', 100);
      await fireEvent(v, new Event('timeupdate'));
      expect(screen.queryByRole('button', { name: /sound/i })).toBeNull();
    });

    it('gives the phone 44 px targets: a tall Position hit area, the Autoplay label and the Open Keys link', async () => {
      FakePlayer.nextIntegrity = 'unknown-key';
      render(Player, props());
      const range = await screen.findByRole('slider', { name: 'Position' });
      expect(range.className).toContain('max-md:h-11');
      expect(screen.getByText('Autoplay next').closest('label')!.className).toContain('max-md:min-h-11');
      const link = await screen.findByRole('link', { name: /key/i });
      expect(link.className).toMatch(/max-md:min-h-11/);
    });

    it('has Full screen only where the browser supports it, and requests it on the frame', async () => {
      const spy = vi.fn(() => Promise.resolve());
      const descriptor = Object.getOwnPropertyDescriptor(document, 'fullscreenEnabled');
      Object.defineProperty(document, 'fullscreenEnabled', { value: false, configurable: true });
      const { unmount } = render(Player, props());
      await screen.findByRole('slider', { name: 'Position' });
      expect(screen.queryByRole('button', { name: 'Full screen' })).toBeNull();
      unmount();
      Object.defineProperty(document, 'fullscreenEnabled', { value: true, configurable: true });
      try {
        render(Player, props());
        screen.getByTestId('player-column').requestFullscreen = spy;
        await fireEvent.click(await screen.findByRole('button', { name: 'Full screen' }));
        expect(spy).toHaveBeenCalled();
      } finally {
        if (descriptor) Object.defineProperty(document, 'fullscreenEnabled', descriptor);
        else delete (document as unknown as Record<string, unknown>).fullscreenEnabled;
      }
    });
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

  it('Back to live sits on the stage and calls onLive', async () => {
    const onLive = vi.fn();
    render(Player, props({ onLive }));
    const btn = screen.getByRole('button', { name: 'Back to live' });
    expect(screen.getByTestId('player').parentElement).toContainElement(btn);
    await fireEvent.click(btn);
    expect(onLive).toHaveBeenCalledOnce();
  });

  it('has no Back to live button without onLive', () => {
    render(Player, props());
    expect(screen.queryByRole('button', { name: 'Back to live' })).toBeNull();
  });

  describe('wall clock and layouts', () => {
    // 11:17:12 in Asia/Jakarta.
    const start = Date.UTC(2026, 10, 23, 4, 17, 12);
    const emit = (clipId: string, startUnixMs: number) =>
      FakePlayer.instances[0]!.emit({ ...initialState(), clipId, integrity: 'verified', header: { cameraId: 'front-door', startUnixMs } });
    const mount = async (over: Record<string, unknown> = {}) => {
      const r = render(Player, props({ cue: null, ...over }));
      await waitFor(() => expect(FakePlayer.instances).toHaveLength(1));
      emit(ids.a, start);
      return r;
    };
    const stubTime = (v: HTMLElement, duration: number, currentTime: number) => {
      Object.defineProperty(v, 'duration', { value: duration, configurable: true });
      Object.defineProperty(v, 'currentTime', { value: currentTime, configurable: true });
    };

    it('shows the wall time of the current frame and the clip position', async () => {
      await mount({ cameraName: () => 'Front door' });
      const v = screen.getByTestId('player');
      stubTime(v, 27, 12);
      await fireEvent(v, new Event('loadedmetadata'));
      const clock = await screen.findByTestId('clock');
      expect(clock).toHaveTextContent('11:17:24');
      expect(clock).toHaveTextContent('0:12 / 0:27');
      expect(screen.getByTestId('badge')).toHaveTextContent('Recording · Front door 11:17:12');
    });

    it('the badge shows the glyph chips of the playing clip after the time', async () => {
      await mount({ triggersOf: (id: string) => (id === ids.a ? ['person', 'vehicle'] : []) });
      const badge = screen.getByTestId('badge');
      const chips = within(badge).getAllByRole('img');
      expect(chips.map((c) => c.getAttribute('aria-label'))).toEqual(['Person', 'Vehicle']);
      expect(chips.map((c) => c.textContent)).toEqual(['P', 'V']);
      expect(badge.textContent!.indexOf('11:17:12')).toBeLessThan(badge.textContent!.indexOf('P'));
    });

    it('the badge has no chips without triggersOf', async () => {
      await mount();
      expect(within(screen.getByTestId('badge')).queryAllByRole('img')).toHaveLength(0);
    });

    it('updates the badge and the clock when auto-advance opens another clip', async () => {
      await mount();
      const v = screen.getByTestId('player');
      stubTime(v, 27, 0);
      await fireEvent(v, new Event('loadedmetadata'));
      expect(screen.getByTestId('clock')).toHaveTextContent('11:17:12');
      emit(ids.b, start + 60_000);
      stubTime(v, 30, 0);
      await fireEvent(v, new Event('durationchange'));
      expect(screen.getByTestId('clock')).toHaveTextContent('11:18:12');
      expect(screen.getByTestId('clock')).toHaveTextContent('0:00 / 0:30');
      expect(screen.getByTestId('badge')).toHaveTextContent('11:18:12');
    });

    it('compact: Back 10 seconds, Forward 10 seconds, Autoplay and Export live in the More menu', async () => {
      await mount({ compact: true });
      const bar = screen.getByRole('group', { name: 'Player controls' });
      for (const name of ['Previous clip', 'Play', 'Next clip']) expect(within(bar).getByRole('button', { name })).toBeInTheDocument();
      expect(within(bar).getByRole('slider', { name: 'Position' })).toBeInTheDocument();
      expect(within(bar).queryByRole('button', { name: 'Back 10 seconds' })).toBeNull();
      expect(within(bar).queryByRole('button', { name: 'Export' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Back 10 seconds' })).toBeNull();
      await fireEvent.click(screen.getByRole('button', { name: 'More' }));
      const menu = screen.getByRole('group', { name: 'More controls' });
      for (const name of ['Back 10 seconds', 'Forward 10 seconds', 'Export']) expect(within(menu).getByRole('button', { name })).toBeInTheDocument();
      expect(within(menu).getByText('Autoplay next')).toBeInTheDocument();
      expect(screen.getByTestId('integrity')).toHaveTextContent('Encrypted recording verified');
    });

    it('compact: the bar stays on one line and the slider can shrink (jsdom has no layout, so the classes are pinned)', async () => {
      await mount({ compact: true });
      const bar = screen.getByRole('group', { name: 'Player controls' });
      expect(bar).toHaveClass('flex-nowrap');
      expect(bar).not.toHaveClass('flex-wrap');
      expect(within(bar).getByRole('slider', { name: 'Position' })).toHaveClass('min-w-0');
    });

    it('has Full screen in both layouts and no sound button', async () => {
      const descriptor = Object.getOwnPropertyDescriptor(document, 'fullscreenEnabled');
      Object.defineProperty(document, 'fullscreenEnabled', { value: true, configurable: true });
      try {
        for (const compact of [false, true]) {
          const { unmount } = await mount({ compact });
          expect(screen.getByRole('button', { name: 'Full screen' })).toBeInTheDocument();
          expect(screen.queryByRole('button', { name: /sound|mute/i })).toBeNull();
          unmount();
          FakePlayer.instances = [];
        }
      } finally {
        if (descriptor) Object.defineProperty(document, 'fullscreenEnabled', descriptor);
        else delete (document as unknown as Record<string, unknown>).fullscreenEnabled;
      }
    });

    it('still says "Encrypted recording verified" for a verified clip', async () => {
      await mount();
      expect(screen.getByTestId('integrity')).toHaveTextContent('Encrypted recording verified');
    });

    describe('length while the clip streams', () => {
      it('uses the recorded length while the browser does not know the duration', async () => {
        await mount({ durationOf: (id: string) => (id === ids.a ? 28_000 : null) });
        const v = screen.getByTestId('player');
        stubTime(v, NaN, 2);
        await fireEvent(v, new Event('timeupdate'));
        expect(screen.getByTestId('clock')).toHaveTextContent('0:02 / 0:28');
        const range = screen.getByRole('slider', { name: 'Position' }) as HTMLInputElement;
        expect(range).toBeEnabled();
        expect(range.max).toBe('28');
      });

      it('an incomplete clip with no recorded length keeps 0:00 and a disabled slider', async () => {
        await mount({ durationOf: () => null });
        const v = screen.getByTestId('player');
        stubTime(v, NaN, 2);
        await fireEvent(v, new Event('timeupdate'));
        expect(screen.getByTestId('clock')).toHaveTextContent('0:02 / 0:00');
        expect(screen.getByRole('slider', { name: 'Position' })).toBeDisabled();
      });

      it('the browser duration wins once it is known', async () => {
        await mount({ durationOf: () => 28_000 });
        const v = screen.getByTestId('player');
        stubTime(v, 27.4, 2);
        await fireEvent(v, new Event('durationchange'));
        expect(screen.getByTestId('clock')).toHaveTextContent('0:02 / 0:27');
      });
    });

    describe('playback speed', () => {
      it('a Playback speed button shows 1× and its menu sets the rate and marks the choice', async () => {
        await mount();
        const v = screen.getByTestId('player') as HTMLVideoElement;
        const bar = screen.getByRole('group', { name: 'Player controls' });
        const btn = within(bar).getByRole('button', { name: 'Playback speed' });
        expect(btn).toHaveTextContent('1×');
        await fireEvent.click(btn);
        const menu = screen.getByRole('group', { name: 'Speeds' });
        const items = within(menu).getAllByRole('button');
        expect(items.map((b) => b.textContent?.trim())).toEqual(['0.25×', '0.5×', '1×', '1.5×', '2×', '4×']);
        expect(within(menu).getByRole('button', { name: '1×' })).toHaveAttribute('aria-pressed', 'true');
        await fireEvent.click(within(menu).getByRole('button', { name: '2×' }));
        expect(v.playbackRate).toBe(2);
        expect(btn).toHaveTextContent('2×');
        expect(screen.queryByRole('group', { name: 'Speeds' })).toBeNull();
        await fireEvent.click(btn);
        expect(within(screen.getByRole('group', { name: 'Speeds' })).getByRole('button', { name: '2×' })).toHaveAttribute('aria-pressed', 'true');
        expect(within(screen.getByRole('group', { name: 'Speeds' })).getByRole('button', { name: '1×' })).toHaveAttribute('aria-pressed', 'false');
      });

      it('the menu closes on Escape and on a click outside', async () => {
        await mount();
        const btn = screen.getByRole('button', { name: 'Playback speed' });
        await fireEvent.click(btn);
        await fireEvent.keyDown(screen.getByRole('group', { name: 'Speeds' }), { key: 'Escape' });
        expect(screen.queryByRole('group', { name: 'Speeds' })).toBeNull();
        await fireEvent.click(btn);
        await fireEvent.click(document.body);
        expect(screen.queryByRole('group', { name: 'Speeds' })).toBeNull();
      });

      it('the speed stays when the player moves to another clip', async () => {
        await mount();
        const v = screen.getByTestId('player') as HTMLVideoElement;
        await fireEvent.click(screen.getByRole('button', { name: 'Playback speed' }));
        await fireEvent.click(screen.getByRole('button', { name: '2×' }));
        emit(ids.b, start + 60_000);
        v.playbackRate = 1;
        await fireEvent(v, new Event('loadedmetadata'));
        expect(v.playbackRate).toBe(2);
      });

      it('compact: the speeds are in the More menu, not in the bar', async () => {
        await mount({ compact: true });
        const v = screen.getByTestId('player') as HTMLVideoElement;
        const bar = screen.getByRole('group', { name: 'Player controls' });
        expect(within(bar).queryByRole('button', { name: 'Playback speed' })).toBeNull();
        await fireEvent.click(screen.getByRole('button', { name: 'More' }));
        const menu = screen.getByRole('group', { name: 'More controls' });
        const speeds = within(menu).getByRole('group', { name: 'Playback speed' });
        expect(within(speeds).getByRole('button', { name: '1×' })).toHaveAttribute('aria-pressed', 'true');
        await fireEvent.click(within(speeds).getByRole('button', { name: '0.5×' }));
        expect(v.playbackRate).toBe(0.5);
        expect(within(speeds).getByRole('button', { name: '0.5×' })).toHaveAttribute('aria-pressed', 'true');
      });
    });
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
