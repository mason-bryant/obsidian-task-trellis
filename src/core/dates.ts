/** Calendar dates as `YYYY-MM-DD` strings; arithmetic runs on UTC day numbers so DST never shifts a day. */
export type ISODate = string;

const DAY_MS = 86_400_000;
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isISODate(value: unknown): value is ISODate {
  return typeof value === 'string' && ISO_RE.test(value);
}

/** Local calendar date of `now`. */
export function todayISO(now: Date = new Date()): ISODate {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function addDays(date: ISODate, days: number): ISODate {
  return fromDayNumber(toDayNumber(date) + days);
}

/** `a - b` in days. */
export function diffDays(a: ISODate, b: ISODate): number {
  return toDayNumber(a) - toDayNumber(b);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(date: ISODate): number {
  return new Date(toDayNumber(date) * DAY_MS).getUTCDay();
}

/** First day of the week containing `date`, for weeks starting on `weekStart` (0 = Sunday, 1 = Monday). */
export function startOfWeek(date: ISODate, weekStart: number): ISODate {
  return addDays(date, -((weekday(date) - weekStart + 7) % 7));
}

export function maxDate(a: ISODate, b: ISODate): ISODate {
  return a >= b ? a : b;
}

/** Label with the weekday, such as "Sun, Oct 26". */
export function dayLabel(date: ISODate): string {
  return new Date(toDayNumber(date) * DAY_MS).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** Short label such as "Oct 26". */
export function shortLabel(date: ISODate): string {
  return new Date(toDayNumber(date) * DAY_MS).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function toDayNumber(date: ISODate): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1) / DAY_MS;
}

function fromDayNumber(day: number): ISODate {
  const d = new Date(day * DAY_MS);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
