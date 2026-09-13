import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AuthenticatedUser, Notification, TaskDetail, TaskSummary } from '@hire-me/contracts';

import { I18nProvider, useI18n } from '../i18n/index.js';
import {
  AMINA_ID,
  OMAR_ID,
  OMAR_SALES_ID,
  TASK_A_ID,
  TASK_B_ID,
  taskDetail,
  taskNotification,
  taskPeople,
  taskSummary,
  taskUser,
} from './task-test-data.js';
import { TasksPanel } from './TasksPanel.js';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}

function page(tasks: TaskSummary[]) {
  return json({
    pageInfo: { hasNextPage: false, page: 1, pageSize: 25, total: tasks.length },
    tasks,
  });
}

function notificationPage(notifications: Notification[] = []) {
  return json({
    notifications,
    pageInfo: { hasNextPage: false, page: 1, pageSize: 25, total: notifications.length },
  });
}

function detail(task: TaskDetail = taskDetail) {
  return json({ task });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, reject, resolve };
}

type Call = { body: unknown; method: string; url: string };
type Route = (url: string, init: RequestInit | undefined) => Promise<Response> | undefined;

/**
 * One fetch stub for the Task container. A test overrides only the requests it
 * cares about; everything else answers with the synthetic defaults.
 */
function mockApi(route: Route = () => undefined, tasks: TaskSummary[] = [taskSummary]) {
  const calls: Call[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = input instanceof Request ? input.url : input.toString();
    calls.push({
      body: typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined,
      method: init?.method ?? 'GET',
      url,
    });
    const custom = route(url, init);
    if (custom) return custom;
    if (url.includes('/v1/notifications')) return Promise.resolve(notificationPage());
    if (url.includes('/v1/tasks/user-options')) return Promise.resolve(json({ users: taskPeople }));
    if (url.endsWith(`/v1/tasks/${TASK_A_ID}`)) return Promise.resolve(detail());
    if (url.includes('/v1/tasks?')) {
      const status = new URL(url).searchParams.get('status');
      return Promise.resolve(page(tasks.filter((task) => !status || task.status === status)));
    }
    return Promise.reject(new Error(`Unexpected request ${init?.method ?? 'GET'} ${url}`));
  });
  return calls;
}

const listCalls = (calls: Call[]) => calls.filter((call) => call.url.includes('/v1/tasks?'));

function renderPanel(token = 'task-token', user: AuthenticatedUser = taskUser) {
  return render(
    <I18nProvider initialLocale="en">
      <TasksPanel accessToken={token} user={user} />
    </I18nProvider>,
  );
}

async function openTask(title = 'Review candidate follow-up') {
  fireEvent.click(await screen.findByRole('button', { name: title }));
  return screen.findByRole('dialog');
}

function closeTask() {
  fireEvent.click(screen.getByRole('button', { name: 'Close task details' }));
}

afterEach(() => vi.restoreAllMocks());

describe('Task container reads and concurrency', () => {
  it('loads each board column with the preserved page size, applies filters, and reads detail', async () => {
    const calls = mockApi();
    renderPanel();
    await screen.findByRole('button', { name: 'Review candidate follow-up' });
    const statuses = listCalls(calls).map((call) => new URL(call.url).searchParams.get('status'));
    expect(statuses).toEqual(['OPEN', 'IN_PROGRESS', 'WAITING', 'BLOCKED', 'COMPLETED']);
    expect(listCalls(calls).every((call) => call.url.includes('pageSize=25'))).toBe(true);

    fireEvent.change(screen.getByLabelText('Search tasks'), { target: { value: 'client' } });
    fireEvent.change(screen.getByLabelText('Priority'), { target: { value: 'URGENT' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    await waitFor(() =>
      expect(
        listCalls(calls).filter(
          (call) => call.url.includes('search=client') && call.url.includes('priority=URGENT'),
        ),
      ).toHaveLength(5),
    );

    const dialog = await openTask();
    expect(
      await within(dialog).findByText('Client asked for a response before noon.'),
    ).toBeVisible();
  });

  it('never lets a late detail for task A replace task B', async () => {
    const pendingA = deferred<Response>();
    const taskB = { ...taskDetail, id: TASK_B_ID, title: 'Prepare interview notes' };
    mockApi(
      (url) => {
        if (url.endsWith(`/v1/tasks/${TASK_A_ID}`)) return pendingA.promise;
        if (url.endsWith(`/v1/tasks/${TASK_B_ID}`)) return Promise.resolve(detail(taskB));
        return undefined;
      },
      [taskSummary, { ...taskSummary, id: TASK_B_ID, title: taskB.title }],
    );
    renderPanel();
    await openTask();
    closeTask();
    await openTask('Prepare interview notes');
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Prepare interview notes' }),
    ).toBeVisible();
    await act(async () => {
      pendingA.resolve(detail());
      await pendingA.promise;
    });
    expect(
      screen.getByRole('heading', { level: 2, name: 'Prepare interview notes' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('heading', { level: 2, name: 'Review candidate follow-up' }),
    ).not.toBeInTheDocument();
  });

  it('shows no stale mutation feedback after selecting another task', async () => {
    const pending = deferred<Response>();
    const taskB = { ...taskDetail, id: TASK_B_ID, title: 'Prepare interview notes' };
    mockApi(
      (url, init) => {
        if (url.endsWith(`/${TASK_A_ID}/status`) && init?.method === 'POST') return pending.promise;
        if (url.endsWith(`/v1/tasks/${TASK_B_ID}`)) return Promise.resolve(detail(taskB));
        return undefined;
      },
      [taskSummary, { ...taskSummary, id: TASK_B_ID, title: taskB.title }],
    );
    renderPanel();
    const dialog = await openTask();
    await within(dialog).findByText('Client asked for a response before noon.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Move task' }));
    closeTask();
    await openTask('Prepare interview notes');
    await screen.findByRole('heading', { level: 2, name: 'Prepare interview notes' });
    await act(async () => {
      pending.resolve(detail({ ...taskDetail, status: 'IN_PROGRESS' }));
      await pending.promise;
    });
    expect(screen.queryByText(/Task moved to/)).not.toBeInTheDocument();
  });

  it('invalidates a pending task detail when the session token changes', async () => {
    const oldDetail = deferred<Response>();
    let detailReads = 0;
    const currentTask = { ...taskDetail, title: 'Current session task' };
    mockApi((url) => {
      if (url.endsWith(`/v1/tasks/${TASK_A_ID}`)) {
        detailReads += 1;
        return detailReads === 1 ? oldDetail.promise : Promise.resolve(detail(currentTask));
      }
      return undefined;
    });
    const view = renderPanel('old-token');
    await openTask();
    view.rerender(
      <I18nProvider initialLocale="en">
        <TasksPanel accessToken="new-token" user={taskUser} />
      </I18nProvider>,
    );
    // The new session starts clean: the old selection is closed.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await openTask();
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Current session task' }),
    ).toBeVisible();
    await act(async () => {
      oldDetail.resolve(detail());
      await oldDetail.promise;
    });
    expect(screen.getByRole('heading', { level: 2, name: 'Current session task' })).toBeVisible();
  });

  it('uses the latest applied filters for a refresh after a pending mutation', async () => {
    const pending = deferred<Response>();
    const calls = mockApi((url, init) =>
      url.endsWith(`/${TASK_A_ID}/status`) && init?.method === 'POST' ? pending.promise : undefined,
    );
    renderPanel();
    const dialog = await openTask();
    await within(dialog).findByText('Client asked for a response before noon.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Move task' }));
    closeTask();
    fireEvent.change(screen.getByLabelText('Search tasks'), { target: { value: 'new filter' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    await waitFor(() =>
      expect(
        listCalls(calls).filter((call) => call.url.includes('search=new+filter')),
      ).toHaveLength(5),
    );
    const before = calls.length;
    await act(async () => {
      pending.resolve(detail({ ...taskDetail, status: 'IN_PROGRESS' }));
      await pending.promise;
    });
    await waitFor(() =>
      expect(
        listCalls(calls.slice(before)).filter((call) => call.url.includes('search=new+filter')),
      ).toHaveLength(5),
    );
    expect(
      listCalls(calls.slice(before)).every((call) => call.url.includes('search=new+filter')),
    ).toBe(true);
  });

  it('omits an untouched due date from the update request', async () => {
    const calls = mockApi((url, init) =>
      url.endsWith(`/v1/tasks/${TASK_A_ID}`) && init?.method === 'PATCH'
        ? Promise.resolve(detail({ ...taskDetail, title: 'Renamed' }))
        : undefined,
    );
    renderPanel();
    const dialog = await openTask();
    await within(dialog).findByText('Client asked for a response before noon.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Edit task' }));
    fireEvent.change(within(dialog).getByLabelText(/^Title/), { target: { value: 'Renamed' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(calls.find((call) => call.method === 'PATCH')?.body).toEqual({
        description: 'Confirm the candidate follow-up with the client.',
        priority: 'URGENT',
        timezone: 'Europe/Paris',
        title: 'Renamed',
      }),
    );
    expect(await screen.findByText('Task updated.')).toBeVisible();
  });

  it('locks repeated create submission until the first request settles', async () => {
    const pending = deferred<Response>();
    let creates = 0;
    mockApi((url, init) => {
      if (url.endsWith('/v1/tasks') && init?.method === 'POST') {
        creates += 1;
        return pending.promise;
      }
      return undefined;
    });
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'New task' }));
    fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: 'One request only' } });
    const submit = screen.getByRole('button', { name: 'Create task' });
    fireEvent.click(submit);
    fireEvent.click(submit);
    fireEvent.submit(submit.closest('form')!);
    expect(creates).toBe(1);
    await act(async () => {
      pending.resolve(detail({ ...taskDetail, title: 'One request only' }));
      await pending.promise;
    });
    expect(await screen.findByText('Task created.')).toBeVisible();
  });
});

describe('Task write lifecycle across sessions and filters', () => {
  it('never lets a token A write release or report into a token B write', async () => {
    const moveA = deferred<Response>();
    const moveB = deferred<Response>();
    let moves = 0;
    mockApi((url, init) => {
      if (url.endsWith(`/${TASK_A_ID}/status`) && init?.method === 'POST') {
        moves += 1;
        return moves === 1 ? moveA.promise : moveB.promise;
      }
      return undefined;
    });
    const view = renderPanel('token-a');
    let dialog = await openTask();
    await within(dialog).findByText('Client asked for a response before noon.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Move task' }));

    view.rerender(
      <I18nProvider initialLocale="en">
        <TasksPanel accessToken="token-b" user={taskUser} />
      </I18nProvider>,
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    dialog = await openTask();
    await within(dialog).findByText('Client asked for a response before noon.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Move task' }));
    expect(moves).toBe(2);
    expect(within(dialog).getByRole('button', { name: 'Move task' })).toHaveAttribute(
      'aria-busy',
      'true',
    );

    await act(async () => {
      moveA.resolve(detail({ ...taskDetail, status: 'IN_PROGRESS' }));
      await moveA.promise;
    });
    // Session A's completion neither unlocked session B's write nor reported into it.
    expect(within(dialog).getByRole('button', { name: 'Move task' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
    expect(within(dialog).getByRole('button', { name: 'Add comment' })).toBeDisabled();
    expect(screen.queryByText(/Task moved to/)).not.toBeInTheDocument();

    await act(async () => {
      moveB.resolve(detail({ ...taskDetail, status: 'WAITING' }));
      await moveB.promise;
    });
    expect(await screen.findByText('Task moved to Waiting.')).toBeVisible();
    expect(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Add comment' }),
    ).toBeEnabled();
  });

  it('shows no feedback from an old session’s notification action', async () => {
    const markRead = deferred<Response>();
    mockApi((url, init) => {
      if (url.includes('/v1/notifications/') && init?.method === 'POST') return markRead.promise;
      if (url.includes('/v1/notifications'))
        return Promise.resolve(notificationPage([taskNotification()]));
      return undefined;
    });
    const view = renderPanel('token-a');
    fireEvent.click(await screen.findByRole('button', { name: 'Mark read' }));
    view.rerender(
      <I18nProvider initialLocale="en">
        <TasksPanel accessToken="token-b" user={taskUser} />
      </I18nProvider>,
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Mark read' })).toBeEnabled());
    await act(async () => {
      markRead.reject(new Error('late failure'));
      await markRead.promise.catch(() => undefined);
    });
    expect(screen.queryByText('Action failed')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark read' })).toBeEnabled();
  });

  it('refreshes notifications with the latest filter after a write started under another', async () => {
    const markRead = deferred<Response>();
    const unread = taskNotification();
    const read = taskNotification({
      id: '88888888-8888-4888-8888-888888888888',
      status: 'READ',
      type: 'tasks.comment.mention',
    });
    const calls = mockApi((url, init) => {
      if (url.includes('/v1/notifications/') && init?.method === 'POST') return markRead.promise;
      if (url.includes('/v1/notifications')) {
        const status = new URL(url).searchParams.get('status');
        return Promise.resolve(notificationPage(status === 'READ' ? [read] : [unread]));
      }
      return undefined;
    });
    renderPanel();
    fireEvent.change(await screen.findByLabelText('Notification status'), {
      target: { value: 'UNREAD' },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Mark read' }));
    fireEvent.change(screen.getByLabelText('Notification status'), { target: { value: 'READ' } });
    expect(await screen.findByText('Mentioned in a task')).toBeVisible();
    const before = calls.length;
    await act(async () => {
      markRead.resolve(json({ notification: { ...unread, status: 'READ' } }));
      await markRead.promise;
    });
    await waitFor(() =>
      expect(calls.slice(before).some((call) => call.url.includes('/v1/notifications?'))).toBe(
        true,
      ),
    );
    const refreshes = calls.slice(before).filter((call) => call.url.includes('/v1/notifications?'));
    expect(refreshes.every((call) => call.url.includes('status=READ'))).toBe(true);
    expect(screen.getByText('Mentioned in a task')).toBeVisible();
    expect(screen.queryByText('Task overdue')).not.toBeInTheDocument();
  });
});

describe('Task people selectors send IDs chosen by name', () => {
  async function openWithOptions() {
    const dialog = await openTask();
    await within(dialog).findByText('Client asked for a response before noon.');
    await waitFor(() =>
      expect(
        within(dialog).getAllByRole('option', { name: /Amina Berrada/ }).length,
      ).toBeGreaterThan(0),
    );
    return dialog;
  }

  const post = (calls: Call[], suffix: string) =>
    calls.find((call) => call.method === 'POST' && call.url.endsWith(suffix));

  it('changes the owner and adds an assignee by name', async () => {
    const calls = mockApi((url, init) =>
      init?.method === 'POST' && (url.endsWith('/owner') || url.endsWith('/assignments'))
        ? Promise.resolve(detail())
        : undefined,
    );
    renderPanel();
    const dialog = await openWithOptions();
    const owner = within(dialog).getByLabelText(/^Owner( \*)?$/);
    expect(
      within(owner).getByRole('option', { name: 'Omar Tazi · omar.tazi.sales@example.test' }),
    ).toHaveValue(OMAR_SALES_ID);
    fireEvent.change(owner, { target: { value: OMAR_SALES_ID } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Change owner' }));
    await waitFor(() =>
      expect(post(calls, '/owner')?.body).toEqual({ ownerUserId: OMAR_SALES_ID, reason: null }),
    );

    await screen.findByText('Task owner changed.');
    fireEvent.change(within(dialog).getByLabelText(/^Assignee( \*)?$/), {
      target: { value: AMINA_ID },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add assignee' }));
    await waitFor(() =>
      expect(post(calls, '/assignments')?.body).toEqual({ reason: null, userId: AMINA_ID }),
    );

    const lookups = calls.filter((call) => call.url.includes('/user-options'));
    expect(lookups.some((call) => call.url.includes(`purpose=owner&taskId=${TASK_A_ID}`))).toBe(
      true,
    );
    expect(lookups.some((call) => call.url.includes(`purpose=assignee&taskId=${TASK_A_ID}`))).toBe(
      true,
    );
  });

  it('mentions people and schedules a reminder by name', async () => {
    const calls = mockApi((url, init) => {
      if (init?.method !== 'POST') return undefined;
      if (url.endsWith('/comments')) {
        return Promise.resolve(
          json({ comment: { ...taskDetail.comments[0]!, mentionedUserIds: [OMAR_ID] } }),
        );
      }
      if (url.endsWith('/reminders'))
        return Promise.resolve(json({ reminder: taskDetail.reminders[0] }));
      return undefined;
    });
    renderPanel();
    const dialog = await openWithOptions();
    fireEvent.change(within(dialog).getByLabelText(/^Comment/), {
      target: { value: 'Please review.' },
    });
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /omar.tazi@example.test/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add comment' }));
    await waitFor(() =>
      expect(post(calls, '/comments')?.body).toEqual({
        body: 'Please review.',
        mentionedUserIds: [OMAR_ID],
      }),
    );
    await screen.findByText('Comment added.');

    fireEvent.change(within(dialog).getByLabelText(/^Recipient( \*)?$/), {
      target: { value: AMINA_ID },
    });
    fireEvent.change(within(dialog).getByLabelText(/Reminder date and time/), {
      target: { value: '2026-09-20T09:30' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Schedule reminder' }));
    await waitFor(() =>
      expect(post(calls, '/reminders')?.body).toEqual({
        recipientUserId: AMINA_ID,
        remindAt: new Date('2026-09-20T09:30').toISOString(),
      }),
    );
    const lookups = calls.filter((call) => call.url.includes('/user-options'));
    expect(lookups.some((call) => call.url.includes(`purpose=mention&taskId=${TASK_A_ID}`))).toBe(
      true,
    );
    expect(lookups.some((call) => call.url.includes(`purpose=reminder&taskId=${TASK_A_ID}`))).toBe(
      true,
    );
  });

  it('creates a task with an assignee chosen by name and the current user as owner', async () => {
    const calls = mockApi((url, init) =>
      url.endsWith('/v1/tasks') && init?.method === 'POST' ? Promise.resolve(detail()) : undefined,
    );
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'New task' }));
    fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: 'Call the client' } });
    const assignee = screen.getByLabelText(/^Assignee( \*)?$/);
    await waitFor(() => expect(within(assignee).getAllByRole('option')).toHaveLength(4));
    fireEvent.change(assignee, { target: { value: OMAR_ID } });
    fireEvent.click(screen.getByRole('button', { name: 'Create task' }));
    await waitFor(() =>
      expect(post(calls, '/v1/tasks')?.body).toEqual({
        assigneeUserIds: [OMAR_ID],
        context: {},
        description: null,
        dueAt: null,
        ownerUserId: taskUser.id,
        priority: 'NORMAL',
        title: 'Call the client',
      }),
    );
    expect(
      calls.some((call) => call.url.includes('purpose=assignee') && !call.url.includes('taskId')),
    ).toBe(true);
  });

  it('asks for no people lookup an actor is not allowed to use', async () => {
    const calls = mockApi();
    renderPanel('task-token', {
      ...taskUser,
      permissions: ['tasks:view', 'notifications:view_own'],
    });
    const dialog = await openTask();
    await within(dialog).findByText('Client asked for a response before noon.');
    expect(calls.some((call) => call.url.includes('/user-options'))).toBe(false);
    expect(within(dialog).queryByRole('combobox', { name: /^Owner/ })).not.toBeInTheDocument();
  });
});

function LocaleHarness() {
  const { locale, setLocale } = useI18n();
  const [mounted] = useState(true);
  return (
    <>
      {mounted ? <TasksPanel accessToken="task-token" user={taskUser} /> : null}
      <button onClick={() => setLocale(locale === 'en' ? 'fr' : 'en')}>switch</button>
    </>
  );
}

it('switches locale on the same mount without refetching or clearing the open create form', async () => {
  const calls = mockApi();
  render(
    <I18nProvider initialLocale="en">
      <LocaleHarness />
    </I18nProvider>,
  );
  fireEvent.click(await screen.findByRole('button', { name: 'New task' }));
  fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: 'Draft in progress' } });
  await waitFor(() => expect(calls.some((call) => call.url.includes('/user-options'))).toBe(true));
  const before = calls.length;
  fireEvent.click(screen.getByRole('button', { name: 'switch' }));
  expect(await screen.findByRole('heading', { name: 'Pipeline des tâches' })).toBeVisible();
  expect(screen.getByDisplayValue('Draft in progress')).toBeVisible();
  expect(screen.getByRole('heading', { name: 'À faire' })).toBeVisible();
  expect(calls.length).toBe(before);
});
