import { Day } from './models';

const pad = (n: number) => String(n).padStart(2, '0');

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ---- Date <-> 'YYYY-MM-DD' (always local time, never UTC) ----
export const toYmd = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function parseYmd(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

// ---- Date arithmetic ----
export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const addDays = (d: Date, n: number) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
/** First day of the month that is `n` months away. */
export const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1);
export const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
export const endOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0);
/** The Sunday on or before `d`. */
export const startOfWeek = (d: Date) => addDays(d, -d.getDay());

/** `count` consecutive days starting at `start`. */
export function daysFrom(start: Date, count: number): Day[] {
  return Array.from({ length: count }, (_, i) => {
    const date = addDays(start, i);
    return { date, key: toYmd(date) };
  });
}

// ---- Time of day ----
export function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/** '18:30' -> '6:30 pm', '09:00' -> '9 am', null -> ''. */
export function formatTime(time: string | null): string {
  if (!time) return '';
  const [hours, minutes] = time.split(':').map(Number);
  const suffix = hours < 12 ? 'am' : 'pm';
  const hour12 = hours % 12 || 12;
  return minutes ? `${hour12}:${pad(minutes)} ${suffix}` : `${hour12} ${suffix}`;
}

/** 13 -> '1 pm' (labels on the time grid). */
export const formatHour = (hour: number) => formatTime(`${pad(hour)}:00`);

// ---- Labels ----
const monthShort = (d: Date) => d.toLocaleDateString('en', { month: 'short' });

/** '8–14 Nov' or '29 Nov–5 Dec'. */
export function formatRange(from: Date, to: Date): string {
  return from.getMonth() === to.getMonth()
    ? `${from.getDate()}–${to.getDate()} ${monthShort(to)}`
    : `${from.getDate()} ${monthShort(from)}–${to.getDate()} ${monthShort(to)}`;
}

export const formatLongDate = (key: string) =>
  parseYmd(key).toLocaleDateString('en', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

export const formatMonthYear = (d: Date) =>
  d.toLocaleDateString('en', { month: 'long', year: 'numeric' });

export const seasonOf = (d: Date): 'winter' | 'spring' | 'summer' | 'autumn' => {
  const month = d.getMonth();
  if (month === 11 || month <= 1) return 'winter';
  if (month <= 4) return 'spring';
  if (month <= 7) return 'summer';
  return 'autumn';
};
