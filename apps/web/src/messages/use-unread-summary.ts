import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { getMessagingUnreadSummary } from './messages-api.js';
import { useVisibleInterval } from './polling.js';

export const UNREAD_SUMMARY_POLL_MS = 60_000;

/**
 * The AppShell unread-conversation count. It reads the messaging API's own
 * derived count (read cursors), never Notification rows, and polls only while
 * the tab is visible. A new token or principal invalidates every request that
 * was started for the previous one.
 */
export function useMessagingUnreadSummary({
  accessToken,
  enabled,
  principal,
}: {
  accessToken: string | null;
  enabled: boolean;
  principal: string;
}): { count: number | null; refresh: () => void } {
  const sessionKey = `${principal}\n${accessToken ?? ''}`;
  const active = enabled && accessToken !== null;
  const [state, setState] = useState<{ count: number; sessionKey: string } | null>(null);
  const request = useRef(0);
  const currentSession = useRef(sessionKey);

  useLayoutEffect(() => {
    currentSession.current = sessionKey;
  }, [sessionKey]);

  useEffect(
    () => () => {
      request.current += 1;
    },
    [sessionKey, active],
  );

  const poll = useCallback(() => {
    if (!active || accessToken === null) {
      return;
    }
    const id = ++request.current;
    const startedSession = sessionKey;
    getMessagingUnreadSummary(accessToken)
      .then((response) => {
        if (id === request.current && currentSession.current === startedSession) {
          setState({ count: response.unreadConversationCount, sessionKey: startedSession });
        }
      })
      .catch(() => undefined);
  }, [accessToken, active, sessionKey]);

  useVisibleInterval(poll, UNREAD_SUMMARY_POLL_MS, {
    enabled: active,
    resetKey: sessionKey,
    runOnStart: true,
  });

  return {
    count: active && state?.sessionKey === sessionKey ? state.count : null,
    refresh: poll,
  };
}
