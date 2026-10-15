import type { AuthResponse } from '@hire-me/contracts';

import type { RefreshOutcome } from './authenticated-request.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AUTH_REFRESH_LOCK,
  resetAuthCrossTabForTests,
  withAuthRefreshLock,
} from './auth-cross-tab.js';

const API = 'http://api.test';
const USER_ID = '6f6d50ec-7fcf-4420-b41d-d723bdd7b07d';

function authResponse(accessToken: string): AuthResponse {
  return {
    accessToken,
    accessTokenExpiresAt: '2026-10-14T10:05:00.000Z',
    user: {
      id: USER_ID,
      displayName: 'Synthetic User',
      email: 'user@example.test',
      permissions: ['tasks:view'],
    },
  };
}

function fetchUrl(input: RequestInfo | URL): string {
  return input instanceof Request ? input.url : String(input);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Minimal BroadcastChannel fan-out across mock instances (simulates other tabs). */
class MockBroadcastChannel {
  static readonly peers = new Set<MockBroadcastChannel>();
  readonly name: string;
  onmessage: ((event: MessageEvent) => void) | null = null;

  constructor(name: string) {
    this.name = name;
    MockBroadcastChannel.peers.add(this);
  }

  postMessage(data: unknown): void {
    for (const peer of MockBroadcastChannel.peers) {
      if (peer.name === this.name && peer.onmessage && peer !== this) {
        peer.onmessage({ data } as MessageEvent);
      }
    }
  }

  close(): void {
    MockBroadcastChannel.peers.delete(this);
  }

  static reset(): void {
    MockBroadcastChannel.peers.clear();
  }
}

/** Serializes lock callbacks like exclusive Web Locks across tabs. */
function mockWebLocks() {
  let chain = Promise.resolve();
  const locks = {
    request: (_name: string, callback: (lock: LockInfo) => Promise<unknown>) => {
      const run = chain.then(() => callback({ name: AUTH_REFRESH_LOCK, mode: 'exclusive' }));
      chain = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
  };
  vi.stubGlobal('navigator', { ...globalThis.navigator, locks });
  return vi.spyOn(navigator.locks, 'request');
}

async function loadAuthModule() {
  MockBroadcastChannel.reset();
  vi.stubGlobal('BroadcastChannel', MockBroadcastChannel);
  mockWebLocks();
  vi.resetModules();
  return import('./authenticated-request.js');
}

describe('cross-tab refresh coordination', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetAuthCrossTabForTests();
    vi.resetModules();
  });

  it('applies a remote refresh broadcast from another tab', async () => {
    const auth = await loadAuthModule();
    auth.startAuthSession(authResponse('login-token'));
    const events: unknown[] = [];
    auth.subscribeAuthSession((event) => events.push(event));
    const peer = new MockBroadcastChannel('hire-me-auth-session-v1');
    peer.postMessage({ type: 'refresh', auth: authResponse('from-tab-b') });
    peer.close();

    expect(auth.getAuthSessionAccessToken()).toBe('from-tab-b');
    expect(events).toHaveLength(1);
  });

  it('shares one refresh HTTP call when two tabs refresh concurrently', async () => {
    const auth = await loadAuthModule();
    auth.startAuthSession(authResponse('login-token'));

    let refreshCount = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = fetchUrl(input);
      if (url === `${API}/auth/refresh`) {
        refreshCount += 1;
        return Promise.resolve(json(authResponse(`access-${refreshCount}`)));
      }
      return Promise.resolve(json({}, 404));
    });

    const [a, b] = await Promise.all([auth.refreshAuthSession(API), auth.refreshAuthSession(API)]);

    expect(refreshCount).toBe(1);
    expect(a.status).toBe('refreshed');
    expect(b.status).toBe('refreshed');
    expect(auth.getAuthSessionAccessToken()).toBe('access-1');
  });

  it('skips POST /auth/refresh when another tab refreshed while waiting for the lock', async () => {
    const auth = await loadAuthModule();
    auth.startAuthSession(authResponse('login-token'));

    let releaseLock!: () => void;
    vi.spyOn(navigator.locks, 'request').mockImplementation(
      (_name: string, optionsOrCallback: unknown, maybeCallback?: unknown) => {
        const callback = (typeof optionsOrCallback === 'function'
          ? optionsOrCallback
          : maybeCallback) as (lock: LockInfo) => Promise<unknown>;
        return new Promise<RefreshOutcome>((resolve) => {
          releaseLock = () => {
            void callback({ name: AUTH_REFRESH_LOCK, mode: 'exclusive' }).then((result) =>
              resolve(result as RefreshOutcome),
            );
          };
        });
      },
    );

    let refreshCount = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      if (fetchUrl(input) === `${API}/auth/refresh`) {
        refreshCount += 1;
        return Promise.resolve(json(authResponse('access-local')));
      }
      return Promise.resolve(json({}, 404));
    });

    const pending = auth.refreshAuthSession(API);
    const peer = new MockBroadcastChannel('hire-me-auth-session-v1');
    peer.postMessage({ type: 'refresh', auth: authResponse('access-remote') });
    peer.close();
    releaseLock();
    const outcome = await pending;

    expect(refreshCount).toBe(0);
    expect(outcome.status).toBe('refreshed');
    if (outcome.status === 'refreshed') {
      expect(outcome.auth.accessToken).toBe('access-remote');
    }
  });

  it('propagates session-ended to other tabs', async () => {
    const auth = await loadAuthModule();
    auth.startAuthSession(authResponse('login-token'));
    const events: unknown[] = [];
    auth.subscribeAuthSession((event) => events.push(event));

    const peer = new MockBroadcastChannel('hire-me-auth-session-v1');
    peer.postMessage({ type: 'session-ended', reason: 'expired' });
    peer.close();

    expect(auth.getAuthSessionAccessToken()).toBeNull();
    expect(events).toEqual([{ type: 'ended', reason: 'expired' }]);
  });

  it('withAuthRefreshLock runs callbacks exclusively in order', async () => {
    mockWebLocks();
    const order: number[] = [];
    await Promise.all([
      withAuthRefreshLock(async () => {
        order.push(1);
        await new Promise((r) => setTimeout(r, 30));
        order.push(2);
      }),
      withAuthRefreshLock(() => {
        order.push(3);
        return Promise.resolve();
      }),
    ]);
    expect(order).toEqual([1, 2, 3]);
  });
});
