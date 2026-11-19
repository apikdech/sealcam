// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fullscreenMode, toggleFullscreen, watchFullscreen } from './fullscreen';

class FakeDoc extends EventTarget {
  fullscreenEnabled = true;
  fullscreenElement: Element | null = null;
  exitFullscreen = vi.fn(async () => {});
  change(el: Element | null) {
    this.fullscreenElement = el;
    this.dispatchEvent(new Event('fullscreenchange'));
  }
}

type WebkitVideo = HTMLVideoElement & {
  webkitEnterFullscreen?: () => void;
  webkitExitFullscreen?: () => void;
  webkitDisplayingFullscreen?: boolean;
};

let doc: FakeDoc;
let el: HTMLElement;
let video: WebkitVideo;
let request: ReturnType<typeof vi.fn>;

const asDoc = () => doc as unknown as Document;
const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

beforeEach(() => {
  doc = new FakeDoc();
  el = document.createElement('div');
  request = vi.fn(async () => {});
  el.requestFullscreen = request as unknown as HTMLElement['requestFullscreen'];
  video = document.createElement('video') as WebkitVideo;
});

function iphoneVideo() {
  doc.fullscreenEnabled = false;
  video.webkitEnterFullscreen = vi.fn();
  video.webkitExitFullscreen = vi.fn();
  video.webkitDisplayingFullscreen = false;
}

describe('fullscreenMode', () => {
  it('is element when the document allows element fullscreen', () => {
    expect(fullscreenMode(video, asDoc())).toBe('element');
  });

  it('is video when only the video has webkitEnterFullscreen (iPhone)', () => {
    iphoneVideo();
    expect(fullscreenMode(video, asDoc())).toBe('video');
  });

  it('is none when neither API exists', () => {
    doc.fullscreenEnabled = false;
    expect(fullscreenMode(video, asDoc())).toBe('none');
  });
});

describe('toggleFullscreen', () => {
  it('requests fullscreen on the tile, then exits when the tile is fullscreen', () => {
    toggleFullscreen(el, video, asDoc());
    expect(request).toHaveBeenCalledTimes(1);
    doc.fullscreenElement = el;
    toggleFullscreen(el, video, asDoc());
    expect(doc.exitFullscreen).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('requests fullscreen when another element is fullscreen', () => {
    doc.fullscreenElement = document.createElement('div');
    toggleFullscreen(el, video, asDoc());
    expect(request).toHaveBeenCalledTimes(1);
    expect(doc.exitFullscreen).not.toHaveBeenCalled();
  });

  it('handles a refused requestFullscreen', async () => {
    const refused = Promise.reject(new TypeError('not allowed'));
    // .catch(fn) is then(undefined, fn), so this sees either spelling.
    const then = vi.spyOn(refused, 'then');
    // A plain function: vi.fn() would attach its own then() to track results.
    el.requestFullscreen = () => refused;
    toggleFullscreen(el, video, asDoc());
    await flush();
    expect(then.mock.calls.some(([, onRejected]) => typeof onRejected === 'function')).toBe(true);
  });

  it('uses the native video player on iPhone', () => {
    iphoneVideo();
    toggleFullscreen(el, video, asDoc());
    expect(video.webkitEnterFullscreen).toHaveBeenCalledTimes(1);
    video.webkitDisplayingFullscreen = true;
    toggleFullscreen(el, video, asDoc());
    expect(video.webkitExitFullscreen).toHaveBeenCalledTimes(1);
    expect(request).not.toHaveBeenCalled();
  });

  it('does nothing when no fullscreen API exists', () => {
    doc.fullscreenEnabled = false;
    expect(() => toggleFullscreen(el, video, asDoc())).not.toThrow();
    expect(request).not.toHaveBeenCalled();
  });
});

describe('watchFullscreen', () => {
  it('reports the tile entering and leaving fullscreen (button, Esc or gesture)', () => {
    const cb = vi.fn();
    watchFullscreen(el, video, cb, asDoc());
    doc.change(el);
    doc.change(null);
    expect(cb.mock.calls).toEqual([[true], [false]]);
  });

  it('reports false when another element is fullscreen', () => {
    const cb = vi.fn();
    watchFullscreen(el, video, cb, asDoc());
    doc.change(document.createElement('div'));
    expect(cb.mock.calls).toEqual([[false]]);
  });

  it('reports the iPhone native player opening and closing', () => {
    iphoneVideo();
    const cb = vi.fn();
    watchFullscreen(el, video, cb, asDoc());
    video.webkitDisplayingFullscreen = true;
    video.dispatchEvent(new Event('webkitbeginfullscreen'));
    video.webkitDisplayingFullscreen = false;
    video.dispatchEvent(new Event('webkitendfullscreen'));
    expect(cb.mock.calls).toEqual([[true], [false]]);
  });

  it('stops reporting after unsubscribe', () => {
    const cb = vi.fn();
    const stop = watchFullscreen(el, video, cb, asDoc());
    stop();
    doc.change(el);
    video.dispatchEvent(new Event('webkitendfullscreen'));
    expect(cb).not.toHaveBeenCalled();
  });
});
