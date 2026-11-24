import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CalendarStore } from '../core/calendar.store';
import { IconComponent } from '../shared/icon.component';

/** The signed-in user's own list of people who receive the reminders that user sets. */
@Component({
  selector: 'app-reminder-emails',
  standalone: true,
  imports: [FormsModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.panel() === 'recipients') {
      <div class="scrim show" (click)="close()"></div>
      <section class="sheet" role="dialog" aria-modal="true" aria-label="Reminder emails">
        <div class="sheet-bar">
          <h2 class="sheet-title">Reminder emails</h2>
          <span class="spacer"></span>
          <button class="icon-btn" (click)="close()" aria-label="Close">
            <app-icon name="close" />
          </button>
        </div>

        <div class="form">
          <p class="hint">
            Reminders you set are emailed to these addresses. This list is only yours; other users
            keep their own.
          </p>
          <textarea
            class="box"
            rows="2"
            [ngModel]="emails()"
            (ngModelChange)="emails.set($event)"
            placeholder="Add emails, separated by commas or spaces"
            aria-label="Email addresses to add"
            autocapitalize="none"
            autocomplete="off"
            inputmode="email"
          ></textarea>
          <button class="btn btn-primary wide" (click)="add()">Add emails</button>

          <div class="chips">
            @for (recipient of store.recipients(); track recipient.id) {
              <span class="chip">
                {{ recipient.email }}
                <button
                  (click)="store.deleteRecipient(recipient.id)"
                  [attr.aria-label]="'Remove ' + recipient.email"
                >
                  ×
                </button>
              </span>
            } @empty {
              <p class="hint">No emails yet.</p>
            }
          </div>
        </div>
      </section>
    }
  `,
})
export class ReminderEmailsComponent {
  protected readonly store = inject(CalendarStore);
  protected readonly emails = signal('');

  protected close(): void {
    this.store.panel.set(null);
  }

  protected async add(): Promise<void> {
    const list = this.emails()
      .split(/[\s,;]+/)
      .filter(Boolean);
    if (!list.length) return;
    try {
      await this.store.addRecipients(list);
      this.emails.set('');
      this.store.say('Emails saved');
    } catch (error) {
      this.store.fail(error);
    }
  }
}
