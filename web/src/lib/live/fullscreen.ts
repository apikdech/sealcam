// Fullscreen for a live tile: the whole tile where the browser allows element
// fullscreen, else the video's native player (iPhone Safari has only that).

export type FullscreenMode = 'element' | 'video' | 'none';

type FsDoc = Pick<
  Document,
  'fullscreenEnabled' | 'fullscreenElement' | 'exitFullscreen' | 'addEventListener' | 'removeEventListener'
>;

// WebKit-only members of HTMLVideoElement, absent from lib.dom.
type WebkitVideo = HTMLVideoElement & {
  webkitEnterFullscreen?: () => void;
  webkitExitFullscreen?: () => void;
  webkitDisplayingFullscreen?: boolean;
};

export function fullscreenMode(video: HTMLVideoElement, doc: FsDoc = document): FullscreenMode {
  if (doc.fullscreenEnabled) return 'element';
  if (typeof (video as WebkitVideo).webkitEnterFullscreen === 'function') return 'video';
  return 'none';
}

export function isFullscreen(el: HTMLElement, video: HTMLVideoElement, doc: FsDoc = document): boolean {
  return doc.fullscreenElement === el || (video as WebkitVideo).webkitDisplayingFullscreen === true;
}

export function toggleFullscreen(el: HTMLElement, video: HTMLVideoElement, doc: FsDoc = document): void {
  const v = video as WebkitVideo;
  switch (fullscreenMode(video, doc)) {
    case 'element':
      // A refused request (no user gesture, policy) leaves the tile as it is.
      if (doc.fullscreenElement === el) doc.exitFullscreen().catch(() => {});
      else el.requestFullscreen().catch(() => {});
      break;
    case 'video':
      if (v.webkitDisplayingFullscreen) v.webkitExitFullscreen?.();
      else v.webkitEnterFullscreen?.();
      break;
  }
}

/** Calls cb(isFullscreen(...)) on every change; returns an unsubscribe. */
export function watchFullscreen(
  el: HTMLElement,
  video: HTMLVideoElement,
  cb: (on: boolean) => void,
  doc: FsDoc = document,
): () => void {
  const onChange = () => cb(isFullscreen(el, video, doc));
  const videoEvents = ['webkitbeginfullscreen', 'webkitendfullscreen'];
  doc.addEventListener('fullscreenchange', onChange);
  for (const e of videoEvents) video.addEventListener(e, onChange);
  return () => {
    doc.removeEventListener('fullscreenchange', onChange);
    for (const e of videoEvents) video.removeEventListener(e, onChange);
  };
}
