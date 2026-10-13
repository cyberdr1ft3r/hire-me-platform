import { useEffect, useRef, useState, type RefObject } from 'react';

/** False once the component unmounts, so late responses are dropped. */
export function useAliveRef(): RefObject<boolean> {
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  return alive;
}

function documentVisible(): boolean {
  return typeof document === 'undefined' || document.visibilityState !== 'hidden';
}

export function useDocumentVisible(): boolean {
  const [visible, setVisible] = useState(documentVisible);
  useEffect(() => {
    const sync = () => setVisible(documentVisible());
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, []);
  return visible;
}

/**
 * Calls `callback` every `intervalMs` while the tab is visible. A hidden tab
 * suspends the timer; becoming visible again polls at once and restarts it.
 * Changing `resetKey` (a session, a conversation) starts a fresh schedule.
 */
export function useVisibleInterval(
  callback: () => void,
  intervalMs: number,
  {
    enabled,
    resetKey = '',
    runOnStart = false,
  }: { enabled: boolean; resetKey?: string; runOnStart?: boolean },
): void {
  const latest = useRef(callback);
  latest.current = callback;

  useEffect(() => {
    if (!enabled) {
      return;
    }
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = (immediate: boolean) => {
      if (timer !== null) {
        return;
      }
      if (immediate) {
        latest.current();
      }
      timer = setInterval(() => latest.current(), intervalMs);
    };
    const stop = () => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };
    const sync = () => (documentVisible() ? start(true) : stop());
    if (documentVisible()) {
      start(runOnStart);
    }
    document.addEventListener('visibilitychange', sync);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', sync);
    };
  }, [enabled, intervalMs, resetKey, runOnStart]);
}
