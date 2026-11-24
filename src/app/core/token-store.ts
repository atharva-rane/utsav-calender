import { SessionUser } from '../models';

const ACCESS_KEY = 'utsav.access';
const REFRESH_KEY = 'utsav.refresh';
const USER_KEY = 'utsav.user';

/** Storage key of the refresh token (other tabs watch it to notice a sign-out). */
export const REFRESH_STORAGE_KEY = REFRESH_KEY;

// Tokens from older versions of the app are useless now; tidy them away.
for (const old of ['guest', 'admin', 'utsav.token']) localStorage.removeItem(old);

/** Seconds until a JWT expires (negative when it already has). Not a signature check. */
function secondsLeft(token: string): number {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(payload)).exp - Date.now() / 1000;
  } catch {
    return -1;
  }
}

/**
 * The session lives in localStorage so people stay signed in across tabs, restarts and days -
 * until they sign out. The short-lived access token goes with every request; the refresh token
 * quietly gets a new one (the server rotates it each time and ends the session on logout).
 */
export const tokenStore = {
  access: (): string | null => localStorage.getItem(ACCESS_KEY),
  refresh: (): string | null => localStorage.getItem(REFRESH_KEY),

  /** True when there is no access token, or it expires within `margin` seconds. */
  accessExpiring(margin = 30): boolean {
    const token = tokenStore.access();
    return !token || secondsLeft(token) < margin;
  },

  user(): SessionUser | null {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY) ?? 'null');
    } catch {
      return null;
    }
  },

  /** Save a session. A missing refresh token means "keep the one we have". */
  set(session: { token: string; refresh_token?: string; user: SessionUser }): void {
    localStorage.setItem(ACCESS_KEY, session.token);
    if (session.refresh_token) localStorage.setItem(REFRESH_KEY, session.refresh_token);
    localStorage.setItem(USER_KEY, JSON.stringify(session.user));
  },

  clear(): void {
    for (const key of [ACCESS_KEY, REFRESH_KEY, USER_KEY]) localStorage.removeItem(key);
  },
};
