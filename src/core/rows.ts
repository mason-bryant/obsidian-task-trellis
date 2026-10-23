import { addDays, dayLabel, maxDate, shortLabel, startOfWeek, type ISODate } from './dates.ts';
import type { BoardConfig } from './boardConfig.ts';

export type RowKind = 'none' | 'now' | 'week' | 'later';

export type RowDef = {
  id: string;
  kind: RowKind;
  label: string;
  detail: string;
  /** Inclusive due-date range; open-ended when missing. */
  from?: ISODate;
  to?: ISODate;
  /** Due date a card gets when dropped into this row from another row; null removes it. */
  dropDate: ISODate | null;
};

/** Last day of Due now: today + n days, or the last day of the n-th week counting this one. */
export function dueNowEnd(config: BoardConfig, today: ISODate): ISODate {
  return config.dueNowUnit === 'weeks'
    ? addDays(startOfWeek(today, config.weekStart), config.dueNow * 7 - 1)
    : addDays(today, config.dueNow);
}

/**
 * Rows for `today`: No due date, Due now (overdue through the window's end), one row per week up
 * to the horizon, then Later. The first week row starts the day after Due now ends, so with a
 * window in days it can be partial.
 */
export function computeRows(config: BoardConfig, today: ISODate): RowDef[] {
  const nowEnd = dueNowEnd(config, today);
  const firstDay = addDays(nowEnd, 1);
  const rows: RowDef[] = [
    { id: 'none', kind: 'none', label: 'No due date', detail: '', dropDate: null },
    {
      id: 'now',
      kind: 'now',
      label: 'Due now',
      detail: nowEnd === today ? 'today' : `through ${dayLabel(nowEnd)}`,
      to: nowEnd,
      dropDate: nowEnd,
    },
  ];

  const firstWeek = startOfWeek(firstDay, config.weekStart);
  for (let i = 0; i < config.weekHorizon; i++) {
    const start = addDays(firstWeek, i * 7);
    const from = maxDate(start, firstDay);
    const to = addDays(start, 6);
    rows.push({
      id: `week-${start}`,
      kind: 'week',
      label: `Week of ${shortLabel(start)}`,
      detail: from === start ? '' : `from ${shortLabel(from)}`,
      from,
      to,
      dropDate: from,
    });
  }

  const laterFrom = config.weekHorizon > 0 ? addDays(firstWeek, config.weekHorizon * 7) : firstDay;
  rows.push({
    id: 'later',
    kind: 'later',
    label: 'Later',
    detail: `from ${shortLabel(laterFrom)}`,
    from: laterFrom,
    dropDate: laterFrom,
  });
  return rows;
}

export function rowForDue(rows: RowDef[], due: ISODate | undefined): RowDef {
  const row = due
    ? rows.find((r) => r.kind !== 'none' && (!r.from || due >= r.from) && (!r.to || due <= r.to))
    : rows.find((r) => r.kind === 'none');
  // computeRows covers every date, so this only guards against hand-built row lists.
  return row ?? rows[rows.length - 1]!;
}
