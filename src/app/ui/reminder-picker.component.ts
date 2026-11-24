import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  model,
  signal,
  untracked,
} from '@angular/core';
import { CalendarStore } from '../core/calendar.store';
import {
  WEEKDAYS,
  addDays,
  addMonths,
  daysFrom,
  formatMonthYear,
  formatTime,
  parseYmd,
  startOfMonth,
  startOfWeek,
  toYmd,
} from '../date-utils';
import { ReminderDraft } from '../models';
import { DEFAULT_REMINDER_TIMES, MAX_TIMES_PER_DATE } from '../reminder-utils';
import { IconComponent } from '../shared/icon.component';

const TIME_GROUPS = [
  { label: 'Morning', slots: ['06:00', '08:00', '09:00', '10:00'] },
  { label: 'Afternoon', slots: ['12:00', '14:00', '16:00'] },
  { label: 'Evening', slots: ['18:00', '19:00', '20:00', '21:00'] },
];
const STANDARD_SLOTS = new Set(TIME_GROUPS.flatMap((group) => group.slots));

/** Shortcuts, counted back from the day of the utsav. */
const QUICK_DATES = [
  { label: 'On the day', daysBefore: 0 },
  { label: '1 day before', daysBefore: 1 },
  { label: '2 days before', daysBefore: 2 },
  { label: '1 week before', daysBefore: 7 },
];

const byClock = (a: string, b: string) => a.localeCompare(b);

/**
 * Choose when reminder emails are sent: tap one or more dates on a small calendar, then pick the
 * times - once for all dates, or separately for each date. Produces `rows` for the editor.
 */
@Component({
  selector: 'app-reminder-picker',
  standalone: true,
  imports: [IconComponent, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="rp">
      <!-- 1. Dates -->
      <div class="rp-step"><span class="rp-num">1</span> Choose dates</div>

      <div class="rp-quick">
        @for (quick of quickDates; track quick.label) {
          @let key = quickKey(quick.daysBefore);
          <button
            type="button"
            class="slot"
            [class.on]="key !== null && selected().includes(key)"
            [attr.aria-pressed]="key !== null && selected().includes(key)"
            [disabled]="key === null"
            (click)="key && toggleDate(key, true)"
          >
            {{ quick.label }}
          </button>
        }
      </div>

      <div class="rp-cal">
        <div class="rp-head">
          <button
            type="button"
            class="icon-btn small"
            [disabled]="!canGoBack()"
            (click)="month.set(shift(-1))"
            aria-label="Previous month"
          >
            <app-icon name="chevron_left" />
          </button>
          <b>{{ heading() }}</b>
          <button type="button" class="icon-btn small" (click)="month.set(shift(1))" aria-label="Next month">
            <app-icon name="chevron_right" />
          </button>
        </div>

        <div class="rp-grid" role="grid">
          @for (name of weekdays; track name) {
            <i>{{ name.charAt(0) }}</i>
          }
          @for (day of days(); track day.key) {
            <button
              type="button"
              class="rp-day"
              [class.out]="day.date.getMonth() !== month().getMonth()"
              [class.today]="day.key === store.todayKey()"
              [class.event]="day.key === eventDate()"
              [class.sel]="selected().includes(day.key)"
              [class.saved]="taken().includes(day.key)"
              [disabled]="isDisabled(day.key)"
              [attr.aria-pressed]="selected().includes(day.key)"
              [attr.aria-label]="label(day.key)"
              (click)="toggleDate(day.key)"
            >
              {{ day.date.getDate() }}
            </button>
          }
        </div>

        <div class="rp-key">
          <span><i class="k-sel"></i> Reminder</span>
          <span><i class="k-event"></i> Day of utsav</span>
          <span><i class="k-saved"></i> Already set</span>
        </div>
      </div>

      <!-- 2. Times -->
      @if (selected().length) {
        <div class="rp-step"><span class="rp-num">2</span> Choose times</div>

        @if (selected().length > 1) {
          <label class="rp-toggle">
            <span class="grow">
              Different times for each date
              <small>Off: the same times are used for every date</small>
            </span>
            <input
              type="checkbox"
              class="switch"
              [checked]="perDate()"
              (change)="perDate.set(!perDate())"
            />
          </label>
        }

        @if (perDate() && selected().length > 1) {
          @for (date of selected(); track date) {
            <div class="rp-block">
              <div class="rp-block-head">
                <b>{{ label(date) }}</b>
                <button
                  type="button"
                  class="icon-btn small"
                  (click)="toggleDate(date)"
                  [attr.aria-label]="'Remove ' + label(date)"
                >
                  <app-icon name="close" />
                </button>
              </div>
              <ng-container *ngTemplateOutlet="timePick; context: { date: date }" />
            </div>
          }
        } @else {
          <div class="rp-block">
            <ng-container *ngTemplateOutlet="timePick; context: { date: null }" />
          </div>
        }

        <!-- Summary -->
        <div class="rp-summary" role="status">
          <b>{{ emailCount() }} reminder {{ emailCount() === 1 ? 'email' : 'emails' }}</b>
          <span class="rp-chips">
            @for (date of selected(); track date) {
              <span class="chip">
                {{ label(date) }}
                <button type="button" (click)="toggleDate(date)" [attr.aria-label]="'Remove ' + label(date)">
                  ×
                </button>
              </span>
            }
          </span>
        </div>
      }
    </div>

    <ng-template #timePick let-date="date">
      @let times = timesOf(date);
      @for (group of groups; track group.label) {
        <div class="tp-group">
          <span class="tp-label">{{ group.label }}</span>
          <div class="slots">
            @for (slot of group.slots; track slot) {
              <button
                type="button"
                class="slot"
                [class.on]="times.includes(slot)"
                [attr.aria-pressed]="times.includes(slot)"
                (click)="toggleTime(date, slot)"
              >
                {{ time(slot) }}
              </button>
            }
          </div>
        </div>
      }
      @if (customOf(times).length) {
        <div class="tp-group">
          <span class="tp-label">Custom</span>
          <div class="slots">
            @for (slot of customOf(times); track slot) {
              <button type="button" class="slot on" aria-pressed="true" (click)="toggleTime(date, slot)">
                {{ time(slot) }} ×
              </button>
            }
          </div>
        </div>
      }
      <div class="custom-time">
        <input type="time" #custom aria-label="Add another time" />
        <button type="button" class="btn btn-soft small" (click)="addCustom(date, custom)">
          Add time
        </button>
      </div>
    </ng-template>
  `,
})
export class ReminderPickerComponent {
  protected readonly store = inject(CalendarStore);

  /** Day of the utsav (YYYY-MM-DD); reminders cannot be set after it. */
  readonly eventDate = input('');
  /** Dates that already have saved reminders, marked on the calendar. */
  readonly taken = input<string[]>([]);
  /** The reminder dates and times chosen here (read by the editor). */
  readonly rows = model<ReminderDraft[]>([]);

  protected readonly weekdays = WEEKDAYS;
  protected readonly groups = TIME_GROUPS;
  protected readonly quickDates = QUICK_DATES;
  protected readonly time = formatTime;

  protected readonly month = signal(startOfMonth(new Date()));
  protected readonly selected = signal<string[]>([]);
  protected readonly sharedTimes = signal<string[]>([...DEFAULT_REMINDER_TIMES]);
  protected readonly perDate = signal(false);
  protected readonly dateTimes = signal<Record<string, string[]>>({});

  protected readonly heading = computed(() => formatMonthYear(this.month()));
  protected readonly days = computed(() => daysFrom(startOfWeek(this.month()), 42));
  protected readonly canGoBack = computed(
    () => this.month().getTime() > startOfMonth(this.store.now()).getTime(),
  );

  private readonly output = computed<ReminderDraft[]>(() =>
    this.selected().map((date) => ({ date, times: this.timesOf(date) })),
  );
  protected readonly emailCount = computed(() =>
    this.output().reduce((sum, row) => sum + row.times.length, 0),
  );

  constructor() {
    effect(() => this.rows.set(this.output()));

    // Follow the utsav's date: show its month, and drop reminder dates that fall after it.
    effect(() => {
      const date = this.eventDate();
      untracked(() => {
        const today = this.store.todayKey();
        this.month.set(startOfMonth(date && date >= today ? parseYmd(date) : new Date()));
        if (date) this.selected.update((list) => list.filter((d) => d <= date));
      });
    });
  }

  // ---------- dates ----------

  protected isDisabled(key: string): boolean {
    const event = this.eventDate();
    return key < this.store.todayKey() || (!!event && key > event);
  }

  protected quickKey(daysBefore: number): string | null {
    const event = this.eventDate();
    if (!event) return null;
    const key = toYmd(addDays(parseYmd(event), -daysBefore));
    return this.isDisabled(key) ? null : key;
  }

  protected shift(step: number): Date {
    return addMonths(this.month(), step);
  }

  /** Select or unselect a date. `reveal` also scrolls the calendar to it. */
  protected toggleDate(key: string, reveal = false): void {
    if (this.isDisabled(key)) return;
    const on = this.selected().includes(key);
    this.selected.update((list) => (on ? list.filter((d) => d !== key) : [...list, key].sort(byClock)));
    if (!on && reveal) this.month.set(startOfMonth(parseYmd(key)));
  }

  protected label(key: string): string {
    return parseYmd(key).toLocaleDateString('en', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  }

  // ---------- times ----------

  /** The times for one date, or the shared times when `date` is null / not per-date. */
  protected timesOf(date: string | null): string[] {
    if (!date || !this.perDate()) return this.sharedTimes();
    return this.dateTimes()[date] ?? this.sharedTimes();
  }

  protected customOf(times: string[]): string[] {
    return times.filter((slot) => !STANDARD_SLOTS.has(slot));
  }

  protected toggleTime(date: string | null, slot: string): void {
    const current = this.timesOf(date);
    if (!current.includes(slot) && current.length >= MAX_TIMES_PER_DATE) {
      return this.store.say(`You can pick up to ${MAX_TIMES_PER_DATE} times for one date`);
    }
    const next = current.includes(slot)
      ? current.filter((t) => t !== slot)
      : [...current, slot].sort(byClock);

    if (date && this.perDate()) this.dateTimes.update((map) => ({ ...map, [date]: next }));
    else this.sharedTimes.set(next);
  }

  protected addCustom(date: string | null, input: HTMLInputElement): void {
    if (!input.value) return this.store.say('Choose a time first');
    if (!this.timesOf(date).includes(input.value)) this.toggleTime(date, input.value);
    input.value = '';
  }
}
