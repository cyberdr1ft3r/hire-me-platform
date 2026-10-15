import type { AuthResponse } from '@hire-me/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AUTH_COORDINATION_KEY, getAuthCoordinationSnapshot } from './auth-cross-tab.js';
import {
  authenticatedFetch,
  endAuthSession,
  getAuthSessionAccessToken,
  isReplayableBody,
  logoutAuthSession,
  restoreAuthSession,
  startAuthSession,
  subscribeAuthSession,
  type AuthSessionEvent,
} from './authenticated-request.js';

const API = 'http://api.test';
const USER_ID = '6f6d50ec-7fcf-4420-b41d-d723bdd7b07d';
const OTHER_USER_ID = '0b0d5a8e-2f53-4c1c-9a57-3c1e8b7f2a10';

function authResponse(accessToken: string, userId = USER_ID, permissions = ['tasks:view']) {
  return {
    accessToken,
    accessTokenExpiresAt: '2026-10-14T10:05:00.000Z',
    user: {
      id: userId,
      displayName: 'Synthetic User',
      email: 'user@example.test',
      permissions,
    },
  } satisfies AuthResponse;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

type RecordedCall = {
  url: string;
  method: string;
  authorization: string | null;
  body: RequestInit['body'];
  init: RequestInit;
};

/**
 * A small fake API: module endpoints accept only the access tokens in
 * `validTokens`; `/auth/refresh` answers through `refreshHandler`, which tests
 * replace to delay, reject or rate-limit it.
 */
function fakeApi() {
  const calls: RecordedCall[] = [];
  const validTokens = new Set<string>();
  let rotation = 0;
  let refreshHandler: () => Promise<Response> = () => {
    rotation += 1;
    const token = `access-${rotation}`;
    validTokens.add(token);
    return Promise.resolve(json(authResponse(token)));
  };
  let moduleHandler: (call: RecordedCall) => Promise<Response> | null = () => null;

  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init = {}) => {
    const url = input instanceof Request ? input.url : input.toString();
    const call: RecordedCall = {
      url,
      method: init.method ?? 'GET',
      authorization: new Headers(init.headers).get('Authorization'),
      body: init.body,
      init,
    };
    calls.push(call);

    if (init.signal?.aborted) {
      return Promise.reject(new DOMException('The operation was aborted.', 'AbortError'));
    }
    if (url === `${API}/auth/refresh`) {
      return refreshHandler();
    }
    const custom = moduleHandler(call);
    if (custom) {
      return custom;
    }
    const token = call.authorization?.replace(/^Bearer /, '') ?? '';
    if (url === `${API}/auth/logout`) {
      return Promise.resolve(validTokens.has(token) ? json({ status: 'ok' }) : json({}, 401));
    }
    return Promise.resolve(
      validTokens.has(token) ? json({ ok: true, token }) : json({ error: { code: 'X' } }, 401),
    );
  });

  return {
    calls,
    fetchMock,
    validTokens,
    refreshCalls: () => calls.filter((call) => call.url === `${API}/auth/refresh`),
    moduleCalls: (path = '/v1/') => calls.filter((call) => call.url.includes(path)),
    setRefresh(handler: () => Promise<Response>) {
      refreshHandler = handler;
    },
    setModule(handler: (call: RecordedCall) => Promise<Response> | null) {
      moduleHandler = handler;
    },
    issue(token: string) {
      validTokens.add(token);
    },
    expireAll() {
      validTokens.clear();
    },
  };
}

function recordEvents() {
  const events: AuthSessionEvent[] = [];
  const unsubscribe = subscribeAuthSession((event) => events.push(event));
  return { events, unsubscribe };
}

describe('authenticatedFetch', () => {
  let api: ReturnType<typeof fakeApi>;

  beforeEach(() => {
    api = fakeApi();
    api.issue('login-token');
    startAuthSession(authResponse('login-token'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends the session token and does not refresh while it is valid', async () => {
    const response = await authenticatedFetch('login-token', API, `${API}/v1/tasks`);

    expect(response.status).toBe(200);
    expect(api.refreshCalls()).toHaveLength(0);
    expect(api.moduleCalls()[0]?.authorization).toBe('Bearer login-token');
  });

  it('refreshes an expired token once and replays the request with identical semantics', async () => {
    api.expireAll();
    const controller = new AbortController();
    const body = JSON.stringify({ title: 'Call back' });

    const response = await authenticatedFetch('login-token', API, `${API}/v1/tasks`, {
      method: 'POST',
      credentials: 'include',
      headers: new Headers({ 'Content-Type': 'application/json', 'X-Request-Id': 'r-1' }),
      body,
      signal: controller.signal,
    });

    expect(response.status).toBe(200);
    expect(api.refreshCalls()).toHaveLength(1);
    const [first, retry] = api.moduleCalls();
    expect(api.moduleCalls()).toHaveLength(2);
    expect(first?.authorization).toBe('Bearer login-token');
    expect(retry?.authorization).toBe('Bearer access-1');
    for (const call of [first, retry]) {
      expect(call?.method).toBe('POST');
      expect(call?.body).toBe(body);
      expect(call?.init.credentials).toBe('include');
      expect(call?.init.signal).toBe(controller.signal);
      const headers = new Headers(call?.init.headers);
      expect(headers.get('Content-Type')).toBe('application/json');
      expect(headers.get('X-Request-Id')).toBe('r-1');
    }
    expect(getAuthSessionAccessToken()).toBe('access-1');
  });

  it('shares one refresh between concurrent 401s and retries each request exactly once', async () => {
    api.expireAll();
    const pending = deferred<Response>();
    api.setRefresh(() => pending.promise);

    const requests = Array.from({ length: 6 }, (_, index) =>
      authenticatedFetch('login-token', API, `${API}/v1/module-${index}`),
    );
    await vi.waitFor(() => expect(api.refreshCalls()).toHaveLength(1));
    api.issue('access-shared');
    pending.resolve(json(authResponse('access-shared')));
    const responses = await Promise.all(requests);

    expect(responses.map((response) => response.status)).toEqual([200, 200, 200, 200, 200, 200]);
    expect(api.refreshCalls()).toHaveLength(1);
    for (let index = 0; index < 6; index += 1) {
      const calls = api.moduleCalls(`/v1/module-${index}`);
      expect(calls.map((call) => call.authorization)).toEqual([
        'Bearer login-token',
        'Bearer access-shared',
      ]);
    }
  });

  it('holds new requests while a refresh is pending and sends them with the new token', async () => {
    api.expireAll();
    const pending = deferred<Response>();
    api.setRefresh(() => pending.promise);

    const first = authenticatedFetch('login-token', API, `${API}/v1/first`);
    await vi.waitFor(() => expect(api.refreshCalls()).toHaveLength(1));
    const later = authenticatedFetch('login-token', API, `${API}/v1/later`);
    api.issue('access-new');
    pending.resolve(json(authResponse('access-new')));
    await Promise.all([first, later]);

    expect(api.moduleCalls('/v1/later').map((call) => call.authorization)).toEqual([
      'Bearer access-new',
    ]);
    expect(api.refreshCalls()).toHaveLength(1);
  });

  it('retries with a token another request already rotated instead of refreshing again', async () => {
    const slow = deferred<Response>();
    api.setModule((call) =>
      call.url.endsWith('/v1/slow') && call.authorization === 'Bearer login-token'
        ? slow.promise
        : null,
    );

    const slowRequest = authenticatedFetch('login-token', API, `${API}/v1/slow`);
    api.expireAll();
    await authenticatedFetch('login-token', API, `${API}/v1/fast`);
    expect(getAuthSessionAccessToken()).toBe('access-1');
    slow.resolve(json({}, 401));
    const response = await slowRequest;

    expect(response.status).toBe(200);
    expect(api.refreshCalls()).toHaveLength(1);
    expect(api.moduleCalls('/v1/slow').map((call) => call.authorization)).toEqual([
      'Bearer login-token',
      'Bearer access-1',
    ]);
  });

  it('never retries more than once: a second 401 is returned without another refresh', async () => {
    api.expireAll();
    api.setModule((call) =>
      call.url.endsWith('/v1/always-401') ? Promise.resolve(json({}, 401)) : null,
    );

    const response = await authenticatedFetch('login-token', API, `${API}/v1/always-401`);

    expect(response.status).toBe(401);
    expect(api.moduleCalls('/v1/always-401')).toHaveLength(2);
    expect(api.refreshCalls()).toHaveLength(1);
  });

  it.each([403, 404, 409, 429, 500])(
    'passes a %i straight through without refreshing',
    async (status) => {
      api.setModule(() => Promise.resolve(json({ error: { code: 'NOPE' } }, status)));

      const response = await authenticatedFetch('login-token', API, `${API}/v1/tasks`);

      expect(response.status).toBe(status);
      expect(api.refreshCalls()).toHaveLength(0);
      expect(api.moduleCalls()).toHaveLength(1);
    },
  );

  it('ends the session exactly once when the refresh cookie is rejected', async () => {
    api.expireAll();
    const { events } = recordEvents();
    const pending = deferred<Response>();
    api.setRefresh(() => pending.promise);

    const requests = Array.from({ length: 4 }, (_, index) =>
      authenticatedFetch('login-token', API, `${API}/v1/module-${index}`),
    );
    await vi.waitFor(() => expect(api.refreshCalls()).toHaveLength(1));
    pending.resolve(json({ error: { code: 'AUTHENTICATION_FAILED' } }, 401));
    const responses = await Promise.all(requests);

    expect(responses.map((response) => response.status)).toEqual([401, 401, 401, 401]);
    expect(events).toEqual([{ type: 'ended', reason: 'expired' }]);
    expect(getAuthSessionAccessToken()).toBeNull();
    expect(api.moduleCalls()).toHaveLength(4);
    expect(api.refreshCalls()).toHaveLength(1);

    // Later requests from the ended session neither refresh nor sign out again.
    await authenticatedFetch('login-token', API, `${API}/v1/after`);
    expect(api.refreshCalls()).toHaveLength(1);
    expect(events).toHaveLength(1);
  });

  it.each([
    ['rate limited', () => Promise.resolve(json({}, 429))],
    ['server error', () => Promise.resolve(json({}, 503))],
    ['network failure', () => Promise.reject(new TypeError('Failed to fetch'))],
    ['malformed body', () => Promise.resolve(json({ unexpected: true }))],
  ])('keeps the session when refresh is %s and does not loop', async (_label, handler) => {
    api.expireAll();
    const { events } = recordEvents();
    api.setRefresh(handler);

    const response = await authenticatedFetch('login-token', API, `${API}/v1/tasks`);

    expect(response.status).toBe(401);
    expect(api.refreshCalls()).toHaveLength(1);
    expect(api.moduleCalls()).toHaveLength(1);
    expect(events).toEqual([]);
    expect(getAuthSessionAccessToken()).toBe('login-token');
  });

  it('signs out when the refresh cookie now belongs to a different user', async () => {
    api.expireAll();
    const { events } = recordEvents();
    api.setRefresh(() => {
      api.issue('other-user-token');
      return Promise.resolve(json(authResponse('other-user-token', OTHER_USER_ID)));
    });

    const response = await authenticatedFetch('login-token', API, `${API}/v1/tasks`);

    expect(response.status).toBe(401);
    expect(api.moduleCalls()).toHaveLength(1);
    expect(events).toEqual([{ type: 'ended', reason: 'user-changed' }]);
    expect(getAuthSessionAccessToken()).toBeNull();
  });

  it('publishes refreshed permissions so revoked roles reach the app', async () => {
    api.expireAll();
    const { events } = recordEvents();
    api.setRefresh(() => {
      api.issue('reduced-token');
      return Promise.resolve(json(authResponse('reduced-token', USER_ID, [])));
    });

    await authenticatedFetch('login-token', API, `${API}/v1/tasks`);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'refreshed', user: { id: USER_ID, permissions: [] } });
  });

  it('ignores a refresh that completes after sign out and does not retry', async () => {
    api.expireAll();
    const { events } = recordEvents();
    const pending = deferred<Response>();
    api.setRefresh(() => pending.promise);

    const request = authenticatedFetch('login-token', API, `${API}/v1/tasks`);
    await vi.waitFor(() => expect(api.refreshCalls()).toHaveLength(1));
    endAuthSession();
    api.issue('late-token');
    pending.resolve(json(authResponse('late-token')));
    const response = await request;

    expect(response.status).toBe(401);
    expect(api.moduleCalls()).toHaveLength(1);
    expect(getAuthSessionAccessToken()).toBeNull();
    expect(events).toEqual([]);
  });

  it('never refreshes for a token that does not belong to the current session', async () => {
    endAuthSession();
    api.issue('user-b-token');
    startAuthSession(authResponse('user-b-token', OTHER_USER_ID));

    const response = await authenticatedFetch('login-token', API, `${API}/v1/tasks`);

    // The old user's request is sent with its own token, never the new user's.
    expect(api.moduleCalls()[0]?.authorization).toBe('Bearer login-token');
    expect(response.status).toBe(200);
    api.expireAll();
    const expired = await authenticatedFetch('login-token', API, `${API}/v1/tasks`);
    expect(expired.status).toBe(401);
    expect(api.refreshCalls()).toHaveLength(0);
    expect(getAuthSessionAccessToken()).toBe('user-b-token');
  });

  it('does not replay a request whose body is a one-shot stream', async () => {
    api.expireAll();
    const stream = new ReadableStream({
      start(controller) {
        controller.close();
      },
    });

    const response = await authenticatedFetch('login-token', API, `${API}/v1/upload`, {
      method: 'POST',
      body: stream,
    });

    expect(response.status).toBe(401);
    expect(api.refreshCalls()).toHaveLength(0);
    expect(api.moduleCalls()).toHaveLength(1);
  });

  it('rejects an aborted request without retrying while the shared refresh still lands', async () => {
    api.expireAll();
    const pending = deferred<Response>();
    api.setRefresh(() => pending.promise);
    const controller = new AbortController();

    const aborted = authenticatedFetch('login-token', API, `${API}/v1/aborted`, {
      signal: controller.signal,
    });
    const other = authenticatedFetch('login-token', API, `${API}/v1/other`);
    await vi.waitFor(() => expect(api.refreshCalls()).toHaveLength(1));
    controller.abort();
    api.issue('after-abort');
    pending.resolve(json(authResponse('after-abort')));

    await expect(aborted).rejects.toMatchObject({ name: 'AbortError' });
    expect((await other).status).toBe(200);
    expect(api.moduleCalls('/v1/aborted')).toHaveLength(1);
    expect(getAuthSessionAccessToken()).toBe('after-abort');
  });

  it('keeps a plain header record and replaces any existing authorization header', async () => {
    await authenticatedFetch('login-token', API, `${API}/v1/tasks`, {
      headers: { authorization: 'Bearer forged', Accept: 'application/json' },
    });

    const headers = api.moduleCalls()[0]?.init.headers;
    expect(headers).toEqual({ Accept: 'application/json', Authorization: 'Bearer login-token' });
  });

  it('keeps tokens out of web storage and console output', async () => {
    const storage = vi.spyOn(Storage.prototype, 'setItem');
    const consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
      vi.spyOn(console, method),
    );
    api.expireAll();

    await authenticatedFetch('login-token', API, `${API}/v1/tasks`);
    api.setRefresh(() => Promise.resolve(json({}, 401)));
    api.expireAll();
    await authenticatedFetch('login-token', API, `${API}/v1/tasks`);

    expect(storage).toHaveBeenCalled();
    for (const [key, value] of storage.mock.calls) {
      expect(key).toBe(AUTH_COORDINATION_KEY);
      expect(value).not.toContain('login-token');
      expect(value).not.toContain('access-1');
      expect(value).not.toContain(USER_ID);
      expect(value).not.toContain('user@example.test');
    }
    for (const spy of consoleSpies) {
      expect(spy).not.toHaveBeenCalled();
    }
  });
});

describe('restoreAuthSession', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shares one refresh between concurrent restores (StrictMode double mount)', async () => {
    endAuthSession();
    const api = fakeApi();

    const [first, second] = await Promise.all([restoreAuthSession(API), restoreAuthSession(API)]);

    expect(api.refreshCalls()).toHaveLength(1);
    expect(first?.accessToken).toBe('access-1');
    expect(second?.accessToken).toBe('access-1');
    expect(getAuthSessionAccessToken()).toBe('access-1');
    expect(api.refreshCalls()[0]?.init).toEqual({ method: 'POST', credentials: 'include' });
  });

  it('keeps the refresh completion marker when the restored auth reaches App state', async () => {
    endAuthSession();
    fakeApi();

    const restored = await restoreAuthSession(API);
    expect(restored).not.toBeNull();
    const marker = getAuthCoordinationSnapshot();
    expect(marker.kind).toBe('refresh');
    startAuthSession(restored!);

    expect(getAuthCoordinationSnapshot()).toEqual(marker);
    expect(getAuthSessionAccessToken()).toBe(restored?.accessToken);
  });

  it('never overrides a sign in that happened while the restore was pending', async () => {
    endAuthSession();
    const api = fakeApi();
    const pending = deferred<Response>();
    api.setRefresh(() => pending.promise);

    const restore = restoreAuthSession(API);
    startAuthSession(authResponse('login-token'));
    pending.resolve(json(authResponse('restored-late')));

    expect(await restore).toBeNull();
    expect(getAuthSessionAccessToken()).toBe('login-token');
  });

  it('returns null without an event when there is no refresh cookie', async () => {
    endAuthSession();
    const api = fakeApi();
    api.setRefresh(() => Promise.resolve(json({}, 401)));
    const { events } = recordEvents();

    expect(await restoreAuthSession(API)).toBeNull();
    expect(events).toEqual([]);
  });
});

describe('logoutAuthSession', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('ends the session before the network call and logs out with the latest token', async () => {
    const api = fakeApi();
    api.issue('login-token');
    startAuthSession(authResponse('login-token'));
    api.expireAll();
    await authenticatedFetch('login-token', API, `${API}/v1/tasks`);
    let tokenDuringLogout: string | null | undefined;
    api.setModule((call) => {
      if (call.url.endsWith('/auth/logout')) {
        tokenDuringLogout = getAuthSessionAccessToken();
      }
      return null;
    });

    await logoutAuthSession('login-token', API);

    expect(tokenDuringLogout).toBeNull();
    const logoutCalls = api.calls.filter((call) => call.url.endsWith('/auth/logout'));
    expect(logoutCalls.map((call) => call.authorization)).toEqual(['Bearer access-1']);
    expect(logoutCalls[0]?.init).toMatchObject({ method: 'POST', credentials: 'include' });
  });

  it('spends one refresh to revoke the server session when the access token expired', async () => {
    const api = fakeApi();
    api.issue('login-token');
    startAuthSession(authResponse('login-token'));
    api.expireAll();

    await logoutAuthSession('login-token', API);

    const logoutCalls = api.calls.filter((call) => call.url.endsWith('/auth/logout'));
    expect(logoutCalls.map((call) => call.authorization)).toEqual([
      'Bearer login-token',
      'Bearer access-1',
    ]);
    expect(api.refreshCalls()).toHaveLength(1);
    expect(getAuthSessionAccessToken()).toBeNull();
  });

  it('still signs out locally when the network is down', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    startAuthSession(authResponse('login-token'));

    await expect(logoutAuthSession('login-token', API)).resolves.toBeUndefined();
    expect(getAuthSessionAccessToken()).toBeNull();
  });
});

describe('isReplayableBody', () => {
  it('accepts buffered bodies and rejects streams', () => {
    expect(isReplayableBody(undefined)).toBe(true);
    expect(isReplayableBody('{}')).toBe(true);
    expect(isReplayableBody(new URLSearchParams('a=1'))).toBe(true);
    expect(isReplayableBody(new Blob(['x']))).toBe(true);
    expect(isReplayableBody(new FormData())).toBe(true);
    expect(isReplayableBody(new Uint8Array([1]))).toBe(true);
    expect(isReplayableBody(new ReadableStream())).toBe(false);
  });
});
