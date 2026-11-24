import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { SessionUser } from '../models';
import { REFRESH_STORAGE_KEY, tokenStore } from './token-store';

interface Session {
  token: string; // access token (JWT, a few minutes)
  refresh_token?: string; // only present when the server rotated it
  user: SessionUser;
}

export interface Captcha {
  token: string;
  image: string; // data: URL of the picture "7 + 4 = ?"
}

const isRejected = (error: unknown) => {
  const status = (error as HttpErrorResponse)?.status;
  return status === 401 || status === 403;
};

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/auth`;
  /** One refresh at a time, even when several requests notice the expiry together. */
  private refreshing: Promise<boolean> | null = null;

  /** The signed-in person, or null when signed out. */
  readonly user = signal<SessionUser | null>(tokenStore.refresh() ? tokenStore.user() : null);
  /** True only while the very first check runs and nothing is saved on the device. */
  readonly checking = signal(!!tokenStore.refresh() && !tokenStore.user());
  /** Shown on the sign-in screen, e.g. after the admin turned the account off. */
  readonly notice = signal('');

  readonly userId = computed(() => this.user()?.id ?? null);
  readonly isAdmin = computed(() => this.user()?.role === 'admin');
  readonly name = computed(() => this.user()?.full_name || this.user()?.username || '');
  readonly initial = computed(() => this.name().charAt(0).toUpperCase());

  constructor() {
    // Signing out in one tab signs out the others.
    window.addEventListener('storage', (event) => {
      if (event.key === REFRESH_STORAGE_KEY && !event.newValue) this.user.set(null);
    });
  }

  /**
   * Called when the app opens. A saved session is confirmed with the server, so people stay
   * signed in until they sign out. If the server cannot be reached the saved session is kept.
   */
  async restore(): Promise<void> {
    try {
      if (tokenStore.refresh()) await this.refreshSession();
    } catch {
      /* offline: keep the saved session and try again on the next request */
    } finally {
      this.checking.set(false);
    }
  }

  /** The access token to send, renewed first if it is missing or about to expire. */
  async accessToken(): Promise<string | null> {
    if (tokenStore.accessExpiring() && tokenStore.refresh()) {
      try {
        await this.refreshSession();
      } catch {
        /* network trouble: the request goes out and fails on its own */
      }
    }
    return tokenStore.access();
  }

  /**
   * Swap the refresh token for a new access token. Resolves false when the server no longer
   * accepts the session (and signs out locally); throws on network errors.
   * `rejected` is the access token the server just refused: if another request already
   * replaced it there is nothing more to do.
   */
  refreshSession(rejected?: string | null): Promise<boolean> {
    if (rejected && tokenStore.access() !== rejected) return Promise.resolve(true);
    this.refreshing ??= this.doRefresh().finally(() => (this.refreshing = null));
    return this.refreshing;
  }

  private async doRefresh(): Promise<boolean> {
    const refreshToken = tokenStore.refresh();
    if (!refreshToken) return false;
    try {
      this.save(
        await firstValueFrom(
          this.http.post<Session>(`${this.url}/refresh`, { refresh_token: refreshToken }),
        ),
      );
      return true;
    } catch (error) {
      if (!isRejected(error)) throw error;
      this.expire();
      return false;
    }
  }

  captcha(): Promise<Captcha> {
    return firstValueFrom(this.http.get<Captcha>(`${this.url}/captcha`));
  }

  async login(
    username: string,
    password: string,
    captcha: { token: string; answer: string },
  ): Promise<void> {
    const session = await firstValueFrom(
      this.http.post<Session>(`${this.url}/login`, {
        username,
        password,
        captcha_token: captcha.token,
        captcha_answer: captcha.answer,
      }),
    );
    this.notice.set('');
    this.save(session);
  }

  async changePassword(current: string, next: string): Promise<void> {
    this.save(
      await firstValueFrom(
        this.http.post<Session>(`${this.url}/password`, {
          current_password: current,
          new_password: next,
        }),
      ),
    );
  }

  /** Sign out of this device. The server ends the session so its tokens stop working. */
  logout(): void {
    const refresh_token = tokenStore.refresh();
    this.notice.set('');
    this.clear();
    if (refresh_token) this.http.post(`${this.url}/logout`, { refresh_token }).subscribe({ error: () => {} });
  }

  /** Sign out of every device. */
  async logoutEverywhere(): Promise<void> {
    await firstValueFrom(this.http.post(`${this.url}/logout-all`, {}));
    this.notice.set('');
    this.clear();
  }

  /** The server says the session is over (account removed or turned off, or signed out elsewhere). */
  expire(): void {
    if (!this.user()) return this.clear();
    this.notice.set('Your session has ended. Please sign in again.');
    this.clear();
  }

  private save(session: Session): void {
    tokenStore.set(session);
    this.user.set(session.user);
  }

  private clear(): void {
    tokenStore.clear();
    this.user.set(null);
  }
}
