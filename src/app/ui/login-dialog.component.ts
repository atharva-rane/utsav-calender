import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CalendarStore } from '../core/calendar.store';
import { IconComponent } from '../shared/icon.component';

/** Admin sign-in; shows a "Log out" button instead when already signed in. */
@Component({
  selector: 'app-login-dialog',
  standalone: true,
  imports: [FormsModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.panel() === 'login') {
      <div class="scrim show" (click)="close()"></div>
      <section class="sheet" role="dialog" aria-modal="true" aria-label="Admin login">
        <div class="sheet-bar">
          <button class="icon-btn" (click)="close()" aria-label="Close">
            <app-icon name="close" />
          </button>
          <h2 class="sheet-title">{{ store.auth.isAdmin() ? 'Account' : 'Admin login' }}</h2>
        </div>

        <div class="form">
          @if (store.auth.isAdmin()) {
            <p class="hint">You are signed in as admin and can upload Excel files.</p>
            <button class="btn btn-primary wide" (click)="logout()">Log out</button>
          } @else {
            <label class="stack">
              Email
              <input
                type="email"
                [ngModel]="email()"
                (ngModelChange)="email.set($event)"
                autocomplete="username"
                autocapitalize="none"
                inputmode="email"
              />
            </label>
            <label class="stack">
              Password
              <input
                type="password"
                [ngModel]="password()"
                (ngModelChange)="password.set($event)"
                (keyup.enter)="login()"
                autocomplete="current-password"
              />
            </label>
            @if (error()) {
              <p class="err">{{ error() }}</p>
            }
            <button class="btn btn-primary wide" [disabled]="busy()" (click)="login()">
              Log in
            </button>
          }
        </div>
      </section>
    }
  `,
})
export class LoginDialogComponent {
  protected readonly store = inject(CalendarStore);
  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly error = signal('');
  protected readonly busy = signal(false);

  protected close(): void {
    this.store.panel.set(null);
    this.error.set('');
  }

  protected logout(): void {
    this.store.logout();
    this.close();
  }

  protected async login(): Promise<void> {
    this.busy.set(true);
    try {
      await this.store.login(this.email(), this.password());
      this.password.set('');
      this.close();
    } catch (error) {
      this.error.set(this.store.errorMessage(error, 'Could not sign in'));
    } finally {
      this.busy.set(false);
    }
  }
}
