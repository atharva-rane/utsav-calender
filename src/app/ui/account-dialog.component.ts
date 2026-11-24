import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CalendarStore } from '../core/calendar.store';
import { IconComponent } from '../shared/icon.component';

/** Who is signed in, change password, and sign out. (Signing in happens on the first screen.) */
@Component({
  selector: 'app-account-dialog',
  standalone: true,
  imports: [FormsModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.panel() === 'account') {
      <div class="scrim show" (click)="close()"></div>
      <section class="sheet" role="dialog" aria-modal="true" aria-label="Account">
        <div class="sheet-bar">
          <h2 class="sheet-title">Account</h2>
          <span class="spacer"></span>
          <button class="icon-btn" (click)="close()" aria-label="Close">
            <app-icon name="close" />
          </button>
        </div>

        <div class="form">
          <div class="profile">
            <span class="avatar big" [class.admin]="store.auth.isAdmin()">
              {{ store.auth.initial() }}
            </span>
            <div>
              <b>{{ store.auth.name() }}</b>
              <small>
                &#64;{{ store.auth.user()?.username }} ·
                {{ store.auth.isAdmin() ? 'Admin' : 'Member' }}
              </small>
            </div>
          </div>

          @if (changing()) {
            <label class="stack">
              Current password
              <input
                type="password"
                [ngModel]="current()"
                (ngModelChange)="current.set($event)"
                autocomplete="current-password"
              />
            </label>
            <label class="stack">
              New password (at least 8 characters)
              <input
                type="password"
                [ngModel]="next()"
                (ngModelChange)="next.set($event)"
                (keyup.enter)="savePassword()"
                autocomplete="new-password"
              />
            </label>
            @if (error()) {
              <p class="err" role="alert">{{ error() }}</p>
            }
            <div class="btn-row">
              <button class="btn btn-soft" (click)="stopChanging()">Cancel</button>
              <button class="btn btn-primary" [disabled]="busy()" (click)="savePassword()">
                Save password
              </button>
            </div>
          } @else {
            <button class="btn btn-soft wide" (click)="changing.set(true)">
              <app-icon name="lock" /> Change password
            </button>
            <button class="btn btn-primary wide" (click)="logout()">
              <app-icon name="logout" /> Sign out
            </button>
            <button class="link center" (click)="logoutEverywhere()">Sign out of all devices</button>
            <p class="hint">You stay signed in on this device until you sign out.</p>
          }
        </div>
      </section>
    }
  `,
})
export class AccountDialogComponent {
  protected readonly store = inject(CalendarStore);
  protected readonly changing = signal(false);
  protected readonly current = signal('');
  protected readonly next = signal('');
  protected readonly error = signal('');
  protected readonly busy = signal(false);

  protected close(): void {
    this.store.panel.set(null);
    this.stopChanging();
  }

  protected stopChanging(): void {
    this.changing.set(false);
    this.current.set('');
    this.next.set('');
    this.error.set('');
  }

  protected logout(): void {
    this.close();
    this.store.logout();
  }

  protected async logoutEverywhere(): Promise<void> {
    try {
      await this.store.auth.logoutEverywhere();
    } catch (error) {
      this.store.fail(error);
    }
  }

  protected async savePassword(): Promise<void> {
    if (this.next().length < 8) return this.error.set('New password must be at least 8 characters.');
    this.busy.set(true);
    try {
      await this.store.auth.changePassword(this.current(), this.next());
      this.store.say('Password changed');
      this.close();
    } catch (error) {
      this.error.set(this.store.errorMessage(error, 'Could not change the password'));
    } finally {
      this.busy.set(false);
    }
  }
}
