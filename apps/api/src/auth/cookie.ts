import { REFRESH_COOKIE_NAME } from './auth.constants.js';
import { loadEnvironment } from '../config/environment.js';

type CookieResponse = {
  setHeader(name: string, value: string | string[]): void;
};

export function getRefreshTokenFromCookie(
  cookieHeader: string | string[] | undefined,
): string | null {
  const header = Array.isArray(cookieHeader) ? cookieHeader.join('; ') : cookieHeader;
  if (!header) {
    return null;
  }

  const cookies = header.split(';').map((cookie) => cookie.trim());
  const prefix = `${REFRESH_COOKIE_NAME}=`;
  const refreshCookie = cookies.find((cookie) => cookie.startsWith(prefix));

  return refreshCookie ? decodeURIComponent(refreshCookie.slice(prefix.length)) : null;
}

export function setRefreshCookie(
  response: CookieResponse,
  refreshToken: string,
  expiresAt: Date,
): void {
  const environment = loadEnvironment();
  const secure = environment.AUTH_COOKIE_SECURE ?? environment.NODE_ENV === 'production';
  response.setHeader('Set-Cookie', [
    `${REFRESH_COOKIE_NAME}=${encodeURIComponent(refreshToken)}; Path=/auth; HttpOnly; SameSite=Strict; Expires=${expiresAt.toUTCString()}${secure ? '; Secure' : ''}`,
  ]);
}

export function clearRefreshCookie(response: CookieResponse): void {
  const environment = loadEnvironment();
  const secure = environment.AUTH_COOKIE_SECURE ?? environment.NODE_ENV === 'production';
  response.setHeader('Set-Cookie', [
    `${REFRESH_COOKIE_NAME}=; Path=/auth; HttpOnly; SameSite=Strict; Max-Age=0${secure ? '; Secure' : ''}`,
  ]);
}
