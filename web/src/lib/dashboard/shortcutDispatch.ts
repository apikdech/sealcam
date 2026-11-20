// Runs the keyboard shortcuts (ui-spec §4.7) for the pages that show a player and a timeline.
import { adjacentClip, commandFor, type Command } from '../shortcuts';

export interface DispatchContext {
  /** Null or undefined when the player is not mounted. */
  playerView: { togglePlay(): void; skip(ms: number): void } | null | undefined;
  timeline: { stepZoom(dir: 'in' | 'out'): void; jumpToNow(): void } | null | undefined;
  timelineClips: readonly { id: string; startMs: number }[];
  selectedId: string | null;
  select: (clipId: string) => void;
  /** Moves to today when another day shows; false when it already is today. */
  goToday: () => boolean;
}

/** Runs a command; false when there was nothing for it to act on (the key keeps its default). */
export function runCommand(cmd: Command, c: DispatchContext): boolean {
  switch (cmd) {
    case 'toggle':
      c.playerView?.togglePlay();
      return !!c.playerView;
    case 'back10':
      c.playerView?.skip(-10_000);
      return !!c.playerView;
    case 'fwd10':
      c.playerView?.skip(10_000);
      return !!c.playerView;
    case 'prev':
    case 'next': {
      const id = adjacentClip(c.timelineClips, c.selectedId, cmd);
      if (id === null) return false;
      if (id !== c.selectedId) c.select(id);
      return true;
    }
    case 'zoomIn':
    case 'zoomOut':
      c.timeline?.stepZoom(cmd === 'zoomIn' ? 'in' : 'out');
      return !!c.timeline;
    case 'now':
      // The timeline shows the whole new day first.
      if (c.goToday()) return true;
      c.timeline?.jumpToNow();
      return !!c.timeline;
  }
}

export function handleKeydown(e: KeyboardEvent, c: DispatchContext): void {
  // A modal dialog (the export confirmation) owns the keyboard: nothing behind it may react.
  if (document.querySelector('[aria-modal="true"]')) return;
  const cmd = commandFor(e);
  if (cmd === null) return;
  if (runCommand(cmd, c)) e.preventDefault();
}
