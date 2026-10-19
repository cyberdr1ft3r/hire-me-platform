import type { ConversationSummary, Notification } from '@hire-me/contracts';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/index.js';
import { NotificationCenter } from './NotificationCenter.js';

const NOTIFICATION_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const TASK_ID = '33333333-3333-4333-8333-333333333333';
const CONVERSATION_ID = '44444444-4444-4444-8444-444444444444';

const notification: Notification = {
  actorUserId: null,
  archivedAt: null,
  bodySummary: 'A task needs your attention.',
  createdAt: '2026-10-14T09:00:00.000Z',
  documentId: null,
  id: NOTIFICATION_ID,
  interviewId: null,
  missionCandidateId: null,
  readAt: null,
  recipientUserId: USER_ID,
  recruitmentMissionId: null,
  status: 'UNREAD',
  taskId: TASK_ID,
  title: 'Task assigned',
  trainingEnrollmentId: null,
  trainingSessionId: null,
  type: 'tasks.assignment.created',
  updatedAt: '2026-10-14T09:00:00.000Z',
};

const conversation: ConversationSummary = {
  activeMemberCount: 2,
  counterpart: {
    displayName: 'Synthetic Colleague',
    email: 'colleague@example.test',
    id: USER_ID,
    inactive: false,
  },
  createdAt: '2026-10-13T09:00:00.000Z',
  id: CONVERSATION_ID,
  lastMessageAt: '2026-10-14T10:00:00.000Z',
  lastMessageSequence: 8,
  lastReadSequence: 5,
  myRole: 'MEMBER',
  status: 'ACTIVE',
  title: null,
  type: 'PRIVATE',
  unreadCount: 3,
};

function json(body: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
}

function requestUrl(input: RequestInfo | URL): string {
  return input instanceof Request ? input.url : input instanceof URL ? input.href : input;
}

function renderCenter(onNavigatePath = vi.fn()) {
  render(
    <I18nProvider initialLocale="en">
      <NotificationCenter
        accessToken="token"
        messageUnreadCount={1}
        onNavigatePath={onNavigatePath}
        permissions={[
          'messages:view',
          'notifications:view_own',
          'notifications:update_own',
          'tasks:view',
        ]}
      />
    </I18nProvider>,
  );
  return onNavigatePath;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('NotificationCenter', () => {
  it('dismisses on a pointer outside while restoring focus to the bell', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = requestUrl(input);
      if (url.includes('/v1/messages/conversations')) {
        return json({ conversations: [], nextCursor: null });
      }
      return json({
        notifications: [],
        pageInfo: { hasNextPage: false, page: 1, pageSize: 25, total: 0 },
      });
    });

    renderCenter();
    const bell = await screen.findByRole('button', { name: 'Notifications, 1 unread item' });
    fireEvent.click(bell);
    expect(await screen.findByRole('region', { name: 'Notifications' })).toBeVisible();

    fireEvent.pointerDown(document.body);
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Notifications' })).toBeNull());
    await waitFor(() => expect(bell).toHaveFocus());
  });

  it('dismisses when focus genuinely leaves the boundary without stealing the new focus', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = requestUrl(input);
      if (url.includes('/v1/messages/conversations')) {
        return json({ conversations: [], nextCursor: null });
      }
      return json({
        notifications: [],
        pageInfo: { hasNextPage: false, page: 1, pageSize: 25, total: 0 },
      });
    });

    render(
      <>
        <button type="button">+ New client</button>
        <I18nProvider initialLocale="en">
          <NotificationCenter
            accessToken="token"
            messageUnreadCount={0}
            onNavigatePath={vi.fn()}
            permissions={['notifications:view_own']}
          />
        </I18nProvider>
      </>,
    );
    const newClient = screen.getByRole('button', { name: '+ New client' });
    const bell = await screen.findByRole('button', { name: 'Notifications' });
    fireEvent.click(bell);
    const panel = await screen.findByRole('region', { name: 'Notifications' });
    const heading = screen.getByRole('heading', { name: 'Notifications' });
    await waitFor(() => expect(heading).toHaveFocus());

    // This is the keyboard path: Tab moves to the creation trigger behind the
    // popover. The transition is outside the boundary and must dismiss it.
    fireEvent.blur(heading, { relatedTarget: newClient });
    act(() => newClient.focus());

    await waitFor(() => expect(panel).not.toBeInTheDocument());
    expect(newClient).toHaveFocus();
  });

  it('keeps focus transitions inside the popover interactive', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = requestUrl(input);
      if (url.includes('/v1/messages/conversations')) {
        return json({ conversations: [], nextCursor: null });
      }
      return json({
        notifications: [],
        pageInfo: { hasNextPage: false, page: 1, pageSize: 25, total: 0 },
      });
    });

    renderCenter();
    const bell = await screen.findByRole('button', { name: 'Notifications, 1 unread item' });
    fireEvent.click(bell);
    const panel = await screen.findByRole('region', { name: 'Notifications' });
    const heading = screen.getByRole('heading', { name: 'Notifications' });
    await waitFor(() => expect(heading).toHaveFocus());
    fireEvent.blur(heading, { relatedTarget: panel });

    expect(panel).toBeInTheDocument();

    const allFilter = screen.getByRole('button', { name: 'All' });
    fireEvent.blur(heading, { relatedTarget: null });
    act(() => allFilter.focus());
    await waitFor(() => expect(panel).toBeInTheDocument());
    expect(allFilter).toHaveFocus();
  });

  it('dismisses when a modal drawer takes focus', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = requestUrl(input);
      if (url.includes('/v1/messages/conversations')) {
        return json({ conversations: [], nextCursor: null });
      }
      return json({
        notifications: [],
        pageInfo: { hasNextPage: false, page: 1, pageSize: 25, total: 0 },
      });
    });

    render(
      <>
        <div aria-label="Create client" role="dialog" tabIndex={-1}>
          Client creation drawer
        </div>
        <I18nProvider initialLocale="en">
          <NotificationCenter
            accessToken="token"
            messageUnreadCount={0}
            onNavigatePath={vi.fn()}
            permissions={['notifications:view_own']}
          />
        </I18nProvider>
      </>,
    );
    const drawer = screen.getByRole('dialog', { name: 'Create client' });
    const bell = await screen.findByRole('button', { name: 'Notifications' });
    fireEvent.click(bell);
    const panel = await screen.findByRole('region', { name: 'Notifications' });
    const heading = screen.getByRole('heading', { name: 'Notifications' });
    await waitFor(() => expect(heading).toHaveFocus());
    fireEvent.blur(heading, {
      relatedTarget: drawer,
    });
    act(() => drawer.focus());

    await waitFor(() => expect(panel).not.toBeInTheDocument());
    expect(drawer).toHaveFocus();
  });

  it('combines authorized activity while keeping mark-all scoped to Notification rows', async () => {
    const calls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = requestUrl(input);
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      if (url.includes('/v1/messages/conversations')) {
        return json({ conversations: [conversation], nextCursor: null });
      }
      if (url.endsWith('/read-all')) return json({ updatedCount: 1 });
      if (url.includes('/v1/notifications')) {
        return json({
          notifications: [notification],
          pageInfo: { hasNextPage: false, page: 1, pageSize: 25, total: 1 },
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    renderCenter();
    const bell = await screen.findByRole('button', { name: 'Notifications, 2 unread items' });
    fireEvent.click(bell);
    expect(await screen.findByText('Synthetic Colleague')).toBeVisible();
    expect(screen.getByText('3 unread messages')).toBeVisible();
    expect(screen.getByText('A task was assigned to you.')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Mark notifications read' }));
    await waitFor(() =>
      expect(calls.some((call) => call.includes('/notifications/read-all'))).toBe(true),
    );
    expect(calls.some((call) => call.includes('/messages/') && call.startsWith('POST'))).toBe(
      false,
    );
    expect(screen.getByText('Synthetic Colleague')).toBeVisible();
  });

  it('removes a read Notification from the Unread filter and keeps the Messages count intact', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = requestUrl(input);
      if (url.includes('/v1/messages/conversations')) {
        return json({ conversations: [conversation], nextCursor: null });
      }
      if (url.endsWith(`/v1/notifications/${NOTIFICATION_ID}/read`)) {
        return json({
          notification: {
            ...notification,
            readAt: '2026-10-14T11:00:00.000Z',
            status: 'READ',
            updatedAt: '2026-10-14T11:00:00.000Z',
          },
        });
      }
      if (url.includes('/v1/notifications')) {
        return json({
          notifications: [notification],
          pageInfo: { hasNextPage: false, page: 1, pageSize: 25, total: 1 },
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    renderCenter();
    const bell = await screen.findByRole('button', { name: 'Notifications, 2 unread items' });
    fireEvent.click(bell);
    fireEvent.click(await screen.findByRole('button', { name: 'Unread' }));
    expect(await screen.findByText('A task was assigned to you.')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Mark as read' }));

    await waitFor(() =>
      expect(screen.queryByText('A task was assigned to you.')).not.toBeInTheDocument(),
    );
    expect(bell).toHaveAccessibleName('Notifications, 1 unread item');
    expect(screen.getByText('Synthetic Colleague')).toBeVisible();
  });

  it('never requests or renders an activity source without its permission', async () => {
    const calls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = requestUrl(input);
      calls.push(url);
      if (url.includes('/v1/messages/conversations')) {
        return json({ conversations: [conversation], nextCursor: null });
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    render(
      <I18nProvider initialLocale="en">
        <NotificationCenter
          accessToken="token"
          messageUnreadCount={1}
          onNavigatePath={vi.fn()}
          permissions={['messages:view']}
        />
      </I18nProvider>,
    );

    const bell = screen.getByRole('button', { name: 'Notifications, 1 unread item' });
    fireEvent.click(bell);
    expect(await screen.findByText('Synthetic Colleague')).toBeVisible();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('/v1/messages/conversations?filter=unread');
    expect(calls.some((url) => url.includes('/v1/notifications'))).toBe(false);
    expect(screen.queryByRole('button', { name: 'Mark notifications read' })).toBeNull();
  });

  it('does not render or fetch when neither activity source is authorized', () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    render(
      <I18nProvider initialLocale="en">
        <NotificationCenter
          accessToken="token"
          messageUnreadCount={null}
          onNavigatePath={vi.fn()}
          permissions={[]}
        />
      </I18nProvider>,
    );

    expect(screen.queryByRole('button', { name: 'Notifications' })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('drops a notification count response started with a replaced access token', async () => {
    let resolveStale: (response: Response) => void = () => undefined;
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const headers = input instanceof Request ? input.headers : new Headers(init?.headers);
      if (headers.get('Authorization') === 'Bearer token-a') {
        return new Promise<Response>((resolve) => {
          resolveStale = resolve;
        });
      }
      return json({
        notifications: [],
        pageInfo: { hasNextPage: false, page: 1, pageSize: 1, total: 0 },
      });
    });
    const view = (accessToken: string) => (
      <I18nProvider initialLocale="en">
        <NotificationCenter
          accessToken={accessToken}
          messageUnreadCount={0}
          onNavigatePath={vi.fn()}
          permissions={['notifications:view_own']}
        />
      </I18nProvider>
    );
    const { rerender } = render(view('token-a'));
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));

    rerender(view('token-b'));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Notifications' })).toBeVisible(),
    );

    resolveStale(
      new Response(
        JSON.stringify({
          notifications: [],
          pageInfo: { hasNextPage: false, page: 1, pageSize: 1, total: 9 },
        }),
        { status: 200 },
      ),
    );
    await Promise.resolve();
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeVisible();
    expect(screen.queryByRole('button', { name: /9 unread items/ })).toBeNull();
  });

  it('opens the exact conversation and restores bell focus after Escape', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = requestUrl(input);
      if (url.includes('/v1/messages/conversations')) {
        return json({ conversations: [conversation], nextCursor: null });
      }
      return json({
        notifications: [],
        pageInfo: { hasNextPage: false, page: 1, pageSize: 25, total: 0 },
      });
    });
    const navigate = renderCenter();
    const bell = await screen.findByRole('button', { name: 'Notifications, 1 unread item' });
    fireEvent.click(bell);
    const conversationLink = await screen.findByRole('link', { name: /Synthetic Colleague/ });
    expect(conversationLink).toHaveAttribute('href', `/messages?conversation=${CONVERSATION_ID}`);
    fireEvent.click(conversationLink);
    expect(navigate).toHaveBeenCalledWith(`/messages?conversation=${CONVERSATION_ID}`);

    fireEvent.click(bell);
    const panel = await screen.findByRole('region', { name: 'Notifications' });
    fireEvent.keyDown(panel, { key: 'Escape' });
    await waitFor(() => expect(bell).toHaveFocus());
  });
});
