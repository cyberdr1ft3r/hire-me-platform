import type { AuthResponse } from '@hire-me/contracts';

import type { RefreshOutcome } from './authenticated-request.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AUTH_COORDINATION_KEY,
  AUTH_REFRESH_LOCK,
  AUTH_SESSION_CHANNEL,
  AUTH_SYNC_TIMEOUT_MS,
  resetAuthCrossTabForTests,
  withAuthRefreshLock,
} from './auth-cross-tab.js';

const API = 'http://api.test';
const USER_ID = '6f6d50ec-7fcf-4420-b41d-d723bdd7b07d';
const OTHER_USER_ID = '0b0d5a8e-2f53-4c1c-9a57-3c1e8b7f2a10';

function authResponse(accessToken: string, userId = USER_ID): AuthResponse {
  return {
    accessToken,
    accessTokenExpiresAt: '2026-10-14T10:05:00.000Z',
    user: {
      id: userId,
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

type QueuedDelivery = {
  recipient: ControlledBroadcastChannel;
  data: unknown;
};

/** Broadcast delivery is explicit so tests control lock handoff vs message processing. */
class ControlledBroadcastChannel {
  static readonly peers = new Set<ControlledBroadcastChannel>();
  static readonly deliveries: QueuedDelivery[] = [];
  readonly name: string;
  onmessage: ((event: MessageEvent) => void) | null = null;

  constructor(name: string) {
    this.name = name;
    ControlledBroadcastChannel.peers.add(this);
  }

  postMessage(data: unknown): void {
    for (const peer of ControlledBroadcastChannel.peers) {
      if (peer.name === this.name && peer !== this) {
        ControlledBroadcastChannel.deliveries.push({ recipient: peer, data });
      }
    }
  }

  close(): void {
    ControlledBroadcastChannel.peers.delete(this);
  }

  static deliver(predicate: (delivery: QueuedDelivery) => boolean = () => true): QueuedDelivery {
    const index = ControlledBroadcastChannel.deliveries.findIndex(predicate);
    if (index < 0) {
      throw new Error('No matching BroadcastChannel delivery');
    }
    const delivery = ControlledBroadcastChannel.deliveries[index];
    if (!delivery) {
      throw new Error('Matching BroadcastChannel delivery disappeared');
    }
    ControlledBroadcastChannel.deliveries.splice(index, 1);
    delivery.recipient.onmessage?.({ data: delivery.data } as MessageEvent);
    return delivery;
  }

  static clearDeliveries(): void {
    ControlledBroadcastChannel.deliveries.splice(0);
  }

  static reset(): void {
    ControlledBroadcastChannel.peers.clear();
    ControlledBroadcastChannel.clearDeliveries();
  }
}

function messageType(delivery: QueuedDelivery): unknown {
  return (delivery.data as { type?: unknown })?.type;
}

function writeCoordination(
  eventId: string,
  kind: 'refresh' | 'session-ended' | 'session-replaced',
): void {
  localStorage.setItem(AUTH_COORDINATION_KEY, JSON.stringify({ version: 1, eventId, kind }));
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
  ControlledBroadcastChannel.reset();
  vi.stubGlobal('BroadcastChannel', ControlledBroadcastChannel);
  mockWebLocks();
  vi.resetModules();
  return import('./authenticated-request.js');
}

function holdAuthLock() {
  let releaseLock!: () => void;
  vi.spyOn(navigator.locks, 'request').mockImplementation(
    (_name: string, optionsOrCallback: unknown, maybeCallback?: unknown) => {
      const callback = (
        typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback
      ) as (lock: LockInfo) => Promise<unknown>;
      return new Promise<RefreshOutcome>((resolve) => {
        releaseLock = () => {
          void callback({ name: AUTH_REFRESH_LOCK, mode: 'exclusive' }).then((result) =>
            resolve(result as RefreshOutcome),
          );
        };
      });
    },
  );
  return () => releaseLock();
}

describe('cross-tab refresh coordination', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    resetAuthCrossTabForTests();
    ControlledBroadcastChannel.reset();
    vi.resetModules();
  });

  it('applies a valid current remote refresh broadcast from another tab', async () => {
    const auth = await loadAuthModule();
    auth.startAuthSession(authResponse('login-token'));
    const events: unknown[] = [];
    auth.subscribeAuthSession((event) => events.push(event));
    const peer = new ControlledBroadcastChannel(AUTH_SESSION_CHANNEL);
    const eventId = 'refresh-current';
    writeCoordination(eventId, 'refresh');
    peer.postMessage({ version: 2, type: 'refresh', eventId, auth: authResponse('from-tab-b') });
    ControlledBroadcastChannel.deliver();

    expect(auth.getAuthSessionAccessToken()).toBe('from-tab-b');
    expect(events).toHaveLength(1);
  });

  it('shares one refresh HTTP call between in-tab callers', async () => {
    const auth = await loadAuthModule();
    auth.startAuthSession(authResponse('login-token'));

    let refreshCount = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      if (fetchUrl(input) === `${API}/auth/refresh`) {
        refreshCount += 1;
        return Promise.resolve(json(authResponse(`access-${refreshCount}`)));
      }
      return Promise.resolve(json({}, 404));
    });

    const [a, b] = await Promise.all([auth.refreshAuthSession(API), auth.refreshAuthSession(API)]);

    expect(refreshCount).toBe(1);
    expect(a.status).toBe('refreshed');
    expect(b.status).toBe('refreshed');
  });

  it('does not refresh when lock handoff precedes delivery of the leader refresh message', async () => {
    const auth = await loadAuthModule();
    auth.startAuthSession(authResponse('login-token'));
    const peer = new ControlledBroadcastChannel(AUTH_SESSION_CHANNEL);
    ControlledBroadcastChannel.clearDeliveries();
    const releaseLock = holdAuthLock();
    let refreshCount = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      if (fetchUrl(input) === `${API}/auth/refresh`) {
        refreshCount += 1;
        return Promise.resolve(json(authResponse('unexpected-second-refresh')));
      }
      return Promise.resolve(json({}, 404));
    });

    const pending = auth.refreshAuthSession(API);

    // Tab A completes while holding the lock. Its state marker is synchronous,
    // but its ordinary refresh broadcast remains deliberately undelivered.
    const eventId = 'tab-a-refresh';
    writeCoordination(eventId, 'refresh');
    peer.postMessage({ version: 2, type: 'refresh', eventId, auth: authResponse('access-a') });
    expect(messageType(ControlledBroadcastChannel.deliveries[0]!)).toBe('refresh');

    // Tab A releases the lock. Tab B acquires it before processing that message,
    // sees the marker change, and explicitly asks for the matching result.
    releaseLock();
    await vi.waitFor(() =>
      expect(
        ControlledBroadcastChannel.deliveries.some((item) => messageType(item) === 'sync-request'),
      ).toBe(true),
    );
    peer.onmessage = (event) => {
      const request = event.data as { type?: string; eventId?: string; requestId?: string };
      if (request.type === 'sync-request') {
        peer.postMessage({
          version: 2,
          type: 'sync-response',
          eventId: request.eventId,
          requestId: request.requestId,
          auth: authResponse('access-a'),
        });
      }
    };
    ControlledBroadcastChannel.deliver((item) => messageType(item) === 'sync-request');
    ControlledBroadcastChannel.deliver((item) => messageType(item) === 'sync-response');
    const outcome = await pending;

    expect(refreshCount).toBe(0);
    expect(outcome).toMatchObject({ status: 'refreshed', auth: { accessToken: 'access-a' } });
    expect(auth.getAuthSessionAccessToken()).toBe('access-a');
    expect(messageType(ControlledBroadcastChannel.deliveries[0]!)).toBe('refresh');

    // The delayed ordinary broadcast is idempotent after the correlated sync.
    ControlledBroadcastChannel.deliver((item) => messageType(item) === 'refresh');
    expect(auth.getAuthSessionAccessToken()).toBe('access-a');
  });

  it('recovers when the leader exits after publishing its marker but before token handoff', async () => {
    vi.useFakeTimers();
    const auth = await loadAuthModule();
    auth.startAuthSession(authResponse('login-token'));
    new ControlledBroadcastChannel(AUTH_SESSION_CHANNEL);
    ControlledBroadcastChannel.clearDeliveries();
    const releaseLock = holdAuthLock();
    let refreshCount = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      if (fetchUrl(input) === `${API}/auth/refresh`) {
        refreshCount += 1;
        return Promise.resolve(json(authResponse('access-after-crash')));
      }
      return Promise.resolve(json({}, 404));
    });

    const pending = auth.refreshAuthSession(API);
    writeCoordination('crashed-leader-refresh', 'refresh');
    releaseLock();
    await vi.advanceTimersByTimeAsync(AUTH_SYNC_TIMEOUT_MS);
    const outcome = await pending;

    expect(refreshCount).toBe(1);
    expect(outcome).toMatchObject({ status: 'refreshed' });
    expect(auth.getAuthSessionAccessToken()).toBe('access-after-crash');
  });

  it('ignores stale logout after a new session has started', async () => {
    const auth = await loadAuthModule();
    const peer = new ControlledBroadcastChannel(AUTH_SESSION_CHANNEL);
    auth.startAuthSession(authResponse('old-session'));
    ControlledBroadcastChannel.clearDeliveries();
    writeCoordination('old-logout', 'session-ended');
    peer.postMessage({
      version: 2,
      type: 'session-ended',
      eventId: 'old-logout',
      reason: 'logout',
    });

    auth.startAuthSession(authResponse('new-session', OTHER_USER_ID));
    ControlledBroadcastChannel.deliver((item) => messageType(item) === 'session-ended');

    expect(auth.getAuthSessionAccessToken()).toBe('new-session');
  });

  it('does not refresh when logout completes while waiting for the lock', async () => {
    const auth = await loadAuthModule();
    auth.startAuthSession(authResponse('login-token'));
    const peer = new ControlledBroadcastChannel(AUTH_SESSION_CHANNEL);
    ControlledBroadcastChannel.clearDeliveries();
    const releaseLock = holdAuthLock();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const pending = auth.refreshAuthSession(API);
    writeCoordination('logout-during-wait', 'session-ended');
    peer.postMessage({
      version: 2,
      type: 'session-ended',
      eventId: 'logout-during-wait',
      reason: 'logout',
    });
    releaseLock();

    await expect(pending).resolves.toEqual({ status: 'superseded' });
    expect(fetchSpy).not.toHaveBeenCalled();
    ControlledBroadcastChannel.deliver((item) => messageType(item) === 'session-ended');
    expect(auth.getAuthSessionAccessToken()).toBeNull();
  });

  it('rejects malformed, unexpected and marker-mismatched messages', async () => {
    const auth = await loadAuthModule();
    const peer = new ControlledBroadcastChannel(AUTH_SESSION_CHANNEL);
    auth.startAuthSession(authResponse('login-token'));
    ControlledBroadcastChannel.clearDeliveries();
    writeCoordination('current-event', 'refresh');

    peer.postMessage({ version: 2, type: 'refresh', eventId: 'current-event', auth: {} });
    peer.postMessage({ version: 2, type: 'surprise', eventId: 'current-event' });
    peer.postMessage({
      version: 2,
      type: 'session-ended',
      eventId: 'different-event',
      reason: 'logout',
    });
    while (ControlledBroadcastChannel.deliveries.length > 0) {
      ControlledBroadcastChannel.deliver();
    }

    expect(auth.getAuthSessionAccessToken()).toBe('login-token');
  });

  it('keeps the session when lock acquisition is cancelled', async () => {
    const auth = await loadAuthModule();
    auth.startAuthSession(authResponse('login-token'));
    vi.spyOn(navigator.locks, 'request').mockRejectedValue(
      new DOMException('The lock request was aborted.', 'AbortError'),
    );
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    await expect(auth.refreshAuthSession(API)).resolves.toEqual({ status: 'unavailable' });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(auth.getAuthSessionAccessToken()).toBe('login-token');
  });

  it('propagates a current session-ended event to other tabs', async () => {
    const auth = await loadAuthModule();
    auth.startAuthSession(authResponse('login-token'));
    const events: unknown[] = [];
    auth.subscribeAuthSession((event) => events.push(event));
    const peer = new ControlledBroadcastChannel(AUTH_SESSION_CHANNEL);
    const eventId = 'current-expiry';
    writeCoordination(eventId, 'session-ended');
    peer.postMessage({ version: 2, type: 'session-ended', eventId, reason: 'expired' });
    ControlledBroadcastChannel.deliver();

    expect(auth.getAuthSessionAccessToken()).toBeNull();
    expect(events).toEqual([{ type: 'ended', reason: 'expired' }]);
  });

  it('withAuthRefreshLock runs callbacks exclusively in order', async () => {
    mockWebLocks();
    let releaseFirst!: () => void;
    const firstPending = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const order: number[] = [];
    const first = withAuthRefreshLock(async () => {
      order.push(1);
      await firstPending;
      order.push(2);
    });
    const second = withAuthRefreshLock(() => {
      order.push(3);
      return Promise.resolve();
    });
    await Promise.resolve();
    expect(order).toEqual([1]);
    releaseFirst();
    await Promise.all([first, second]);
    expect(order).toEqual([1, 2, 3]);
  });
});
