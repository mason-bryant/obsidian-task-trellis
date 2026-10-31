import { backlogColumn, type BoardConfig } from './boardConfig.ts';

export type ShortcutTask = {
  board: string;
  text: string;
  due: string | null;
  column?: string;
  openBoard: boolean;
  requestId?: string;
};

/** Obsidian has already URL-decoded these values. */
export function parseShortcutTask(params: Record<string, string>): ShortcutTask {
  const board = params.board?.trim();
  const text = params.text?.trim();
  if (!board) throw new Error('Specify a board.');
  if (!text) throw new Error('Specify the task text.');
  const due = params.due?.trim() || null;
  if (due && (!/^\d{4}-\d{2}-\d{2}$/.test(due) || !Number.isFinite(Date.parse(due)) ||
    new Date(due).toISOString().slice(0, 10) !== due)) {
    throw new Error('Use a valid due date in YYYY-MM-DD format, or omit due for no date.');
  }
  if (params['open-board'] !== undefined && !['true', 'false'].includes(params['open-board'])) {
    throw new Error('open-board must be true or false.');
  }
  const requestId = params['request-id'];
  if (requestId !== undefined && !/^[A-Za-z0-9_-]{1,128}$/.test(requestId)) {
    throw new Error('request-id must contain 1–128 letters, numbers, hyphens or underscores.');
  }
  return { board, text, due, column: params.column?.trim() || undefined,
    openBoard: params['open-board'] === 'true', requestId };
}

export function shortcutColumn(config: BoardConfig, requested: string | undefined, due: string | null): string {
  const fallback = backlogColumn(config);
  if (!fallback) throw new Error('This board needs an ordinary workflow column.');
  if (!requested) return fallback.id;
  const matches = config.columns.filter((c) => c.id === requested || c.label.toLowerCase() === requested.toLowerCase());
  if (matches.length !== 1) throw new Error(`Unknown or ambiguous column: ${requested}.`);
  const column = matches[0]!;
  if (column.id === config.doneColumn) throw new Error('New tasks must use an open workflow column, not Done.');
  if (column.id === config.undatedColumn) {
    if (due) throw new Error('The No due date column cannot be used with a due date.');
    return fallback.id;
  }
  return column.id;
}

export function shortcutURL(vault: string, board: string): string {
  const params = Object.entries({ vault, board, text: 'Your task text' })
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&');
  return `obsidian://task-trellis-create?${params}`;
}
