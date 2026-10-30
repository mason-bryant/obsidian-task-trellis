import { ItemView, Notice, type App } from 'obsidian';
import { announce } from '../ui/announce.ts';

type NoticeOptions = {
  /** An error that needs attention, said as an alert rather than a status. */
  alert?: boolean;
  /** The board or dialog to say it from; otherwise the board in the active view, if there is one. */
  region?: HTMLElement;
  duration?: number;
};

/**
 * Shows a notice and says it from a board's or dialog's live region. Obsidian's notices have no
 * live role, so screen readers don't speak them.
 */
export function notice(app: App, message: string, { alert = false, region, duration }: NoticeOptions = {}): void {
  new Notice(message, duration);
  const target = region ?? activeBoard(app);
  if (target?.isConnected) announce(target, message, alert ? 'alert' : 'status');
}

function activeBoard(app: App): HTMLElement | null {
  const content = app.workspace.getActiveViewOfType(ItemView)?.contentEl;
  return content?.classList.contains('tt-board') ? content : null;
}
