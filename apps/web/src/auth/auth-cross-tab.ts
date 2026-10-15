import { AuthResponseSchema, type AuthResponse } from '@hire-me/contracts';

/** Same-origin channel for session coordination between tabs (R-059). */
export const AUTH_SESSION_CHANNEL = 'hire-me-auth-session-v2';

/** Exclusive lock so only one tab calls POST /auth/refresh at a time. */
export const AUTH_REFRESH_LOCK = 'hire-me:auth-refresh';

/** Non-secret, synchronously readable completion marker. Tokens never enter storage. */
export const AUTH_COORDINATION_KEY = 'hire-me:auth-coordination-v1';

/** A crashed leader must not leave the lock holder waiting forever for its in-memory token. */
export const AUTH_SYNC_TIMEOUT_MS = 1_000;

type AuthCoordinationKind = 'refresh' | 'session-ended' | 'session-replaced';

export type AuthCoordinationSnapshot = {
  supported: boolean;
  eventId: string | null;
  kind: AuthCoordinationKind | null;
};

type AuthCrossTabStateMessage =
  | { version: 2; type: 'refresh'; eventId: string; auth: AuthResponse }
  | {
      version: 2;
      type: 'session-ended';
      eventId: string;
      reason: 'expired' | 'user-changed' | 'logout';
    }
  | { version: 2; type: 'session-replaced'; eventId: string; userId: string };

type AuthCrossTabSyncMessage =
  | { version: 2; type: 'sync-request'; eventId: string; requestId: string }
  | {
      version: 2;
      type: 'sync-response';
      eventId: string;
      requestId: string;
      auth: AuthResponse;
    };

export type AuthCrossTabMessage =
  | { type: 'refresh'; auth: AuthResponse }
  | { type: 'session-ended'; reason: 'expired' | 'user-changed' | 'logout' }
  | { type: 'session-replaced'; userId: string };

export type AuthCrossTabHandlers = {
  onRemoteRefresh: (auth: AuthResponse, eventId: string) => void;
  onRemoteSessionEnded: (reason: 'expired' | 'user-changed' | 'logout') => void;
  onRemoteSessionReplaced: (userId: string) => void;
  getAuthForSync: (eventId: string) => AuthResponse | null;
};

type PendingSync = {
  eventId: string;
  resolve: (auth: AuthResponse | null) => void;
  timeout: ReturnType<typeof setTimeout>;
};

let channel: BroadcastChannel | null = null;
let handlers: AuthCrossTabHandlers | null = null;
const pendingSyncs = new Map<string, PendingSync>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isIdentifier(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

function isUserId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128;
}

function isSessionEndedReason(value: unknown): value is 'expired' | 'user-changed' | 'logout' {
  return value === 'expired' || value === 'user-changed' || value === 'logout';
}

function isCoordinationKind(value: unknown): value is AuthCoordinationKind {
  return value === 'refresh' || value === 'session-ended' || value === 'session-replaced';
}

function randomIdentifier(): string {
  return (
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

function readCoordinationSnapshot(): AuthCoordinationSnapshot {
  if (typeof localStorage === 'undefined') {
    return { supported: false, eventId: null, kind: null };
  }
  try {
    const raw = localStorage.getItem(AUTH_COORDINATION_KEY);
    if (raw === null) {
      return { supported: true, eventId: null, kind: null };
    }
    const parsed: unknown = JSON.parse(raw);
    if (
      !isRecord(parsed) ||
      parsed.version !== 1 ||
      !isIdentifier(parsed.eventId) ||
      !isCoordinationKind(parsed.kind)
    ) {
      return { supported: true, eventId: null, kind: null };
    }
    return { supported: true, eventId: parsed.eventId, kind: parsed.kind };
  } catch {
    return { supported: false, eventId: null, kind: null };
  }
}

export function getAuthCoordinationSnapshot(): AuthCoordinationSnapshot {
  return readCoordinationSnapshot();
}

export function authCoordinationChanged(
  before: AuthCoordinationSnapshot,
  after: AuthCoordinationSnapshot,
): boolean {
  return before.supported && after.supported && before.eventId !== after.eventId;
}

function writeCoordinationEvent(kind: AuthCoordinationKind, eventId: string): void {
  if (typeof localStorage === 'undefined') {
    return;
  }
  try {
    localStorage.setItem(AUTH_COORDINATION_KEY, JSON.stringify({ version: 1, eventId, kind }));
  } catch {
    // Web Locks still serialize refresh when storage is blocked. The documented
    // fallback may perform a second sequential rotation because it has no
    // synchronous cross-tab completion marker.
  }
}

function matchesCurrentEvent(eventId: string, kind: AuthCoordinationKind): boolean {
  const current = readCoordinationSnapshot();
  return !current.supported || (current.eventId === eventId && current.kind === kind);
}

function parseStateMessage(value: unknown): AuthCrossTabStateMessage | null {
  if (!isRecord(value) || value.version !== 2 || !isIdentifier(value.eventId)) {
    return null;
  }
  if (value.type === 'refresh') {
    const auth = AuthResponseSchema.safeParse(value.auth);
    return auth.success
      ? { version: 2, type: 'refresh', eventId: value.eventId, auth: auth.data }
      : null;
  }
  if (value.type === 'session-ended' && isSessionEndedReason(value.reason)) {
    return {
      version: 2,
      type: 'session-ended',
      eventId: value.eventId,
      reason: value.reason,
    };
  }
  if (value.type === 'session-replaced' && isUserId(value.userId)) {
    return {
      version: 2,
      type: 'session-replaced',
      eventId: value.eventId,
      userId: value.userId,
    };
  }
  return null;
}

function handleSyncMessage(value: unknown): boolean {
  if (
    !isRecord(value) ||
    value.version !== 2 ||
    !isIdentifier(value.eventId) ||
    !isIdentifier(value.requestId)
  ) {
    return false;
  }

  if (value.type === 'sync-request') {
    if (!matchesCurrentEvent(value.eventId, 'refresh')) {
      return true;
    }
    const auth = handlers?.getAuthForSync(value.eventId);
    if (auth) {
      getBroadcastChannel()?.postMessage({
        version: 2,
        type: 'sync-response',
        eventId: value.eventId,
        requestId: value.requestId,
        auth,
      } satisfies AuthCrossTabSyncMessage);
    }
    return true;
  }

  if (value.type === 'sync-response') {
    const pending = pendingSyncs.get(value.requestId);
    if (!pending || pending.eventId !== value.eventId) {
      return true;
    }
    const auth = AuthResponseSchema.safeParse(value.auth);
    if (!auth.success || !matchesCurrentEvent(value.eventId, 'refresh')) {
      return true;
    }
    clearTimeout(pending.timeout);
    pendingSyncs.delete(value.requestId);
    pending.resolve(auth.data);
    return true;
  }

  return false;
}

function getBroadcastChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') {
    return null;
  }
  if (!channel) {
    channel = new BroadcastChannel(AUTH_SESSION_CHANNEL);
    channel.onmessage = (event: MessageEvent<unknown>) => {
      const value = event.data;
      if (!handlers || handleSyncMessage(value)) {
        return;
      }
      const message = parseStateMessage(value);
      if (!message || !matchesCurrentEvent(message.eventId, message.type)) {
        return;
      }
      switch (message.type) {
        case 'refresh':
          handlers.onRemoteRefresh(message.auth, message.eventId);
          break;
        case 'session-ended':
          handlers.onRemoteSessionEnded(message.reason);
          break;
        case 'session-replaced':
          handlers.onRemoteSessionReplaced(message.userId);
          break;
      }
    };
  }
  return channel;
}

export function initAuthCrossTab(handlersArg: AuthCrossTabHandlers): void {
  handlers = handlersArg;
  getBroadcastChannel();
}

/**
 * Publishes a state transition after first making its non-secret event marker
 * synchronously visible to other same-origin tabs.
 */
export function publishAuthCrossTab(message: AuthCrossTabMessage): string {
  const eventId = randomIdentifier();
  writeCoordinationEvent(message.type, eventId);
  getBroadcastChannel()?.postMessage({ version: 2, eventId, ...message });
  return eventId;
}

/** Requests the in-memory auth result for a completion marker observed after lock handoff. */
export function requestAuthCrossTabSync(eventId: string): Promise<AuthResponse | null> {
  const broadcastChannel = getBroadcastChannel();
  if (!broadcastChannel || !isIdentifier(eventId)) {
    return Promise.resolve(null);
  }
  const requestId = randomIdentifier();
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      pendingSyncs.delete(requestId);
      resolve(null);
    }, AUTH_SYNC_TIMEOUT_MS);
    pendingSyncs.set(requestId, { eventId, resolve, timeout });
    broadcastChannel.postMessage({
      version: 2,
      type: 'sync-request',
      eventId,
      requestId,
    } satisfies AuthCrossTabSyncMessage);
  });
}

export function hasAuthRefreshLock(): boolean {
  return typeof navigator !== 'undefined' && 'locks' in navigator && navigator.locks !== undefined;
}

export function hasAuthCrossTabBroadcast(): boolean {
  return typeof BroadcastChannel !== 'undefined';
}

/** Runs `fn` while holding the cross-tab refresh lock when supported. */
export async function withAuthRefreshLock<T>(fn: () => Promise<T>): Promise<T> {
  if (!hasAuthRefreshLock()) {
    return fn();
  }
  return navigator.locks.request(AUTH_REFRESH_LOCK, fn);
}

/** Test seam: drop channel listeners, pending synchronization and storage metadata. */
export function resetAuthCrossTabForTests(): void {
  channel?.close();
  channel = null;
  handlers = null;
  for (const pending of pendingSyncs.values()) {
    clearTimeout(pending.timeout);
    pending.resolve(null);
  }
  pendingSyncs.clear();
  try {
    localStorage.removeItem(AUTH_COORDINATION_KEY);
  } catch {
    // Storage may be unavailable in the tested fallback.
  }
}
