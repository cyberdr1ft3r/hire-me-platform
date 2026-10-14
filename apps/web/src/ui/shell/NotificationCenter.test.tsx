import type { ConversationSummary, Notification } from '@hire-me/contracts';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
        onMessageUnreadChanged={() => undefined}
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
