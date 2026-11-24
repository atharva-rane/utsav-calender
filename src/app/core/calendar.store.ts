import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  addDays,
  addMonths,
  daysFrom,
  endOfMonth,
  parseYmd,
  startOfDay,
  startOfMonth,
  startOfWeek,
  toYmd,
} from '../date-utils';
import {
  CalendarView,
  Day,
  EventDraft,
  Recipient,
  Reminder,
  ReminderDraft,
  UtsavEvent,
} from '../models';
import { groupReminders } from '../reminder-utils';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';

interface DateWindow {
  from: string; // YYYY-MM-DD
  to: string;
}

export type Panel = 'picker' | 'recipients' | 'account';
export type Section = 'calendar' | 'users' | 'uploads';

/** A message the person must acknowledge (used for "already exists" warnings). */
export interface AlertBox {
  title: string;
  message: string;
  items?: string[];
}

const NO_EVENTS: UtsavEvent[] = [];
const SCHEDULE_PAGE_MONTHS = 3;
const SCHEDULE_MAX_MONTHS = 36;
const TOAST_MS = 2600;

const earliest = (a: string, b: string) => (a < b ? a : b);
const latest = (a: string, b: string) => (a > b ? a : b);

/** Fetch a bit more than is visible (1 month back, 2 ahead) so paging feels instant. */
function paddedWindow(from: string, to: string): DateWindow {
  return {
    from: toYmd(addMonths(parseYmd(from), -1)),
    to: toYmd(endOfMonth(addMonths(parseYmd(to), 2))),
  };
}

/**
 * Single source of truth for the calendar: navigation, loaded events, overlays and actions.
 * Components read signals from here and call its methods - they hold no business logic.
 */
@Injectable({ providedIn: 'root' })
export class CalendarStore {
  private readonly api = inject(ApiService);
  readonly auth = inject(AuthService);

  // ---- Clock ----
  readonly now = signal(new Date());
  readonly todayKey = computed(() => toYmd(this.now()));
  readonly nowMinutes = computed(() => this.now().getHours() * 60 + this.now().getMinutes());

  // ---- Navigation ----
  readonly view = signal<CalendarView>('month');
  /** The date being looked at. Month/schedule use its month; day/3-day/week start from it. */
  readonly cursor = signal(startOfDay(new Date()));
  readonly scheduleMonths = signal(SCHEDULE_PAGE_MONTHS);
  /** A blocking message shown over everything until the person presses OK. */
  readonly alertBox = signal<AlertBox | null>(null);
  /** Which part of the app is showing. Only admins can open 'users' and 'uploads'. */
  readonly section = signal<Section>('calendar');

  // ---- Data ----
  readonly events = signal<UtsavEvent[]>([]);
  readonly reminders = signal<Reminder[]>([]);
  readonly recipients = signal<Recipient[]>([]);
  readonly loading = signal(false);
  readonly toast = signal('');

  // ---- Overlays ----
  readonly drawerOpen = signal(false);
  readonly searchOpen = signal(false);
  readonly panel = signal<Panel | null>(null);
  /** Date (YYYY-MM-DD) whose utsavs are listed in the day sheet, opened from the month view. */
  readonly daySheet = signal<string | null>(null);
  /** Event shown in the details sheet. */
  readonly selected = signal<UtsavEvent | null>(null);
  /** Event being created/edited in the editor. */
  readonly draft = signal<EventDraft | null>(null);

  // ---- Derived ----
  readonly monthDays = computed(() => daysFrom(startOfWeek(startOfMonth(this.cursor())), 42));

  /** Columns of the time grid (empty for month and schedule views). */
  readonly gridDays = computed<Day[]>(() => {
    const cursor = this.cursor();
    switch (this.view()) {
      case 'day':
        return daysFrom(cursor, 1);
      case '3days':
        return daysFrom(cursor, 3);
      case 'week':
        return daysFrom(startOfWeek(cursor), 7);
      default:
        return [];
    }
  });

  /** The date the header describes (first visible day of the grid, or the cursor). */
  private readonly anchor = computed(() => {
    const days = this.gridDays();
    return days.length ? days[0].date : this.cursor();
  });
  /** Header text: the month name, and (separately) its year. */
  readonly title = computed(() => this.anchor().toLocaleDateString('en', { month: 'long' }));
  readonly titleYear = computed(() => this.anchor().getFullYear());

  /** How many utsavs fall in the month being looked at (shown under the month grid). */
  readonly monthCount = computed(() => {
    const month = this.cursor();
    return this.events().filter((e) => {
      const date = parseYmd(e.date);
      return date.getFullYear() === month.getFullYear() && date.getMonth() === month.getMonth();
    }).length;
  });

  /** Events grouped by day, each day sorted all-day first, then by time. */
  readonly eventsByDay = computed(() => {
    const byDay: Record<string, UtsavEvent[]> = {};
    for (const event of this.events()) (byDay[event.date] ??= []).push(event);
    for (const list of Object.values(byDay)) {
      list.sort((a, b) => (a.time ?? '').localeCompare(b.time ?? '') || a.id - b.id);
    }
    return byDay;
  });

  private readonly ready = signal(false);
  private loaded: DateWindow | null = null;
  private requestId = 0;
  /** Day sheet to come back to after the editor closes (when the editor was opened from it). */
  private returnDay: string | null = null;

  constructor() {
    // Start loading when someone signs in; wipe everything when they sign out.
    effect(() => {
      const signedIn = this.auth.userId() !== null;
      untracked(() => (signedIn ? this.start() : this.reset()));
    });

    // Load whatever the current view needs, as soon as a user is signed in.
    effect(() => {
      const { from, to } = this.visibleRange();
      if (this.ready()) untracked(() => this.ensureLoaded(from, to));
    });
    setInterval(() => this.now.set(new Date()), 60_000);
  }

  private start(): void {
    this.ready.set(true);
    this.loadReminders();
    this.loadRecipients();
  }

  /** Forget everything that belongs to the previous user. */
  private reset(): void {
    this.ready.set(false);
    this.requestId++; // ignore answers that are still on their way
    this.loaded = null;
    this.events.set([]);
    this.reminders.set([]);
    this.recipients.set([]);
    this.loading.set(false);
    this.drawerOpen.set(false);
    this.searchOpen.set(false);
    this.panel.set(null);
    this.selected.set(null);
    this.draft.set(null);
    this.daySheet.set(null);
    this.alertBox.set(null);
    this.returnDay = null;
    this.section.set('calendar');
    this.view.set('month');
    this.cursor.set(startOfDay(new Date()));
  }

  eventsOn(key: string): UtsavEvent[] {
    return this.eventsByDay()[key] ?? NO_EVENTS;
  }

  remindersFor(eventId: number | undefined): Reminder[] {
    return eventId ? this.reminders().filter((r) => r.event_id === eventId) : [];
  }

  /** The signed-in user's reminders for one event, grouped by date. */
  reminderGroupsFor(eventId: number | undefined) {
    return groupReminders(this.remindersFor(eventId));
  }

  // ===================== Navigation =====================

  setView(view: CalendarView): void {
    this.view.set(view);
    this.scheduleMonths.set(SCHEDULE_PAGE_MONTHS);
  }

  /** Go to the previous (-1) or next (+1) page of the current view. */
  move(direction: 1 | -1): void {
    const cursor = this.cursor();
    switch (this.view()) {
      case 'day':
        return this.cursor.set(addDays(cursor, direction));
      case '3days':
        return this.cursor.set(addDays(cursor, 3 * direction));
      case 'week':
        return this.cursor.set(addDays(cursor, 7 * direction));
      default:
        return this.cursor.set(addMonths(cursor, direction));
    }
  }

  goToday(): void {
    this.cursor.set(startOfDay(new Date()));
    this.scheduleMonths.set(SCHEDULE_PAGE_MONTHS);
  }

  /** Jump to a date from the date picker, keeping the current view. */
  pick(date: Date): void {
    this.cursor.set(date);
    this.scheduleMonths.set(SCHEDULE_PAGE_MONTHS);
    this.panel.set(null);
  }

  /** Show the utsavs of one date (with details, edit and delete) - used by the month view. */
  openDay(date: Date): void {
    this.daySheet.set(toYmd(date));
  }

  /** Open one day in Day view. */
  goDay(date: Date): void {
    this.cursor.set(date);
    this.view.set('day');
  }

  loadMoreSchedule(): void {
    this.scheduleMonths.update((n) => Math.min(n + SCHEDULE_PAGE_MONTHS, SCHEDULE_MAX_MONTHS));
  }

  /** Today if it is on screen, otherwise the first visible day - the default for new events. */
  defaultDate(): string {
    const view = this.view();
    const monthLike = view === 'month' || view === 'schedule';
    const days = this.gridDays();
    const from = monthLike ? toYmd(startOfMonth(this.cursor())) : days[0].key;
    const to = monthLike ? toYmd(endOfMonth(this.cursor())) : days[days.length - 1].key;
    const today = this.todayKey();
    return today >= from && today <= to ? today : from;
  }

  // ===================== Loading =====================

  private visibleRange(): DateWindow {
    switch (this.view()) {
      case 'month': {
        const days = this.monthDays();
        return { from: days[0].key, to: days[days.length - 1].key };
      }
      case 'schedule': {
        const first = startOfMonth(this.cursor());
        const last = endOfMonth(addMonths(first, this.scheduleMonths() - 1));
        return { from: toYmd(first), to: toYmd(addDays(last, 6)) };
      }
      default: {
        const days = this.gridDays();
        return { from: days[0].key, to: days[days.length - 1].key };
      }
    }
  }

  private ensureLoaded(from: string, to: string): void {
    const have = this.loaded;
    if (have && from >= have.from && to <= have.to) return; // already in memory

    const wanted = paddedWindow(from, to);
    this.fetch(
      have ? { from: earliest(wanted.from, have.from), to: latest(wanted.to, have.to) } : wanted,
    );
  }

  private fetch(window: DateWindow): void {
    const id = ++this.requestId;
    this.loading.set(true);
    this.api.getEvents(window.from, window.to).subscribe({
      next: (events) => {
        if (id !== this.requestId) return; // a newer request superseded this one
        this.events.set(events);
        this.loaded = window;
        this.loading.set(false);
      },
      error: (error) => {
        if (id !== this.requestId) return;
        this.loading.set(false);
        this.fail(error);
      },
    });
  }

  /** Reload everything from the server. */
  refresh(): void {
    const { from, to } = this.visibleRange();
    const wanted = paddedWindow(from, to);
    this.fetch(
      this.loaded
        ? { from: earliest(wanted.from, this.loaded.from), to: latest(wanted.to, this.loaded.to) }
        : wanted,
    );
    this.loadReminders();
    this.loadRecipients();
  }

  private loadReminders(): void {
    this.api.getReminders().subscribe({ next: (list) => this.reminders.set(list) });
  }

  private loadRecipients(): void {
    this.api.getRecipients().subscribe({ next: (list) => this.recipients.set(list) });
  }

  // ===================== Overlays =====================

  openEvent(event: UtsavEvent): void {
    this.selected.set(event);
  }

  /** Start a new utsav. Opened from the day sheet, the editor returns to it afterwards. */
  openNew(date = this.defaultDate(), time = ''): void {
    this.returnDay = this.daySheet();
    this.daySheet.set(null);
    this.selected.set(null);
    // Admins' new events are shown to every user by default; users' events are always private.
    this.draft.set({
      title: '',
      date,
      time,
      location: '',
      description: '',
      shared: this.auth.isAdmin(),
    });
  }

  editEvent(event: UtsavEvent): void {
    this.returnDay = this.daySheet();
    this.daySheet.set(null);
    this.selected.set(null);
    this.draft.set({ ...event, time: event.time ?? '' });
  }

  editSelected(): void {
    const event = this.selected();
    if (event) this.editEvent(event);
  }

  /** Close the editor; go back to the day sheet it was opened from (showing the saved date). */
  closeEditor(savedDate?: string): void {
    this.draft.set(null);
    const back = this.returnDay;
    this.returnDay = null;
    if (back) this.daySheet.set(savedDate ?? back);
  }

  /** Close the top-most overlay (Escape key). */
  closeTopOverlay(): void {
    if (this.alertBox()) this.alertBox.set(null);
    else if (this.panel()) this.panel.set(null);
    else if (this.draft()) this.closeEditor();
    else if (this.selected()) this.selected.set(null);
    else if (this.daySheet()) this.daySheet.set(null);
    else if (this.searchOpen()) this.searchOpen.set(false);
    else this.drawerOpen.set(false);
  }

  // ===================== Events =====================

  /**
   * Create or update an event, then add this user's reminder dates and times.
   * Throws on failure; if only the reminders fail the event is already saved, and `draft.id`
   * is set so that pressing Save again updates it instead of creating a duplicate.
   */
  async saveEvent(draft: EventDraft, reminders: ReminderDraft[]): Promise<void> {
    let eventId = draft.id;

    // A read-only (shared) utsav is never sent back; only this user's reminders are saved.
    if (!eventId || draft.editable !== false) {
      const saved = await firstValueFrom(
        eventId ? this.api.updateEvent(eventId, draft) : this.api.createEvent(draft),
      );
      this.events.update((list) =>
        eventId ? list.map((e) => (e.id === saved.id ? saved : e)) : [...list, saved],
      );
      eventId = draft.id = saved.id;
    }

    if (reminders.length && eventId) {
      const created = await firstValueFrom(this.api.addReminders(eventId, reminders));
      this.reminders.update((list) => [...list, ...created]);
    }
  }

  /** Remove instantly from the screen, restore it if the server refuses. */
  deleteEvent(id: number): void {
    const events = this.events();
    const reminders = this.reminders();
    this.events.set(events.filter((e) => e.id !== id));
    this.reminders.set(reminders.filter((r) => r.event_id !== id));
    this.selected.set(null);

    this.api.deleteEvent(id).subscribe({
      next: () => this.say('Event deleted'),
      error: (error) => {
        this.events.set(events);
        this.reminders.set(reminders);
        this.fail(error);
      },
    });
  }

  /** Remove one reminder time. */
  deleteReminder(id: number): void {
    const before = this.reminders();
    this.reminders.set(before.filter((r) => r.id !== id));
    this.api.deleteReminder(id).subscribe({
      error: (error) => {
        this.reminders.set(before);
        this.fail(error);
      },
    });
  }

  /** Remove a reminder date together with all of its times. */
  deleteReminderDate(eventId: number, date: string): void {
    const before = this.reminders();
    this.reminders.set(before.filter((r) => !(r.event_id === eventId && r.remind_date === date)));
    this.api.deleteReminderDate(eventId, date).subscribe({
      error: (error) => {
        this.reminders.set(before);
        this.fail(error);
      },
    });
  }

  search(query: string) {
    return this.api.searchEvents(query);
  }

  /** Open a search result: jump to its date and show its details. */
  showSearchResult(event: UtsavEvent): void {
    this.cursor.set(parseYmd(event.date));
    this.searchOpen.set(false);
    this.selected.set(event);
  }

  // ===================== Recipients =====================

  async addRecipients(emails: string[]): Promise<void> {
    this.recipients.set(await firstValueFrom(this.api.addRecipients(emails)));
  }

  deleteRecipient(id: number): void {
    const before = this.recipients();
    this.recipients.set(before.filter((r) => r.id !== id));
    this.api.deleteRecipient(id).subscribe({
      error: (error) => {
        this.recipients.set(before);
        this.fail(error);
      },
    });
  }

  // ===================== Admin =====================

  logout(): void {
    this.auth.logout();
  }

  // ===================== Messages =====================

  say(message: string): void {
    this.toast.set(message);
    setTimeout(() => this.toast() === message && this.toast.set(''), TOAST_MS);
  }

  /** Show a message that stays until the person presses OK. */
  alert(title: string, message: string, items?: string[]): void {
    this.alertBox.set({ title, message, items });
  }

  fail(error: unknown): void {
    // "Already exists" needs a clear, blocking warning rather than a toast that fades away.
    if ((error as { status?: number })?.status === 409) {
      return this.alert('Already exists', this.errorMessage(error, 'This utsav already exists.'));
    }
    this.say(this.errorMessage(error, 'Something went wrong'));
  }

  errorMessage(error: unknown, fallback: string): string {
    return (error as { error?: { error?: string } })?.error?.error ?? fallback;
  }
}
