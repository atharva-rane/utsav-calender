import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { AuthService } from '../core/auth.service';
import { IconComponent } from '../shared/icon.component';

/** The first screen: everyone signs in here, with a username, password and an addition captcha. */
@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="login">
      <form class="login-card" (ngSubmit)="submit()" novalidate>
        <span class="brand-mark"><app-icon name="event" /></span>
        <h1 class="login-title">Utsav Calendar</h1>
        <p class="login-sub">Sign in to see and manage utsavs.</p>

        @if (auth.notice()) {
          <p class="notice" role="status">{{ auth.notice() }}</p>
        }

        <label class="stack">
          Username
          <input
            name="username"
            [ngModel]="username()"
            (ngModelChange)="username.set($event)"
            autocomplete="username"
            autocapitalize="none"
            spellcheck="false"
            required
          />
        </label>

        <label class="stack">
          Password
          <span class="with-action">
            <input
              name="password"
              [type]="showPassword() ? 'text' : 'password'"
              [ngModel]="password()"
              (ngModelChange)="password.set($event)"
              autocomplete="current-password"
              required
            />
            <button
              type="button"
              class="icon-btn small"
              (click)="showPassword.set(!showPassword())"
              [attr.aria-label]="showPassword() ? 'Hide password' : 'Show password'"
            >
              <app-icon [name]="showPassword() ? 'visibility_off' : 'visibility'" />
            </button>
          </span>
        </label>

        <div class="captcha">
          <span class="captcha-label" id="captcha-label">Solve the sum</span>
          <div class="captcha-row">
            <span class="captcha-image">
              @if (captchaImage(); as image) {
                <img [src]="image" width="190" height="60" alt="Addition puzzle: add the two numbers" />
              } @else {
                <span class="captcha-wait">Loading…</span>
              }
            </span>
            <button
              type="button"
              class="icon-btn small"
              (click)="loadCaptcha()"
              aria-label="Show a different sum"
            >
              <app-icon name="refresh" />
            </button>
          </div>
          <input
            class="captcha-input"
            name="captcha"
            [ngModel]="answer()"
            (ngModelChange)="answer.set($event)"
            inputmode="numeric"
            autocomplete="off"
            placeholder="Your answer"
            aria-labelledby="captcha-label"
            required
          />
        </div>

        @if (error()) {
          <p class="err" role="alert">{{ error() }}</p>
        }

        <button class="btn btn-primary wide" type="submit" [disabled]="busy()">
          {{ busy() ? 'Signing in…' : 'Sign in' }}
        </button>

        <p class="signature">|| Ambadnya || Nathsamvidh ||</p>
      </form>
    </div>
  `,
})
export class LoginComponent implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly sanitizer = inject(DomSanitizer);

  protected readonly username = signal('');
  protected readonly password = signal('');
  protected readonly answer = signal('');
  protected readonly showPassword = signal(false);
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected readonly captchaImage = signal<SafeUrl | null>(null);
  private captchaToken = '';

  ngOnInit(): void {
    void this.loadCaptcha();
  }

  protected async loadCaptcha(): Promise<void> {
    this.answer.set('');
    this.captchaImage.set(null);
    try {
      const captcha = await this.auth.captcha();
      this.captchaToken = captcha.token;
      // The picture is an SVG made by our own server, so it is safe to show as an image.
      this.captchaImage.set(this.sanitizer.bypassSecurityTrustUrl(captcha.image));
    } catch {
      this.error.set('Cannot reach the server. Check your connection and try again.');
    }
  }

  protected async submit(): Promise<void> {
    if (this.busy()) return;
    if (!this.username().trim() || !this.password()) {
      return this.error.set('Enter your username and password.');
    }
    if (!this.answer().trim()) return this.error.set('Solve the sum to continue.');

    this.busy.set(true);
    this.error.set('');
    try {
      await this.auth.login(this.username().trim(), this.password(), {
        token: this.captchaToken,
        answer: this.answer().trim(),
      });
    } catch (error) {
      const message = (error as { error?: { error?: string } })?.error?.error;
      this.error.set(message ?? 'Cannot reach the server. Check your connection and try again.');
      if ((error as HttpErrorResponse)?.status === 401) this.password.set('');
      await this.loadCaptcha(); // every captcha works for one attempt only
    } finally {
      this.busy.set(false);
    }
  }
}
