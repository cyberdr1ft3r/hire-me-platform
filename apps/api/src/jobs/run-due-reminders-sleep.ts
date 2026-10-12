export type SleepFn = (milliseconds: number, signal?: AbortSignal) => Promise<void>;

/** Resolves when the delay elapses or when `signal` is aborted (whichever comes first). */
export function createAbortableSleep(
  setTimer: typeof setTimeout = setTimeout,
  clearTimer: typeof clearTimeout = clearTimeout,
): SleepFn {
  return (milliseconds, signal) => {
    if (milliseconds <= 0) {
      return Promise.resolve();
    }
    if (signal?.aborted) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const finish = (): void => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      };
      const onAbort = (): void => {
        clearTimer(handle);
        finish();
      };
      const handle = setTimer(finish, milliseconds);
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  };
}

export const defaultSleep: SleepFn = createAbortableSleep();
