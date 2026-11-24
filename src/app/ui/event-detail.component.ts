import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { CalendarStore } from '../core/calendar.store';
import { formatLongDate, formatTime } from '../date-utils';
import { IconComponent } from '../shared/icon.component';

/** Details sheet shown when an utsav is tapped in Schedule, Day, Week or search results. */
@Component({
  selector: 'app-event-detail',
  standalone: true,
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.selected(); as event) {
      <div class="scrim show" (click)="close()"></div>
      <section class="sheet" role="dialog" aria-modal="true" [attr.aria-label]="event.title">
        <div class="sheet-bar">
          <button class="icon-btn" (click)="close()" aria-label="Close">
            <app-icon name="close" />
          </button>
          <span class="spacer"></span>
          @if (event.editable) {
            <button class="icon-btn" (click)="store.editSelected()" aria-label="Edit">
              <app-icon name="edit" />
            </button>
            <button class="icon-btn" (click)="confirming.set(true)" aria-label="Delete">
              <app-icon name="delete" />
            </button>
          } @else {
            <button class="btn btn-soft small" (click)="store.editSelected()">
              <app-icon name="bell" /> Set reminder
            </button>
          }
        </div>

        @if (confirming()) {
          <div class="confirm">
            <span>Delete this utsav?</span>
            <button class="btn btn-soft" (click)="confirming.set(false)">Cancel</button>
            <button class="btn btn-danger" (click)="store.deleteEvent(event.id)">Delete</button>
          </div>
        }

        <h2 class="detail-title">{{ event.title }}</h2>
        <p class="detail-tag">
          <span [class]="'tag kind-' + (event.shared ? 'shared' : 'mine')">
            {{ event.shared ? (store.auth.isAdmin() ? 'Shared with all users' : 'From admin') : 'Private to you' }}
          </span>
        </p>

        <div class="detail-row">
          <app-icon name="clock" />
          <div>
            {{ longDate(event.date) }}
            <small>{{ time(event.time) || 'All day' }}</small>
          </div>
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

        @for (group of groups(); track group.date) {
          <div class="detail-row">
            <app-icon name="bell" />
            <div>
              My reminder · {{ longDate(group.date) }}
              <small>{{ timesOf(group.items) }}</small>
            </div>
            <button
              class="icon-btn small"
              (click)="store.deleteReminderDate(event.id, group.date)"
              aria-label="Remove this reminder date"
            >
              <app-icon name="close" />
            </button>
          </div>
        }
      </section>
    }
  `,
})
export class EventDetailComponent {
  protected readonly store = inject(CalendarStore);
  protected readonly confirming = signal(false);

  protected readonly groups = computed(() =>
    this.store.reminderGroupsFor(this.store.selected()?.id),
  );

  protected readonly longDate = formatLongDate;
  protected readonly time = formatTime;
  protected readonly timesOf = (items: { remind_time: string }[]) =>
    items.map((item) => formatTime(item.remind_time)).join(', ');

  constructor() {
    // Always start a newly opened sheet without the delete confirmation.
    effect(() => {
      this.store.selected();
      this.confirming.set(false);
    });
  }

  protected close(): void {
    this.store.selected.set(null);
  }
}
