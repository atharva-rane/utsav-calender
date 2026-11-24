import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { CalendarStore } from '../core/calendar.store';
import { formatLongDate, formatTime, parseYmd } from '../date-utils';
import { eventKind } from '../event-utils';
import { IconComponent } from '../shared/icon.component';

/**
 * Opens when a date is tapped in the month view. Every utsav of that day is shown with its full
 * details. Your own utsavs have Edit and Delete; the admin's shared ones are read-only, but you
 * can still set your own reminders on them.
 */
@Component({
  selector: 'app-day-sheet',
  standalone: true,
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (dayKey(); as key) {
      <div class="scrim show" (click)="close()"></div>
      <section class="sheet day-sheet" role="dialog" aria-modal="true" [attr.aria-label]="heading()">
        <div class="sheet-bar">
          <div class="sheet-heading">
            <h2 class="sheet-title">{{ heading() }}</h2>
            <small>{{ summary() }}</small>
          </div>
          <button class="icon-btn" (click)="close()" aria-label="Close">
            <app-icon name="close" />
          </button>
        </div>

        <div class="day-list">
          @for (event of events(); track event.id) {
            <article class="ev-card" [class]="'ev-card kind-' + kind(event)">
              <div class="ev-head">
                <h3 class="ev-title">{{ event.title }}</h3>
                <span class="tag" [class]="'tag kind-' + kind(event)">
                  {{ event.shared ? (store.auth.isAdmin() ? 'Shared' : 'From admin') : 'Private' }}
                </span>
              </div>

              <div class="detail-row">
                <app-icon name="clock" />
                <div>{{ time(event.time) || 'All day' }}</div>
              </div>
              @if (event.location) {
                <div class="detail-row">
                  <app-icon name="place" />
                  <div>{{ event.location }}</div>
                </div>
              }
              @if (event.description) {
                <div class="detail-row">
                  <app-icon name="notes" />
                  <div class="pre">{{ event.description }}</div>
                </div>
              }
              @for (group of store.reminderGroupsFor(event.id); track group.date) {
                <div class="detail-row">
                  <app-icon name="bell" />
                  <div>
                    My reminder · {{ shortDate(group.date) }}
                    <small>{{ timesOf(group.items) }}</small>
                  </div>
                </div>
              }

              @if (confirmingId() === event.id) {
                <div class="confirm">
                  <span>Delete this utsav?</span>
                  <button class="btn btn-soft" (click)="confirmingId.set(null)">Cancel</button>
                  <button class="btn btn-danger" (click)="remove(event.id)">Delete</button>
                </div>
              } @else {
                <div class="ev-actions">
                  @if (event.editable) {
                    <button class="btn btn-soft" (click)="store.editEvent(event)">
                      <app-icon name="edit" /> Edit
                    </button>
                    <button class="btn btn-soft danger-text" (click)="confirmingId.set(event.id)">
                      <app-icon name="delete" /> Delete
                    </button>
                  } @else {
                    <button class="btn btn-soft" (click)="store.editEvent(event)">
                      <app-icon name="bell" /> Set reminder
                    </button>
                  }
                </div>
              }
            </article>
          } @empty {
            <p class="empty-note">No utsavs on this day yet.</p>
          }
        </div>

        <button class="btn btn-primary wide" (click)="store.openNew(key)">
          <app-icon name="add" /> Add utsav on this day
        </button>
      </section>
    }
  `,
})
export class DaySheetComponent {
  protected readonly store = inject(CalendarStore);
  protected readonly confirmingId = signal<number | null>(null);

  protected readonly dayKey = this.store.daySheet;
  protected readonly events = computed(() => {
    const key = this.dayKey();
    return key ? this.store.eventsOn(key) : [];
  });
  protected readonly heading = computed(() => {
    const key = this.dayKey();
    return key ? formatLongDate(key) : '';
  });
  protected readonly summary = computed(() => {
    const count = this.events().length;
    return count ? `${count} ${count === 1 ? 'utsav' : 'utsavs'}` : 'Nothing planned';
  });

  protected readonly kind = eventKind;
  protected readonly time = formatTime;
  protected readonly shortDate = (key: string) =>
    parseYmd(key).toLocaleDateString('en', { weekday: 'short', day: 'numeric', month: 'short' });
  protected readonly timesOf = (items: { remind_time: string }[]) =>
    items.map((item) => formatTime(item.remind_time)).join(', ');

  constructor() {
    // Opening another day starts without a pending delete confirmation.
    effect(() => {
      this.dayKey();
      this.confirmingId.set(null);
    });
  }

  protected close(): void {
    this.store.daySheet.set(null);
  }

  protected remove(id: number): void {
    this.confirmingId.set(null);
    this.store.deleteEvent(id);
  }
}
