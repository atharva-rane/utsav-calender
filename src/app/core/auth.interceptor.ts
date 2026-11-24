import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

/** Sign-in endpoints work without a token and must never trigger a refresh. */
const PUBLIC_ENDPOINT = /\/auth\/(login|refresh|captcha|logout)$/;

/**
 * Adds the access token to every API call. A token that is about to expire is renewed first; if
 * the server still answers 401, the app refreshes once and retries. If the refresh is refused
 * too, the session is over and the person goes back to the sign-in screen.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(environment.apiUrl) || PUBLIC_ENDPOINT.test(req.url)) return next(req);

  const auth = inject(AuthService);
  const send = (token: string | null) =>
    next(token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req);

  return from(auth.accessToken()).pipe(
    switchMap((token) =>
      send(token).pipe(
        catchError((error) => {
          if (error?.status !== 401) return throwError(() => error);
          return from(auth.refreshSession(token)).pipe(
            switchMap((renewed) =>
              renewed ? from(auth.accessToken()).pipe(switchMap(send)) : throwError(() => error),
            ),
          );
        }),
      ),
    ),
  );
};
