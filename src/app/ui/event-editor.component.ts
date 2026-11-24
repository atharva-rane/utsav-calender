import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CalendarStore } from '../core/calendar.store';
import { formatLongDate, formatTime, parseYmd } from '../date-utils';
import { EventDraft, ReminderDraft } from '../models';
import { IconComponent } from '../shared/icon.component';
import { ReminderPickerComponent } from './reminder-picker.component';

const DEFAULT_TIME = '09:00';
/** One-tap start times for the utsav itself. */
const QUICK_TIMES = ['06:00', '09:00', '12:00', '18:00'];

/**
 * Full-screen form on phones, centred dialog on larger screens.
 * For an admin's shared utsav (read-only for users) it only shows the details and lets the
 * person set their own reminders.
 */
@Component({
  selector: 'app-event-editor',
  standalone: true,
  imports: [FormsModule, IconComponent, ReminderPickerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.draft(); as d) {
      @let locked = d.id !== undefined && d.editable === false;
      <div class="scrim show" (click)="close()"></div>
      <section class="sheet full" role="dialog" aria-modal="true" aria-label="Utsav editor">
        <div class="sheet-bar">
          <button class="icon-btn" (click)="close()" aria-label="Close">
            <app-icon name="close" />
          </button>
          <h2 class="sheet-title">
            {{ locked ? 'Set reminders' : d.id ? 'Edit utsav' : 'New utsav' }}
          </h2>
          <span class="spacer"></span>
          <button class="btn btn-primary" [disabled]="saving()" (click)="save(d)">
            {{ locked ? 'Save reminders' : 'Save' }}
          </button>
        </div>

        <div class="form">
          @if (locked) {
            <div class="ro-card kind-shared">
              <h3>{{ d.title }}</h3>
              <p>
                {{ longDate(d.date) }}{{ d.time ? ' · ' + time(d.time) : '' }}
              </p>
              @if (d.location) {
                <p>{{ d.location }}</p>
              }
              <small>
                <app-icon name="lock" /> Published by the admin. You cannot change it, but the
                reminders below are yours alone.
              </small>
            </div>
          } @else {
            <input
              class="title-input"
              [(ngModel)]="d.title"
              placeholder="Add title"
              maxlength="200"
              autocomplete="off"
              enterkeyhint="next"
            />

            <label class="field">
              <app-icon name="event" />
              <input type="date" [(ngModel)]="d.date" aria-label="Date" />
            </label>

            <label class="field">
              <app-icon name="clock" />
              <span class="grow">All day</span>
              <input
                type="checkbox"
                class="switch"
                [checked]="!d.time"
                (change)="toggleAllDay(d, $event)"
              />
            </label>

            @if (d.time) {
              <div class="field time-field">
                <span class="icon-gap"></span>
                <input type="time" [(ngModel)]="d.time" aria-label="Time" />
                <div class="slots tight" role="group" aria-label="Quick times">
                  @for (slot of quickTimes; track slot) {
                    <button
                      type="button"
                      class="slot"
                      [class.on]="d.time === slot"
                      (click)="d.time = slot"
                    >
                      {{ time(slot) }}
                    </button>
                  }
                </div>
              </div>
            }

            <label class="field">
              <app-icon name="place" />
              <input [(ngModel)]="d.location" placeholder="Add location" autocomplete="off" />
            </label>

            <label class="field top">
              <app-icon name="notes" />
              <textarea rows="3" [(ngModel)]="d.description" placeholder="Add description"></textarea>
            </label>

            @if (store.auth.isAdmin()) {
              <label class="field switch-row">
                <app-icon name="group" />
                <span class="grow">
                  Show to all users
                  <small>
                    {{
                      d.shared !== false
                        ? 'Every user sees this utsav (read-only).'
                        : 'Private: only you can see it.'
                    }}
                  </small>
                </span>
                <input
                  type="checkbox"
                  class="switch"
                  [checked]="d.shared !== false"
                  (change)="d.shared = $any($event.target).checked"
                />
              </label>
            } @else {
              <p class="privacy-note">
                <app-icon name="lock" /> Private: only you can see this utsav.
              </p>
            }
          }

          <!-- ============ Email reminders ============ -->
          <div class="field-group">
            <div class="field-head"><app-icon name="bell" /> Email reminders</div>
            <p class="hint tight">
              Sent to
              <button type="button" class="link" (click)="store.panel.set('recipients')">
                your reminder list ({{ store.recipients().length }})
              </button>
              only. Other users never see your reminders.
            </p>

            @for (group of store.reminderGroupsFor(d.id); track group.date) {
              <div class="rem-saved">
                <b>{{ shortDate(group.date) }}</b>
                <span class="rem-times">
                  @for (item of group.items; track item.id) {
                    <span class="chip" [class.done]="item.status !== 'pending'">
                      @if (item.status === 'sent') {
                        <app-icon name="check" />
                      }
                      {{ time(item.remind_time) }}
                      <button
                        type="button"
                        (click)="store.deleteReminder(item.id)"
                        [attr.aria-label]="'Remove ' + time(item.remind_time)"
                      >
                        ×
                      </button>
                    </span>
                  }
                </span>
              </div>
            }

            <app-reminder-picker [eventDate]="d.date" [taken]="takenDates(d)" [(rows)]="rows" />

            @if (rows().length && !store.recipients().length) {
              <p class="warn" role="status">
                Your reminder list is empty, so no emails would go out yet.
                <button type="button" class="link" (click)="store.panel.set('recipients')">
                  Add emails
                </button>
              </p>
            }
          </div>
        </div>
      </section>
    }
  `,
})
export class EventEditorComponent {
  protected readonly store = inject(CalendarStore);
  protected readonly saving = signal(false);
  /** New reminder dates and times chosen in the picker during this editing session. */
  protected readonly rows = signal<ReminderDraft[]>([]);
  protected readonly quickTimes = QUICK_TIMES;

  protected readonly time = formatTime;
  protected readonly longDate = formatLongDate;
  protected readonly shortDate = (key: string) =>
    parseYmd(key).toLocaleDateString('en', { weekday: 'short', day: 'numeric', month: 'short' });

  constructor() {
    // Every time the editor opens, start with no new reminder dates.
    effect(() => {
      this.store.draft();
      this.rows.set([]);
    });
  }

  protected close(): void {
    this.store.closeEditor();
  }

  protected takenDates(draft: EventDraft): string[] {
    return this.store.reminderGroupsFor(draft.id).map((group) => group.date);
  }

  protected toggleAllDay(draft: EventDraft, domEvent: Event): void {
    const allDay = (domEvent.target as HTMLInputElement).checked;
    draft.time = allDay ? '' : DEFAULT_TIME;
  }

  // ---------- saving ----------

  /** Reminder dates that are filled in, or a message explaining what is missing. */
  private reminderRows(): { rows: ReminderDraft[]; problem?: string } {
    const today = this.store.todayKey();
    const nowTime = this.clock();
    const rows: ReminderDraft[] = [];

    for (const row of this.rows()) {
      if (!row.times.length) {
        return { rows, problem: `Pick at least one time for ${this.shortDate(row.date)}` };
      }
      if (row.date === today && row.times.some((t) => t <= nowTime)) {
        return { rows, problem: 'A reminder time today has already passed. Pick a later time.' };
      }
      rows.push(row);
    }
    return { rows };
  }

  private clock(): string {
    const now = this.store.now();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  }

  protected async save(draft: EventDraft): Promise<void> {
    const readOnly = draft.id !== undefined && draft.editable === false;
    if (!readOnly) {
      if (!draft.title.trim()) return this.store.say('Add a title first');
      if (!draft.date) return this.store.say('Pick a date');
    }

    const { rows, problem } = this.reminderRows();
    if (problem) return this.store.say(problem);
    if (readOnly && !rows.length) return this.store.say('Choose a reminder date first');

    const wasEdit = !!draft.id; // saveEvent gives a new utsav its id, so read this first
    this.saving.set(true);
    try {
      await this.store.saveEvent(draft, rows);
      this.store.closeEditor(draft.date);
      this.store.say(readOnly ? 'Reminders saved' : wasEdit ? 'Utsav saved' : 'Utsav added');
    } catch (error) {
      this.store.fail(error);
    } finally {
      this.saving.set(false);
    }
  }
}
