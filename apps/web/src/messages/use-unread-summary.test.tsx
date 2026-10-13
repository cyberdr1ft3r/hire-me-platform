import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setDocumentVisibility } from './messages-test-data.js';
import { UNREAD_SUMMARY_POLL_MS, useMessagingUnreadSummary } from './use-unread-summary.js';

function summary(count: number): Response {
  return new Response(JSON.stringify({ unreadConversationCount: count }), { status: 200 });
}

async function flush(): Promise<void> {
  await act(async () => {
    for (let tick = 0; tick < 3; tick += 1) {
      await Promise.resolve();
    }
  });
}

function advance(ms: number): Promise<void> {
  return act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function requestUrl(input: RequestInfo | URL | undefined): string {
  return input instanceof Request ? input.url : input instanceof URL ? input.href : String(input);
}

beforeEach(() => {
  vi.useFakeTimers();
  setDocumentVisibility('visible');
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useMessagingUnreadSummary', () => {
  it('polls the messaging unread summary every 60 seconds only while the tab is visible', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => Promise.resolve(summary(3)));
    const { result } = renderHook(() =>
      useMessagingUnreadSummary({ accessToken: 'token-a', enabled: true, principal: 'actor' }),
    );
    await flush();
    expect(result.current.count).toBe(3);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(requestUrl(url)).toMatch(/\/v1\/messages\/unread-summary$/);
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer token-a');

    await advance(UNREAD_SUMMARY_POLL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    act(() => setDocumentVisibility('hidden'));
    await advance(UNREAD_SUMMARY_POLL_MS * 3);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    act(() => setDocumentVisibility('visible'));
    expect(fetchMock).toHaveBeenCalledTimes(3);
    await advance(UNREAD_SUMMARY_POLL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls.some(([input]) => /notification/i.test(requestUrl(input)))).toBe(
      false,
    );
  });

  it('never polls without messages:view', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const { result } = renderHook(() =>
      useMessagingUnreadSummary({ accessToken: 'token-a', enabled: false, principal: 'actor' }),
    );
    await advance(UNREAD_SUMMARY_POLL_MS * 2);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.count).toBeNull();
  });

  it('drops a response started for a previous token or principal, and resets on logout', async () => {
    let resolveStale: (response: Response) => void = () => undefined;
    vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => {
      const token = new Headers(init?.headers).get('Authorization');
      if (token === 'Bearer token-a') {
        return new Promise<Response>((resolve) => {
          resolveStale = resolve;
        });
      }
      return Promise.resolve(summary(1));
    });
    const initialProps: { accessToken: string | null; principal: string } = {
      accessToken: 'token-a',
      principal: 'actor-a',
    };
    const { rerender, result } = renderHook(
      (props: typeof initialProps) =>
        useMessagingUnreadSummary({ ...props, enabled: props.accessToken !== null }),
      { initialProps },
    );
    rerender({ accessToken: 'token-b', principal: 'actor-b' });
    await flush();
    expect(result.current.count).toBe(1);

    resolveStale(summary(42));
    await flush();
    expect(result.current.count).toBe(1);

    rerender({ accessToken: null, principal: '' });
    expect(result.current.count).toBeNull();
  });
});
