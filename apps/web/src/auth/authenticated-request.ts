import { AuthResponseSchema, type AuthenticatedUser, type AuthResponse } from '@hire-me/contracts';

/**
 * The web client's one authenticated request core (Issue #202).
 *
 * Access tokens are short-lived and rotate through `POST /auth/refresh`, which
 * also rotates the refresh cookie and revokes the whole session family when a
 * consumed refresh token is presented again. Two refreshes racing from one
 * browser therefore sign the user out, so every refresh in the web client goes
 * through the single-flight promise below.
 *
 * The session lives in module memory only: no token ever reaches web storage
 * or a log line. Callers keep passing the access token they were given at sign
 * in; while that token belongs to the current session this core sends the
 * latest rotated token instead. React state can therefore keep one stable
 * token per session, and a background rotation does not re-run every effect
 * that depends on it.
 *
 * A 401 from a module endpoint comes from the API's authentication guard,
 * before any handler runs, so replaying the request once after a successful
 * refresh cannot apply a write twice. Exactly one retry is made; a second 401,
 * a 403, a 429 or any other status is returned to the caller untouched.
 */

export type AuthSessionEvent =
  | { type: 'refreshed'; user: AuthenticatedUser }
  | { type: 'ended'; reason: 'expired' | 'user-changed' };

export type RefreshOutcome =
  /** A new access token was issued and the session (if any) now uses it. */
  | { status: 'refreshed'; auth: AuthResponse }
  /** The refresh cookie is missing, invalid, expired or revoked. Terminal. */
  | { status: 'rejected' }
  /** Rate limited, server or network failure. The session is kept. */
  | { status: 'unavailable' }
  /** The session ended or was replaced while the refresh was in flight. */
  | { status: 'superseded' };

type SessionState = {
  /** Bumped whenever a session starts or ends; stale work compares against it. */
  epoch: number;
  accessToken: string | null;
  userId: string | null;
  /** Every access token issued to this session, so callers holding an older one are recognized. */
  issuedTokens: Set<string>;
};

let session: SessionState = emptySession(0);
let inFlightRefresh: { epoch: number; promise: Promise<RefreshOutcome> } | null = null;
const listeners = new Set<(event: AuthSessionEvent) => void>();

function emptySession(epoch: number): SessionState {
  return { epoch, accessToken: null, userId: null, issuedTokens: new Set() };
}

/** Starts a new session from a login or a restored refresh, replacing any earlier one. */
export function startAuthSession(auth: AuthResponse): void {
  session = {
    epoch: session.epoch + 1,
    accessToken: auth.accessToken,
    userId: auth.user.id,
    issuedTokens: new Set([auth.accessToken]),
  };
  inFlightRefresh = null;
}

/**
 * Forgets the session locally. Requests still in flight keep their responses
 * but can no longer refresh or retry, and a pending refresh result is ignored.
 */
export function endAuthSession(): void {
  session = emptySession(session.epoch + 1);
  inFlightRefresh = null;
}

/** The latest access token of the current session, or null when signed out. */
export function getAuthSessionAccessToken(): string | null {
  return session.accessToken;
}

export function subscribeAuthSession(listener: (event: AuthSessionEvent) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emit(event: AuthSessionEvent): void {
  for (const listener of [...listeners]) {
    listener(event);
  }
}

function endAuthSessionAndNotify(reason: 'expired' | 'user-changed'): void {
  endAuthSession();
  emit({ type: 'ended', reason });
}

async function requestRefresh(apiBaseUrl: string): Promise<RefreshOutcome> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
  } catch {
    return { status: 'unavailable' };
  }

  if (response.status === 401 || response.status === 403) {
    return { status: 'rejected' };
  }
  if (!response.ok) {
    return { status: 'unavailable' };
  }

  try {
    return { status: 'refreshed', auth: AuthResponseSchema.parse(await response.json()) };
  } catch {
    return { status: 'unavailable' };
  }
}

function settleRefresh(epoch: number, outcome: RefreshOutcome): RefreshOutcome {
  if (session.epoch !== epoch) {
    return { status: 'superseded' };
  }

  if (outcome.status === 'refreshed') {
    const { auth } = outcome;
    if (session.userId !== null && session.userId !== auth.user.id) {
      // The refresh cookie now belongs to someone else (for example a sign in
      // from another tab). Never carry this session's screens over to them.
      endAuthSessionAndNotify('user-changed');
      return { status: 'rejected' };
    }
    session.accessToken = auth.accessToken;
    session.userId = auth.user.id;
    session.issuedTokens.add(auth.accessToken);
    emit({ type: 'refreshed', user: auth.user });
    return outcome;
  }

  if (outcome.status === 'rejected' && session.accessToken !== null) {
    endAuthSessionAndNotify('expired');
  }
  return outcome;
}

/**
 * Refreshes the access token, sharing one request between every caller that
 * asks while it is pending. Its outcome is applied to the session once, so a
 * terminal failure ends the session (and notifies subscribers) exactly once.
 */
export function refreshAuthSession(apiBaseUrl: string): Promise<RefreshOutcome> {
  if (inFlightRefresh && inFlightRefresh.epoch === session.epoch) {
    return inFlightRefresh.promise;
  }

  const epoch = session.epoch;
  const promise = requestRefresh(apiBaseUrl)
    .then((outcome) => settleRefresh(epoch, outcome))
    .finally(() => {
      if (inFlightRefresh?.promise === promise) {
        inFlightRefresh = null;
      }
    });
  inFlightRefresh = { epoch, promise };
  return promise;
}

/**
 * Restores a session from the refresh cookie on page load. Concurrent callers
 * (React StrictMode runs mount effects twice) share the one refresh request.
 */
export async function restoreAuthSession(apiBaseUrl: string): Promise<AuthResponse | null> {
  const outcome = await refreshAuthSession(apiBaseUrl);
  return outcome.status === 'refreshed' ? outcome.auth : null;
}

/**
 * Whether a request body can be sent a second time unchanged. A stream is read
 * by the first attempt, so a request carrying one is never replayed.
 */
export function isReplayableBody(body: RequestInit['body']): boolean {
  return (
    body === undefined ||
    body === null ||
    typeof body === 'string' ||
    body instanceof URLSearchParams ||
    body instanceof Blob ||
    body instanceof FormData ||
    body instanceof ArrayBuffer ||
    ArrayBuffer.isView(body)
  );
}

/**
 * Returns `init` with its Authorization header set to `accessToken`, keeping
 * the caller's header container (Headers or a plain record) and every other
 * field — method, body, signal, credentials — as given.
 */
function withBearer(init: RequestInit, accessToken: string): RequestInit {
  const authorization = `Bearer ${accessToken}`;
  const { headers } = init;

  if (headers instanceof Headers || Array.isArray(headers)) {
    const next = new Headers(headers);
    next.set('Authorization', authorization);
    return { ...init, headers: next };
  }

  const record = Object.fromEntries(
    Object.entries(headers ?? {}).filter(([name]) => name.toLowerCase() !== 'authorization'),
  );
  return { ...init, headers: { ...record, Authorization: authorization } };
}

function tokenForRequest(callerToken: string, epoch: number, ownedBySession: boolean): string {
  return ownedBySession && session.epoch === epoch && session.accessToken !== null
    ? session.accessToken
    : callerToken;
}

async function tokenAfterRejection(
  rejectedToken: string,
  epoch: number,
  apiBaseUrl: string,
): Promise<string | null> {
  if (session.epoch !== epoch || session.accessToken === null) {
    return null;
  }
  // Another request already rotated the token while this one was in flight.
  if (session.accessToken !== rejectedToken) {
    return session.accessToken;
  }

  const outcome = await refreshAuthSession(apiBaseUrl);
  return outcome.status === 'refreshed' && session.epoch === epoch ? session.accessToken : null;
}

/**
 * Sends an authenticated request, recovering once from an expired access
 * token.
 *
 * `accessToken` is the token the caller holds. When it was issued to the
 * current session the latest token is sent instead, a 401 triggers the shared
 * refresh, and the request is replayed exactly once with the new token. A
 * token from an ended or unknown session is sent as given and never refreshed,
 * so a request started before sign out or a user switch cannot renew a session.
 */
export async function authenticatedFetch(
  accessToken: string,
  apiBaseUrl: string,
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const epoch = session.epoch;
  const ownedBySession = session.issuedTokens.has(accessToken);

  // A refresh is already on its way: wait for it rather than spend a request
  // on a token that is known to be expiring.
  if (ownedBySession && inFlightRefresh?.epoch === epoch) {
    await inFlightRefresh.promise;
  }

  const sentToken = tokenForRequest(accessToken, epoch, ownedBySession);
  const response = await fetch(url, withBearer(init, sentToken));

  if (response.status !== 401 || !ownedBySession || !isReplayableBody(init.body)) {
    return response;
  }

  init.signal?.throwIfAborted();
  const retryToken = await tokenAfterRejection(sentToken, epoch, apiBaseUrl);
  if (retryToken === null) {
    return response;
  }
  init.signal?.throwIfAborted();
  return fetch(url, withBearer(init, retryToken));
}

/**
 * Signs out: ends the local session first, so nothing else refreshes, then
 * asks the API to revoke the refresh session. When the access token has
 * already expired the API cannot authenticate the logout, so one refresh is
 * spent to obtain a token for it; otherwise the refresh cookie would stay
 * valid on the server.
 */
export async function logoutAuthSession(accessToken: string, apiBaseUrl: string): Promise<void> {
  const ownedBySession = session.issuedTokens.has(accessToken);
  const sentToken = (ownedBySession ? session.accessToken : null) ?? accessToken;
  endAuthSession();

  const sendLogout = (token: string) =>
    fetch(
      `${apiBaseUrl}/auth/logout`,
      withBearer({ method: 'POST', credentials: 'include' }, token),
    );

  try {
    const response = await sendLogout(sentToken);
    if (response.status !== 401 || !ownedBySession) {
      return;
    }
    const outcome = await requestRefresh(apiBaseUrl);
    if (outcome.status === 'refreshed') {
      await sendLogout(outcome.auth.accessToken);
    }
  } catch {
    // Signing out locally never waits on the network; the session is already gone here.
  }
}

/** Test seam: forget the session, any pending refresh and every subscriber. */
export function resetAuthSessionForTests(): void {
  endAuthSession();
  listeners.clear();
}
