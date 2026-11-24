import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { CalendarStore } from '../core/calendar.store';
import {
  WEEKDAYS,
  addMonths,
  daysFrom,
  formatMonthYear,
  startOfMonth,
  startOfWeek,
  toYmd,
} from '../date-utils';
import { IconComponent } from '../shared/icon.component';

/** Month popover under the header title for jumping to any date. */
@Component({
  selector: 'app-date-picker',
  standalone: true,
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.panel() === 'picker') {
      <div class="scrim show clear" (click)="close()"></div>
      <section class="picker" role="dialog" aria-label="Choose a date">
        <div class="pk-head">
          <button class="icon-btn" (click)="shift(-1)" aria-label="Previous month">
            <app-icon name="chevron_left" />
          </button>
          <b>{{ heading() }}</b>
          <button class="icon-btn" (click)="shift(1)" aria-label="Next month">
            <app-icon name="chevron_right" />
          </button>
        </div>
        <button class="btn btn-soft small pk-today" (click)="today()">Go to today</button>

        <div class="pk-grid">
          @for (name of weekdays; track name) {
            <i>{{ name.charAt(0) }}</i>
          }
          @for (day of days(); track day.key) {
            <button
              class="pk-day"
              [class.out]="day.date.getMonth() !== month().getMonth()"
              [class.today]="day.key === store.todayKey()"
              [class.sel]="day.key === selectedKey()"
              [class.dot-shared]="has(day.key, true)"
              [class.dot-mine]="has(day.key, false)"
              (click)="store.pick(day.date)"
            >
              {{ day.date.getDate() }}
            </button>
          }
        </div>
      </section>
    }
  `,
})
export class DatePickerComponent {
  protected readonly store = inject(CalendarStore);
  protected readonly weekdays = WEEKDAYS;
  protected readonly month = signal(startOfMonth(new Date()));

  protected readonly heading = computed(() => formatMonthYear(this.month()));
  protected readonly days = computed(() => daysFrom(startOfWeek(this.month()), 42));
  protected readonly selectedKey = computed(() => toYmd(this.store.cursor()));

  constructor() {
    // Open on the month currently being viewed.
    effect(() => {
      if (this.store.panel() === 'picker') {
        untracked(() => this.month.set(startOfMonth(this.store.cursor())));
      }
    });
  }

  protected shift(step: number): void {
    this.month.update((m) => addMonths(m, step));
  }

  protected has(key: string, shared: boolean): boolean {
    return this.store.eventsOn(key).some((event) => event.shared === shared);
  }

  protected today(): void {
    this.store.pick(new Date());
  }

  protected close(): void {
    this.store.panel.set(null);
  }
}
