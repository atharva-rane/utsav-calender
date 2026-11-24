import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  viewChild,
} from '@angular/core';
import { CalendarStore } from '../core/calendar.store';
import { WEEKDAYS, formatHour, formatTime } from '../date-utils';
import { eventKind } from '../event-utils';
import { UtsavEvent } from '../models';
import { layoutDay } from './day-layout';

/** Hour labels 1 am ... 11 pm (midnight has no label, like Google Calendar). */
const HOURS = Array.from({ length: 23 }, (_, i) => i + 1);
const DEFAULT_SCROLL_HOUR = 7;

/** Day, 3-day and Week views share one hour-by-hour grid with 1, 3 or 7 columns. */
@Component({
  selector: 'app-time-grid-view',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tg" [style.--cols]="store.gridDays().length">
      <div class="tg-row tg-head">
        <span></span>
        @for (column of columns(); track column.day.key) {
          <button
            class="tg-day"
            [class.today]="column.day.key === store.todayKey()"
            (click)="store.goDay(column.day.date)"
          >
            <span>{{ weekday(column.day.date) }}</span>
            <b>{{ column.day.date.getDate() }}</b>
          </button>
        }
      </div>

      @if (hasAllDay()) {
        <div class="tg-row tg-allday">
          <span class="tg-gutter">All day</span>
          @for (column of columns(); track column.day.key) {
            <div>
              @for (event of column.allDay; track event.id) {
                <button [class]="'tg-chip kind-' + kind(event)" (click)="store.openEvent(event)">{{ event.title }}</button>
              }
            </div>
          }
        </div>
      }

      <div class="tg-scroll" #scroller>
        <div class="tg-body">
          <div class="tg-hours">
            @for (hour of hours; track hour) {
              <span [style.--h]="hour">{{ hourLabel(hour) }}</span>
            }
          </div>

          @for (column of columns(); track column.day.key) {
            <div class="tg-col" (click)="createAt($event, column.day.key)">
              @for (item of column.items; track item.event.id) {
                <button
                  [class]="'tg-ev kind-' + kind(item.event)"
                  [style.--start]="item.start"
                  [style.--lane]="item.lane"
                  [style.--lanes]="item.lanes"
                  (click)="open($event, item.event)"
                >
                  <b>{{ item.event.title }}</b>
                  <span>{{ timeLabel(item.event) }}</span>
                </button>
              }
              @if (column.day.key === store.todayKey()) {
                <i class="tg-now" [style.--now]="store.nowMinutes()"></i>
              }
            </div>
          }
        </div>
      </div>
    </div>
  `,
})
export class TimeGridViewComponent {
  protected readonly store = inject(CalendarStore);
  protected readonly kind = eventKind;
  protected readonly hours = HOURS;
  private readonly scroller = viewChild.required<ElementRef<HTMLElement>>('scroller');

  protected readonly columns = computed(() =>
    this.store.gridDays().map((day) => {
      const events = this.store.eventsOn(day.key);
      return { day, allDay: events.filter((e) => !e.time), items: layoutDay(events) };
    }),
  );

  protected readonly hasAllDay = computed(() => this.columns().some((c) => c.allDay.length));

  constructor() {
    afterNextRender(() => this.scrollToUsefulHour());
  }

  protected weekday = (date: Date) => WEEKDAYS[date.getDay()];
  protected hourLabel = formatHour;
  protected timeLabel = (event: UtsavEvent) => formatTime(event.time);

  protected open(domEvent: Event, event: UtsavEvent): void {
    domEvent.stopPropagation(); // do not also trigger "create at this time"
    this.store.openEvent(event);
  }

  /** Tapping an empty slot starts a new event at that hour. */
  protected createAt(domEvent: MouseEvent, dayKey: string): void {
    const column = domEvent.currentTarget as HTMLElement;
    const { top, height } = column.getBoundingClientRect();
    const hour = Math.min(23, Math.max(0, Math.floor(((domEvent.clientY - top) / height) * 24)));
    this.store.openNew(dayKey, `${String(hour).padStart(2, '0')}:00`);
  }

  /** Start near the current time when today is visible, otherwise at 7 am. */
  private scrollToUsefulHour(): void {
    const el = this.scroller().nativeElement;
    const todayVisible = this.store.gridDays().some((d) => d.key === this.store.todayKey());
    const hour = todayVisible ? Math.max(0, this.store.now().getHours() - 1) : DEFAULT_SCROLL_HOUR;
    el.scrollTop = (el.scrollHeight / 24) * hour;
  }
}
