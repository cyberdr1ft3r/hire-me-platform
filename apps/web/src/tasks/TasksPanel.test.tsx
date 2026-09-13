import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AuthenticatedUser, Notification, TaskDetail, TaskSummary } from '@hire-me/contracts';

import { I18nProvider, useI18n } from '../i18n/index.js';
import {
  AMINA_ID,
  MISSION_A_ID,
  MISSION_B_ID,
  MISSION_CANDIDATE_A_ID,
  MISSION_CANDIDATE_B_ID,
  OMAR_ID,
  OMAR_SALES_ID,
  TASK_A_ID,
  TASK_B_ID,
  UUID_PATTERN,
  taskDetail,
  taskMission,
  taskMissionCandidate,
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

/** The unread-count read: unread notifications only, one row, for its total. */
function isUnreadCountRead(call: Call): boolean {
  if (!call.url.includes('/v1/notifications?')) return false;
  const parameters = new URL(call.url).searchParams;
  return parameters.get('status') === 'UNREAD' && parameters.get('pageSize') === '1';
}

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
    const reads = calls.slice(before).filter((call) => call.url.includes('/v1/notifications?'));
    // The unread count is its own read (unread only, one row); every list refresh
    // uses the latest filter.
    const refreshes = reads.filter((call) => !isUnreadCountRead(call));
    expect(refreshes.length).toBeGreaterThan(0);
    expect(refreshes.every((call) => call.url.includes('status=READ'))).toBe(true);
    expect(reads.some(isUnreadCountRead)).toBe(true);
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

describe('Task detail management through the existing endpoints', () => {
  const OMAR_ASSIGNMENT_ID = '33333333-3333-4333-8333-000000000002';
  const COMMENT_ID = taskDetail.comments[0]!.id;
  const REMINDER_ID = taskDetail.reminders[0]!.id;
  const withOmar: TaskDetail = {
    ...taskDetail,
    assigneeUserIds: [taskUser.id, OMAR_ID],
    assignments: [
      ...taskDetail.assignments,
      {
        ...taskDetail.assignments[0]!,
        id: OMAR_ASSIGNMENT_ID,
        userDisplayName: 'Omar Tazi',
        userId: OMAR_ID,
      },
    ],
  };
  const failure = (status: number, code: string) =>
    json({ error: { code, message: 'Refused by the synthetic API.' } }, status);
  const isGet = (init: RequestInit | undefined) => (init?.method ?? 'GET') === 'GET';

  async function openLoaded() {
    const dialog = await openTask();
    await within(dialog).findByText('Client asked for a response before noon.');
    return dialog;
  }

  it('removes one assignee by name with the required reason, once, by assignment ID', async () => {
    const removal = deferred<Response>();
    let removals = 0;
    const calls = mockApi((url, init) => {
      if (url.endsWith(`/v1/tasks/${TASK_A_ID}`) && isGet(init)) {
        return Promise.resolve(detail(withOmar));
      }
      if (url.endsWith(`/assignments/${OMAR_ASSIGNMENT_ID}/remove`) && init?.method === 'POST') {
        removals += 1;
        return removal.promise;
      }
      return undefined;
    });
    renderPanel();
    const dialog = await openLoaded();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove Omar Tazi' }));
    const form = within(dialog).getByRole('form', { name: 'Remove Omar Tazi' });
    fireEvent.submit(form);
    expect(removals).toBe(0);
    fireEvent.change(within(form).getByLabelText(/^Reason/), {
      target: { value: 'Moved to another client.' },
    });
    const submit = within(form).getByRole('button', { name: 'Remove assignee' });
    fireEvent.click(submit);
    fireEvent.click(submit);
    fireEvent.submit(form);
    expect(removals).toBe(1);
    const request = calls.find((call) => call.url.endsWith('/remove'))!;
    expect(request.url).toContain(
      `/v1/tasks/${TASK_A_ID}/assignments/${OMAR_ASSIGNMENT_ID}/remove`,
    );
    expect(request.body).toEqual({ reason: 'Moved to another client.' });

    await act(async () => {
      removal.resolve(detail(taskDetail));
      await removal.promise;
    });
    expect(await screen.findByText('Assignee removed.')).toBeVisible();
    expect(
      within(screen.getByRole('dialog')).queryByRole('button', { name: 'Remove Omar Tazi' }),
    ).not.toBeInTheDocument();
  });

  it('edits a comment’s text only and archives a comment, re-reading the task each time', async () => {
    let current: TaskDetail = taskDetail;
    const calls = mockApi((url, init) => {
      if (url.endsWith(`/v1/tasks/${TASK_A_ID}`) && isGet(init)) {
        return Promise.resolve(detail(current));
      }
      if (url.endsWith(`/comments/${COMMENT_ID}`) && init?.method === 'PATCH') {
        const edited = {
          ...taskDetail.comments[0]!,
          body: 'Client wants a reply today.',
          status: 'EDITED' as const,
        };
        current = { ...taskDetail, comments: [edited] };
        return Promise.resolve(json({ comment: edited }));
      }
      if (url.endsWith(`/comments/${COMMENT_ID}/archive`) && init?.method === 'POST') {
        const archived = { ...current.comments[0]!, status: 'ARCHIVED' as const };
        current = { ...taskDetail, comments: [] };
        return Promise.resolve(json({ comment: archived }));
      }
      return undefined;
    });
    renderPanel();
    const dialog = await openLoaded();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Edit comment' }));
    const form = within(dialog).getByRole('form', { name: 'Edit comment' });
    fireEvent.change(within(form).getByLabelText(/^Comment/), {
      target: { value: 'Client wants a reply today.' },
    });
    fireEvent.click(within(form).getByRole('button', { name: 'Save comment' }));
    // Only the text is sent; the comment's mentions are not part of an edit.
    await waitFor(() =>
      expect(calls.find((call) => call.method === 'PATCH')?.body).toEqual({
        body: 'Client wants a reply today.',
      }),
    );
    expect(await screen.findByText('Comment updated.')).toBeVisible();
    expect(await within(dialog).findByText('Client wants a reply today.')).toBeVisible();
    expect(within(dialog).getByText('Edited')).toBeVisible();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Archive comment' }));
    const confirm = within(dialog).getByRole('form', { name: 'Archive comment' });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Archive comment' }));
    expect(await screen.findByText('Comment archived.')).toBeVisible();
    expect(
      calls.some(
        (call) => call.method === 'POST' && call.url.endsWith(`/comments/${COMMENT_ID}/archive`),
      ),
    ).toBe(true);
    expect(await within(dialog).findByText('No comments yet.')).toBeVisible();
  });

  it('reports a refused comment action generically and keeps the comment', async () => {
    mockApi((url, init) =>
      url.endsWith(`/comments/${COMMENT_ID}/archive`) && init?.method === 'POST'
        ? Promise.resolve(failure(403, 'TASK_COMMENT_AUTHOR_REQUIRED'))
        : undefined,
    );
    renderPanel();
    const dialog = await openLoaded();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Archive comment' }));
    const confirm = within(dialog).getByRole('form', { name: 'Archive comment' });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Archive comment' }));
    expect(
      await screen.findByText('The action could not be completed. Check the task and try again.'),
    ).toBeVisible();
    expect(document.body.textContent).not.toMatch(/author|TASK_COMMENT|403|Refused/i);
    expect(within(dialog).getByText('Client asked for a response before noon.')).toBeVisible();
  });

  it('drops a comment edit result that returns after the session changed', async () => {
    const edit = deferred<Response>();
    mockApi((url, init) =>
      url.endsWith(`/comments/${COMMENT_ID}`) && init?.method === 'PATCH'
        ? edit.promise
        : undefined,
    );
    const view = renderPanel('token-a');
    let dialog = await openLoaded();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Edit comment' }));
    const form = within(dialog).getByRole('form', { name: 'Edit comment' });
    fireEvent.change(within(form).getByLabelText(/^Comment/), { target: { value: 'Late text.' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save comment' }));
    view.rerender(
      <I18nProvider initialLocale="en">
        <TasksPanel accessToken="token-b" user={taskUser} />
      </I18nProvider>,
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    dialog = await openLoaded();
    await act(async () => {
      edit.resolve(json({ comment: { ...taskDetail.comments[0]!, body: 'Late text.' } }));
      await edit.promise;
    });
    expect(screen.queryByText('Comment updated.')).not.toBeInTheDocument();
    // Session B was never locked by session A's edit.
    expect(within(dialog).getByRole('button', { name: 'Edit comment' })).toBeEnabled();
  });

  it('reschedules and cancels a pending reminder, converting local time to an instant', async () => {
    let current: TaskDetail = taskDetail;
    const calls = mockApi((url, init) => {
      if (url.endsWith(`/v1/tasks/${TASK_A_ID}`) && isGet(init)) {
        return Promise.resolve(detail(current));
      }
      if (url.endsWith(`/reminders/${REMINDER_ID}`) && init?.method === 'PATCH') {
        const { remindAt } = JSON.parse(init.body as string) as { remindAt: string };
        current = { ...taskDetail, reminders: [{ ...taskDetail.reminders[0]!, remindAt }] };
        return Promise.resolve(json({ reminder: current.reminders[0] }));
      }
      if (url.endsWith(`/reminders/${REMINDER_ID}/cancel`) && init?.method === 'POST') {
        current = {
          ...taskDetail,
          reminders: [{ ...current.reminders[0]!, status: 'CANCELED' }],
        };
        return Promise.resolve(json({ reminder: current.reminders[0] }));
      }
      return undefined;
    });
    renderPanel();
    const dialog = await openLoaded();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reschedule' }));
    const form = within(dialog).getByRole('form', { name: 'Reschedule' });
    fireEvent.change(within(form).getByLabelText(/^New reminder date and time/), {
      target: { value: '2026-09-21T08:15' },
    });
    fireEvent.click(within(form).getByRole('button', { name: 'Save new time' }));
    await waitFor(() =>
      expect(calls.find((call) => call.method === 'PATCH')?.body).toEqual({
        remindAt: new Date('2026-09-21T08:15').toISOString(),
      }),
    );
    expect(await screen.findByText('Reminder rescheduled.')).toBeVisible();

    fireEvent.click(await within(dialog).findByRole('button', { name: 'Cancel reminder' }));
    const confirm = within(dialog).getByRole('form', { name: 'Cancel reminder' });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Cancel reminder' }));
    expect(await screen.findByText('Reminder canceled.')).toBeVisible();
    expect(
      calls.some(
        (call) => call.method === 'POST' && call.url.endsWith(`/reminders/${REMINDER_ID}/cancel`),
      ),
    ).toBe(true);
    // A canceled reminder is kept, shown with its translated state, and offers no action.
    const reminders = dialog.querySelector<HTMLElement>('.tasks__reminders')!;
    expect(await within(reminders).findByText('Canceled')).toBeVisible();
    expect(within(reminders).queryByRole('button', { name: 'Reschedule' })).not.toBeInTheDocument();
  });

  it('drops a reminder cancel result once another task is selected', async () => {
    const cancel = deferred<Response>();
    const taskB = { ...taskDetail, id: TASK_B_ID, reminders: [], title: 'Prepare interview notes' };
    mockApi(
      (url, init) => {
        if (url.endsWith(`/reminders/${REMINDER_ID}/cancel`) && init?.method === 'POST') {
          return cancel.promise;
        }
        if (url.endsWith(`/v1/tasks/${TASK_B_ID}`)) return Promise.resolve(detail(taskB));
        return undefined;
      },
      [taskSummary, { ...taskSummary, id: TASK_B_ID, title: taskB.title }],
    );
    renderPanel();
    const dialog = await openLoaded();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel reminder' }));
    const confirm = within(dialog).getByRole('form', { name: 'Cancel reminder' });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Cancel reminder' }));
    closeTask();
    await openTask('Prepare interview notes');
    await screen.findByRole('heading', { level: 2, name: 'Prepare interview notes' });
    await act(async () => {
      cancel.resolve(json({ reminder: { ...taskDetail.reminders[0]!, status: 'CANCELED' } }));
      await cancel.promise;
    });
    expect(screen.queryByText('Reminder canceled.')).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Prepare interview notes' }),
    ).toBeVisible();
  });
});

describe('Task notification inbox', () => {
  const countPage = (total: number) =>
    json({
      notifications: [],
      pageInfo: { hasNextPage: total > 1, page: 1, pageSize: 1, total },
    });
  const isCountUrl = (url: string) => isUnreadCountRead({ body: undefined, method: 'GET', url });

  it('opens a notification’s task in the usual detail through the task read', async () => {
    const calls = mockApi(
      (url) =>
        url.includes('/v1/notifications')
          ? Promise.resolve(notificationPage([taskNotification()]))
          : undefined,
      [],
    );
    renderPanel();
    const open = await screen.findByRole('button', { name: 'Open task' });
    fireEvent.click(open);
    const dialog = await screen.findByRole('dialog');
    expect(
      await within(dialog).findByRole('heading', { level: 2, name: 'Review candidate follow-up' }),
    ).toBeVisible();
    expect(
      calls.some((call) => call.method === 'GET' && call.url.endsWith(`/v1/tasks/${TASK_A_ID}`)),
    ).toBe(true);
    closeTask();
    // The task is not on the board, so focus goes back to the notification's action.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open task' })).toHaveFocus());
  });

  it('fails safely, without saying why, when the task is no longer available', async () => {
    mockApi((url) => {
      if (url.includes('/v1/notifications')) {
        return Promise.resolve(notificationPage([taskNotification()]));
      }
      if (url.endsWith(`/v1/tasks/${TASK_A_ID}`)) {
        return Promise.resolve(
          json({ error: { code: 'TASK_NOT_FOUND', message: 'Task was not found.' } }, 404),
        );
      }
      return undefined;
    }, []);
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Open task' }));
    const dialog = await screen.findByRole('dialog');
    expect(
      await within(dialog).findByRole('heading', { level: 2, name: 'Unable to load this task.' }),
    ).toBeVisible();
    expect(document.body.textContent).not.toMatch(/not found|deleted|TASK_NOT_FOUND|404/i);
  });

  it('never opens an old session’s notification task in a new session', async () => {
    const oldRead = deferred<Response>();
    let reads = 0;
    mockApi((url) => {
      if (url.includes('/v1/notifications')) {
        return Promise.resolve(notificationPage([taskNotification()]));
      }
      if (url.endsWith(`/v1/tasks/${TASK_A_ID}`)) {
        reads += 1;
        return reads === 1 ? oldRead.promise : Promise.resolve(detail());
      }
      return undefined;
    }, []);
    const view = renderPanel('token-a');
    fireEvent.click(await screen.findByRole('button', { name: 'Open task' }));
    await screen.findByRole('dialog');
    view.rerender(
      <I18nProvider initialLocale="en">
        <TasksPanel accessToken="token-b" user={taskUser} />
      </I18nProvider>,
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await act(async () => {
      oldRead.resolve(detail());
      await oldRead.promise;
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Review candidate follow-up')).not.toBeInTheDocument();
  });

  it('shows the real unread count whatever the notification filter shows', async () => {
    const read = taskNotification({
      id: '88888888-8888-4888-8888-888888888888',
      status: 'READ',
      type: 'tasks.comment.mention',
    });
    const calls = mockApi((url) => {
      if (!url.includes('/v1/notifications')) return undefined;
      if (isCountUrl(url)) return Promise.resolve(countPage(3));
      return Promise.resolve(notificationPage([read]));
    });
    renderPanel();
    expect(await screen.findByText('3 unread notifications')).toBeVisible();
    expect(screen.getByText('1 notification shown')).toBeVisible();
    const counts = calls.filter(isUnreadCountRead).length;
    expect(counts).toBe(1);
    fireEvent.change(screen.getByLabelText('Notification status'), { target: { value: 'READ' } });
    await waitFor(() =>
      expect(
        calls.some(
          (call) => call.url.includes('/v1/notifications?') && call.url.includes('status=READ'),
        ),
      ).toBe(true),
    );
    // Changing what the list shows neither refetches nor changes the unread total.
    expect(calls.filter(isUnreadCountRead)).toHaveLength(counts);
    expect(screen.getByText('3 unread notifications')).toBeVisible();
  });

  it('refreshes the unread count after a read and ignores an old session’s count', async () => {
    const oldCount = deferred<Response>();
    let countReads = 0;
    let unread = 2;
    mockApi((url, init) => {
      if (url.includes('/v1/notifications/') && init?.method === 'POST') {
        unread = 1;
        return Promise.resolve(json({ notification: { ...taskNotification(), status: 'READ' } }));
      }
      if (!url.includes('/v1/notifications')) return undefined;
      if (isCountUrl(url)) {
        countReads += 1;
        return countReads === 1 ? oldCount.promise : Promise.resolve(countPage(unread));
      }
      return Promise.resolve(notificationPage([taskNotification()]));
    });
    const view = renderPanel('token-a');
    await screen.findByRole('button', { name: 'Mark read' });
    view.rerender(
      <I18nProvider initialLocale="en">
        <TasksPanel accessToken="token-b" user={taskUser} />
      </I18nProvider>,
    );
    expect(await screen.findByText('2 unread notifications')).toBeVisible();
    await act(async () => {
      oldCount.resolve(countPage(9));
      await oldCount.promise;
    });
    expect(screen.queryByText('9 unread notifications')).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Mark read' }));
    expect(await screen.findByText('1 unread notification')).toBeVisible();
  });
});

describe('Created by me', () => {
  it('asks the API for the actor’s own created tasks without sending any creator ID', async () => {
    const calls = mockApi();
    renderPanel();
    await screen.findByRole('button', { name: 'Review candidate follow-up' });
    fireEvent.change(screen.getByLabelText('Show'), { target: { value: 'createdByMe' } });
    fireEvent.change(screen.getByLabelText('Priority'), { target: { value: 'URGENT' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    const mine = () => listCalls(calls).filter((call) => call.url.includes('createdByMe=true'));
    await waitFor(() => expect(mine()).toHaveLength(5));
    for (const call of mine()) {
      const parameters = new URL(call.url).searchParams;
      expect(parameters.get('priority')).toBe('URGENT');
      expect(parameters.get('ownerUserId')).toBeNull();
      expect(parameters.get('assigneeUserId')).toBeNull();
      expect(parameters.has('createdByUserId')).toBe(false);
      expect(call.url).not.toContain(taskUser.id);
    }
  });
});

describe('Owner and assignee filters for a viewer without assignment rights', () => {
  const viewer: AuthenticatedUser = {
    ...taskUser,
    permissions: ['tasks:view', 'notifications:view_own'],
  };

  it('filters by owner and assignee chosen by name from the filter-only lookup', async () => {
    const calls = mockApi((url) =>
      url.includes('/v1/tasks/filter-user-options')
        ? Promise.resolve(json({ users: taskPeople }))
        : undefined,
    );
    renderPanel('task-token', viewer);
    await screen.findByRole('button', { name: 'Review candidate follow-up' });
    fireEvent.click(screen.getByRole('button', { name: 'More filters' }));
    const owner = screen.getByLabelText('Owner');
    await waitFor(() =>
      expect(
        within(owner).getByRole('option', { name: 'Omar Tazi · omar.tazi.sales@example.test' }),
      ).toHaveValue(OMAR_SALES_ID),
    );
    fireEvent.change(owner, { target: { value: OMAR_SALES_ID } });
    const assignee = screen.getByLabelText('Assignee');
    await waitFor(() =>
      expect(
        within(assignee).getByRole('option', {
          name: 'Amina Berrada · amina.berrada@example.test',
        }),
      ).toHaveValue(AMINA_ID),
    );
    fireEvent.change(assignee, { target: { value: AMINA_ID } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    const filtered = () =>
      listCalls(calls).filter((call) => {
        const parameters = new URL(call.url).searchParams;
        return (
          parameters.get('ownerUserId') === OMAR_SALES_ID &&
          parameters.get('assigneeUserId') === AMINA_ID
        );
      });
    await waitFor(() => expect(filtered()).toHaveLength(5));

    // Only the filter-only lookup was asked, once per role; never the assign-gated one.
    const lookups = calls.filter((call) => call.url.includes('user-options'));
    expect(lookups.map((call) => new URL(call.url).pathname)).toEqual([
      '/v1/tasks/filter-user-options',
      '/v1/tasks/filter-user-options',
    ]);
    expect(lookups.map((call) => new URL(call.url).searchParams.get('role')).sort()).toEqual([
      'assignee',
      'owner',
    ]);
    expect(document.body.textContent).not.toMatch(UUID_PATTERN);

    // Filtering grants nothing: the detail still offers no ownership or assignment change.
    const dialog = await openTask();
    await within(dialog).findByText('Client asked for a response before noon.');
    expect(within(dialog).queryByRole('button', { name: 'Change owner' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Add assignee' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /^Remove / })).not.toBeInTheDocument();
  });
});

describe('Mission-candidate context filter', () => {
  const missionA = taskMission(MISSION_A_ID, 'Data engineer mission', 'Client A');
  const missionB = taskMission(MISSION_B_ID, 'Finance controller mission', 'Client B');
  const candidateA = taskMissionCandidate(
    MISSION_CANDIDATE_A_ID,
    MISSION_A_ID,
    'Nadia Alaoui',
    'nadia.alaoui@example.test',
  );
  const candidateB = taskMissionCandidate(
    MISSION_CANDIDATE_B_ID,
    MISSION_B_ID,
    'Sara Chraibi',
    'sara.chraibi@example.test',
  );
  const recruiter: AuthenticatedUser = {
    ...taskUser,
    permissions: [...taskUser.permissions, 'missions:view', 'mission_candidates:view'],
  };
  const pagination = { page: 1, pageSize: 20, total: 2 };

  function mockMissions() {
    return mockApi((url) => {
      if (url.includes('/v1/missions?')) {
        return Promise.resolve(json({ missions: [missionA, missionB], pagination }));
      }
      if (url.endsWith(`/v1/missions/${MISSION_A_ID}/candidates`)) {
        return Promise.resolve(json({ candidates: [candidateA], pagination }));
      }
      if (url.endsWith(`/v1/missions/${MISSION_B_ID}/candidates`)) {
        return Promise.resolve(json({ candidates: [candidateB], pagination }));
      }
      return undefined;
    });
  }

  function Harness() {
    const { locale, setLocale } = useI18n();
    return (
      <>
        <TasksPanel accessToken="task-token" user={recruiter} />
        <button onClick={() => setLocale(locale === 'en' ? 'fr' : 'en')}>switch</button>
      </>
    );
  }

  async function chooseMission(label: string, missionId: string) {
    const mission = screen.getByLabelText(label);
    await waitFor(() =>
      expect(
        within(mission)
          .getAllByRole('option')
          .map((option) => option.getAttribute('value')),
      ).toContain(missionId),
    );
    fireEvent.change(mission, { target: { value: missionId } });
  }

  it('filters by a candidate chosen within a chosen mission, sending only missionCandidateId', async () => {
    const calls = mockMissions();
    render(
      <I18nProvider initialLocale="en">
        <Harness />
      </I18nProvider>,
    );
    await screen.findByRole('button', { name: 'Review candidate follow-up' });
    fireEvent.click(screen.getByRole('button', { name: 'More filters' }));
    fireEvent.change(screen.getByLabelText('Linked to'), {
      target: { value: 'missionCandidate' },
    });
    // The candidate choice appears only once a mission is chosen.
    expect(screen.queryByLabelText('Candidate in mission')).not.toBeInTheDocument();
    await chooseMission('Mission', MISSION_A_ID);
    expect(
      within(screen.getByLabelText('Mission')).getByRole('option', {
        name: 'Data engineer mission · Client A',
      }),
    ).toBeInTheDocument();
    const candidate = screen.getByLabelText('Candidate in mission');
    await waitFor(() =>
      expect(
        within(candidate).getByRole('option', { name: 'Nadia Alaoui · nadia.alaoui@example.test' }),
      ).toHaveValue(MISSION_CANDIDATE_A_ID),
    );
    // Only candidates of the chosen mission are offered.
    expect(within(candidate).queryByRole('option', { name: /Sara Chraibi/ })).toBeNull();
    fireEvent.change(candidate, { target: { value: MISSION_CANDIDATE_A_ID } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    const byCandidate = () =>
      listCalls(calls).filter((call) =>
        call.url.includes(`missionCandidateId=${MISSION_CANDIDATE_A_ID}`),
      );
    await waitFor(() => expect(byCandidate()).toHaveLength(5));
    for (const call of byCandidate()) {
      expect(new URL(call.url).searchParams.has('recruitmentMissionId')).toBe(false);
    }
    expect(document.body.textContent).not.toMatch(UUID_PATTERN);

    // Switching language keeps both choices and asks for nothing again.
    const before = calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'switch' }));
    expect(await screen.findByRole('heading', { name: 'Pipeline des tâches' })).toBeVisible();
    expect(screen.getByLabelText('Mission')).toHaveValue(MISSION_A_ID);
    expect(screen.getByLabelText('Candidat de la mission')).toHaveValue(MISSION_CANDIDATE_A_ID);
    expect(calls.length).toBe(before);
    fireEvent.click(screen.getByRole('button', { name: 'switch' }));
    await screen.findByRole('heading', { name: 'Task pipeline' });

    // Another mission clears the candidate of the first one.
    await chooseMission('Mission', MISSION_B_ID);
    const next = screen.getByLabelText('Candidate in mission');
    expect(next).toHaveValue('');
    await waitFor(() =>
      expect(within(next).getByRole('option', { name: /Sara Chraibi/ })).toBeInTheDocument(),
    );
    expect(within(next).queryByRole('option', { name: /Nadia Alaoui/ })).toBeNull();

    // Reset clears the mission, the candidate, and the linked-record type.
    fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }));
    await waitFor(() => expect(screen.getByLabelText('Linked to')).toHaveValue(''));
    expect(screen.queryByLabelText('Mission')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Candidate in mission')).not.toBeInTheDocument();
    const after = calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    await waitFor(() => expect(listCalls(calls.slice(after))).toHaveLength(5));
    for (const call of listCalls(calls.slice(after))) {
      expect(call.url).not.toContain('missionCandidateId');
    }
  });
});
