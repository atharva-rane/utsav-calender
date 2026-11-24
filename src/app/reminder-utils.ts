import { Reminder, ReminderGroup } from './models';

/** Time slots offered for every reminder date; 9:00 am is selected by default. */
export const REMINDER_SLOTS = ['09:00', '12:00', '15:00', '18:00', '21:00'];
export const DEFAULT_REMINDER_TIMES = ['09:00'];
export const MAX_TIMES_PER_DATE = 12;

/** Group reminder slots by date (earliest first), each date's times in clock order. */
export function groupReminders(list: Reminder[]): ReminderGroup[] {
  const byDate = new Map<string, Reminder[]>();
  for (const reminder of list) {
    const items = byDate.get(reminder.remind_date) ?? [];
    items.push(reminder);
    byDate.set(reminder.remind_date, items);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, items]) => ({
      date,
      items: [...items].sort((a, b) => a.remind_time.localeCompare(b.remind_time)),
    }));
}
