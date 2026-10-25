/** Widths are board-specific and keyed by stable column IDs, never task data. */
export const MIN_COLUMN_WIDTH = 240;
export const MAX_COLUMN_WIDTH = 1000;
export type ColumnWidths = Record<string, number>;

export function parseColumnWidths(raw: unknown, ids: string[]): ColumnWidths {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return Object.fromEntries(ids.flatMap((id) => {
    if (!Object.prototype.hasOwnProperty.call(raw, id)) return [];
    const value = (raw as Record<string, unknown>)[id];
    return typeof value === 'number' && Number.isFinite(value) && value > 0
      ? [[id, Math.round(Math.max(MIN_COLUMN_WIDTH, Math.min(MAX_COLUMN_WIDTH, value)))]] : [];
  }));
}

export function remapColumnWidths(widths: ColumnWidths, renames: Map<string, string>, removed: string[]): ColumnWidths {
  return Object.fromEntries(Object.entries(widths).filter(([id]) => !removed.includes(id))
    .map(([id, width]) => [renames.get(id) ?? id, width]));
}
