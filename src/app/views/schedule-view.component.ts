import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  viewChild,
} from '@angular/core';
import { CalendarStore } from '../core/calendar.store';
import { WEEKDAYS, formatTime, startOfMonth } from '../date-utils';
import { eventKind } from '../event-utils';
import { UtsavEvent } from '../models';
import { buildSchedule } from './schedule-builder';

@Component({
  selector: 'app-schedule-view',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="sched" #scroller>
      @for (month of months(); track month.key) {
        <div class="banner" [attr.data-season]="month.season">
          <h3>{{ month.title }}</h3>
        </div>

        @for (week of month.weeks; track week.key) {
          @if (week.days.length) {
            <p class="week-label">{{ week.label }}</p>

            @for (day of week.days; track day.key) {
              <div class="s-day">
                <button
                  class="s-date"
                  [class.today]="day.key === store.todayKey()"
                  (click)="store.goDay(day.date)"
                  [attr.aria-label]="'Open ' + day.key + ' in day view'"
                >
                  <small>{{ weekday(day.date) }}</small>
                  <b>{{ day.date.getDate() }}</b>
                </button>

                <div class="s-events">
                  @for (event of day.events; track event.id) {
                    <button [class]="'s-pill kind-' + kind(event)" (click)="store.openEvent(event)">
                      <span class="s-title">{{ event.title }}</span>
                      @if (details(event); as text) {
                        <small>{{ text }}</small>
                      }
                    </button>
                  }
                </div>
              </div>
            }
          }
        } @empty {
          <p class="empty-note">No weeks to show.</p>
        }
        @if (!month.count) {
          <p class="empty-note slim">No utsavs this month.</p>
        }
      }
      <div class="sentinel" #sentinel></div>
    </div>
  `,
})
export class ScheduleViewComponent {
  protected readonly store = inject(CalendarStore);
  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');
  private readonly sentinel = viewChild.required<ElementRef<HTMLElement>>('sentinel');

  protected readonly months = computed(() =>
    buildSchedule(
      startOfMonth(this.store.cursor()),
      this.store.scheduleMonths(),
      this.store.eventsByDay(),
    ),
  );

  constructor() {
    const destroyRef = inject(DestroyRef);

    // Infinite scroll: add three more months whenever the end of the list comes into view.
    afterNextRender(() => {
      const observer = new IntersectionObserver(
        ([entry]) => entry.isIntersecting && this.store.loadMoreSchedule(),
        { root: this.scroller()?.nativeElement, rootMargin: '600px' },
      );
      observer.observe(this.sentinel().nativeElement);
      destroyRef.onDestroy(() => observer.disconnect());
    });

    // Jumping to another month starts the list from the top.
    effect(() => {
      this.store.cursor();
      this.scroller()?.nativeElement.scrollTo({ top: 0 });
    });
  }

  protected readonly kind = eventKind;
  protected weekday = (date: Date) => WEEKDAYS[date.getDay()];

  /** Second line of a pill: "6:30 pm · Juhu Beach". */
  protected details(event: UtsavEvent): string {
    return [formatTime(event.time), event.location].filter(Boolean).join(' · ');
  }
}
