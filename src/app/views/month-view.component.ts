import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CalendarStore } from '../core/calendar.store';
import { WEEKDAYS } from '../date-utils';
import { eventKind } from '../event-utils';
import { UtsavEvent } from '../models';

const MAX_CHIPS = 3;

/**
 * Tapping a date opens the day sheet. Days that have utsavs are tinted, so they stand out at a
 * glance: indigo for the admin's schedule, teal for your own private utsavs.
 */
@Component({
  selector: 'app-month-view',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="m-dow">
      @for (name of weekdays; track name) {
        <span>{{ name }}</span>
      }
    </div>

    <div class="m-grid" [style.--rows]="days().length / 7">
      @for (day of days(); track day.key) {
        @let events = store.eventsOn(day.key);
        <button
          class="m-cell"
          [class.out]="day.date.getMonth() !== store.cursor().getMonth()"
          [class.today]="day.key === store.todayKey()"
          [class.has-shared]="has(events, 'shared')"
          [class.has-mine]="has(events, 'mine') && !has(events, 'shared')"
          [class.has-both]="has(events, 'shared') && has(events, 'mine')"
          (click)="store.openDay(day.date)"
          [attr.aria-label]="label(day.date, events.length)"
        >
          <span class="num" [class.today]="day.key === store.todayKey()">
            {{ day.date.getDate() }}
          </span>
          @for (event of events.slice(0, maxChips); track event.id) {
            <span [class]="'m-chip kind-' + kind(event)">{{ event.title }}</span>
          }
          @if (events.length > maxChips) {
            <span class="m-more">+{{ events.length - maxChips }} more</span>
          }
          @if (events.length) {
            <span class="m-dots" aria-hidden="true">
              @if (has(events, 'shared')) {
                <i class="dot kind-shared"></i>
              }
              @if (has(events, 'mine')) {
                <i class="dot kind-mine"></i>
              }
            </span>
          }
        </button>
      }
    </div>

    <div class="m-legend">
      <span><i class="dot kind-shared"></i> {{ sharedLabel() }}</span>
      <span><i class="dot kind-mine"></i> {{ mineLabel() }}</span>
      <span class="grow"></span>
      <span class="m-count">
        {{ store.monthCount() }} {{ store.monthCount() === 1 ? 'utsav' : 'utsavs' }} this month
      </span>
    </div>
  `,
})
export class MonthViewComponent {
  protected readonly store = inject(CalendarStore);
  protected readonly weekdays = WEEKDAYS;
  protected readonly maxChips = MAX_CHIPS;
  protected readonly kind = eventKind;

  /** Five weeks when the sixth would only show days of the next month. */
  protected readonly days = computed(() => {
    const all = this.store.monthDays();
    const month = this.store.cursor().getMonth();
    return all.slice(35).every((day) => day.date.getMonth() !== month) ? all.slice(0, 35) : all;
  });

  protected readonly sharedLabel = computed(() =>
    this.store.auth.isAdmin() ? 'Shared with users' : 'From admin',
  );
  protected readonly mineLabel = computed(() =>
    this.store.auth.isAdmin() ? 'Private' : 'My events',
  );

  protected has(events: UtsavEvent[], kind: 'shared' | 'mine'): boolean {
    return events.some((event) => eventKind(event) === kind);
  }

  protected label(date: Date, count: number): string {
    const text = date.toLocaleDateString('en', { weekday: 'long', day: 'numeric', month: 'long' });
    return count ? `${text}, ${count} ${count === 1 ? 'utsav' : 'utsavs'}` : text;
  }
}
