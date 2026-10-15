import type { AuthResponse } from '@hire-me/contracts';

/** Same-origin channel for session coordination between tabs (R-059). */
export const AUTH_SESSION_CHANNEL = 'hire-me-auth-session-v1';

/** Exclusive lock so only one tab calls POST /auth/refresh at a time. */
export const AUTH_REFRESH_LOCK = 'hire-me:auth-refresh';

export type AuthCrossTabMessage =
  | { type: 'refresh'; auth: AuthResponse }
  | { type: 'session-ended'; reason: 'expired' | 'user-changed' | 'logout' }
  | { type: 'session-replaced'; userId: string };

export type AuthCrossTabHandlers = {
  onRemoteRefresh: (auth: AuthResponse) => void;
  onRemoteSessionEnded: (reason: 'expired' | 'user-changed' | 'logout') => void;
  onRemoteSessionReplaced: (userId: string) => void;
};

let channel: BroadcastChannel | null = null;
let handlers: AuthCrossTabHandlers | null = null;

function getBroadcastChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') {
    return null;
  }
  if (!channel) {
    channel = new BroadcastChannel(AUTH_SESSION_CHANNEL);
    channel.onmessage = (event: MessageEvent<AuthCrossTabMessage>) => {
      const message = event.data;
      if (!handlers || !message || typeof message !== 'object') {
        return;
      }
      switch (message.type) {
        case 'refresh':
          handlers.onRemoteRefresh(message.auth);
          break;
        case 'session-ended':
          handlers.onRemoteSessionEnded(message.reason);
          break;
        case 'session-replaced':
          handlers.onRemoteSessionReplaced(message.userId);
          break;
        default:
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

export function publishAuthCrossTab(message: AuthCrossTabMessage): void {
  getBroadcastChannel()?.postMessage(message);
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

/** Test seam: drop channel listeners and close the channel. */
export function resetAuthCrossTabForTests(): void {
  channel?.close();
  channel = null;
  handlers = null;
}
