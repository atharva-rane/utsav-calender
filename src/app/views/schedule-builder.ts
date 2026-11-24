import {
  addDays,
  addMonths,
  daysFrom,
  formatMonthYear,
  formatRange,
  seasonOf,
  startOfWeek,
  toYmd,
} from '../date-utils';
import { Day, UtsavEvent } from '../models';

export interface ScheduleDay extends Day {
  events: UtsavEvent[];
}
export interface ScheduleWeek {
  key: string;
  label: string;
  days: ScheduleDay[];
}
export interface ScheduleMonth {
  key: string;
  title: string;
  season: string;
  weeks: ScheduleWeek[];
  /** How many utsavs this month's weeks contain. */
  count: number;
}

/**
 * Month-by-month list. A week belongs to the month its Sunday falls in, so
 * "29 Nov - 5 Dec" is listed under November (as in Google Calendar).
 */
export function buildSchedule(
  firstMonth: Date,
  monthCount: number,
  eventsByDay: Record<string, UtsavEvent[]>,
): ScheduleMonth[] {
  return Array.from({ length: monthCount }, (_, index) => {
    const month = addMonths(firstMonth, index);
    // The first month starts on the 1st; later months start on their first Sunday
    // (days before it were already shown in the previous month's last week).
    let weekStart = index === 0 ? month : addDays(month, (7 - month.getDay()) % 7);

    const weeks: ScheduleWeek[] = [];
    while (weekStart.getMonth() === month.getMonth()) {
      const weekEnd = addDays(startOfWeek(weekStart), 6);
      const length = Math.round((weekEnd.getTime() - weekStart.getTime()) / 86_400_000) + 1;
      const days = daysFrom(weekStart, length)
        .filter((day) => eventsByDay[day.key]?.length)
        .map((day) => ({ ...day, events: eventsByDay[day.key] }));

      weeks.push({ key: toYmd(weekStart), label: formatRange(weekStart, weekEnd), days });
      weekStart = addDays(weekEnd, 1);
    }
    return {
      key: toYmd(month),
      title: formatMonthYear(month),
      season: seasonOf(month),
      weeks,
      count: weeks.reduce((sum, week) => sum + week.days.reduce((n, d) => n + d.events.length, 0), 0),
    };
  });
}
