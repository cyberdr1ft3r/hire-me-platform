import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { TaskDetail, TaskSummary } from '@hire-me/contracts';

import { I18nProvider, useI18n } from '../i18n/index.js';
import { TASK_A_ID, TASK_B_ID, taskDetail, taskSummary, taskUser } from './task-test-data.js';
import { TasksPanel } from './TasksPanel.js';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}

function list(tasks: TaskSummary[] = [taskSummary]) {
  return json({
    pageInfo: { hasNextPage: false, page: 1, pageSize: 25, total: tasks.length },
    tasks,
  });
}

function detail(task: TaskDetail = taskDetail) {
  return json({ task });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function renderPanel(token = 'task-token') {
  return render(
    <I18nProvider initialLocale="en">
      <TasksPanel accessToken={token} user={taskUser} />
    </I18nProvider>,
  );
}

afterEach(() => vi.restoreAllMocks());

describe('Task container reads and concurrency', () => {
  it('lists with the preserved page size, applies supported filters, and reads selected detail', async () => {
    const urls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = input instanceof Request ? input.url : input.toString();
      urls.push(url);
      if (url.includes('/v1/notifications')) return Promise.resolve(list([]));
      if (url.endsWith(`/${TASK_A_ID}`)) return Promise.resolve(detail());
      return Promise.resolve(list());
    });
    renderPanel();
    expect(await screen.findByText('Client asked for a response before noon.')).toBeVisible();
    expect(urls.some((url) => url.includes('pageSize=25'))).toBe(true);
    fireEvent.change(screen.getByLabelText('Search tasks'), { target: { value: 'client' } });
    fireEvent.change(screen.getByLabelText('Priority', { selector: 'select' }), {
      target: { value: 'URGENT' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    await waitFor(() =>
      expect(
        urls.some((url) => url.includes('search=client') && url.includes('priority=URGENT')),
      ).toBe(true),
    );
  });

  it('never lets a late detail for task A replace task B', async () => {
    const pendingA = deferred<Response>();
    const taskB = { ...taskDetail, id: TASK_B_ID, title: 'Prepare interview notes' };
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = input instanceof Request ? input.url : input.toString();
      if (url.includes('/v1/notifications')) return Promise.resolve(list([]));
      if (url.endsWith(`/${TASK_A_ID}`)) return pendingA.promise;
      if (url.endsWith(`/${TASK_B_ID}`)) return Promise.resolve(detail(taskB));
      return Promise.resolve(
        list([taskSummary, { ...taskSummary, id: TASK_B_ID, title: taskB.title }]),
      );
    });
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: /Prepare interview notes/ }));
    expect(await screen.findByRole('heading', { name: 'Prepare interview notes' })).toBeVisible();
    pendingA.resolve(detail());
    await Promise.resolve();
    expect(screen.getByRole('heading', { name: 'Prepare interview notes' })).toBeVisible();
  });

  it('shows no stale mutation feedback after selecting another task', async () => {
    const pending = deferred<Response>();
    const taskB = { ...taskDetail, id: TASK_B_ID, title: 'Prepare interview notes' };
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = input instanceof Request ? input.url : input.toString();
      if (url.includes('/v1/notifications')) return Promise.resolve(list([]));
      if (url.endsWith(`/${TASK_A_ID}/status`) && init?.method === 'POST') return pending.promise;
      if (url.endsWith(`/${TASK_A_ID}`)) return Promise.resolve(detail());
      if (url.endsWith(`/${TASK_B_ID}`)) return Promise.resolve(detail(taskB));
      return Promise.resolve(
        list([taskSummary, { ...taskSummary, id: TASK_B_ID, title: taskB.title }]),
      );
    });
    renderPanel();
    await screen.findByText('Client asked for a response before noon.');
    fireEvent.click(screen.getByRole('button', { name: 'Change status' }));
    fireEvent.click(screen.getByRole('button', { name: /Prepare interview notes/ }));
    await screen.findByRole('heading', { name: 'Prepare interview notes' });
    await act(async () => {
      pending.resolve(detail({ ...taskDetail, status: 'IN_PROGRESS' }));
      await Promise.resolve();
    });
    expect(screen.queryByText(/Task moved to/)).not.toBeInTheDocument();
  });

  it('invalidates a pending task detail when the session token changes', async () => {
    const oldDetail = deferred<Response>();
    let detailReads = 0;
    const currentTask = { ...taskDetail, title: 'Current session task' };
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = input instanceof Request ? input.url : input.toString();
      if (url.includes('/v1/notifications')) return Promise.resolve(list([]));
      if (url.endsWith(`/${TASK_A_ID}`)) {
        detailReads += 1;
        return detailReads === 1 ? oldDetail.promise : Promise.resolve(detail(currentTask));
      }
      return Promise.resolve(list());
    });
    const view = renderPanel('old-token');
    await screen.findByRole('button', { name: /Review candidate follow-up/ });
    view.rerender(
      <I18nProvider initialLocale="en">
        <TasksPanel accessToken="new-token" user={taskUser} />
      </I18nProvider>,
    );
    expect(await screen.findByRole('heading', { name: 'Current session task' })).toBeVisible();
    await act(async () => {
      oldDetail.resolve(detail());
      await Promise.resolve();
    });
    expect(screen.getByRole('heading', { name: 'Current session task' })).toBeVisible();
  });

  it('uses the latest applied filters for a refresh after a pending mutation', async () => {
    const pending = deferred<Response>();
    const urls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = input instanceof Request ? input.url : input.toString();
      urls.push(url);
      if (url.includes('/v1/notifications')) return Promise.resolve(list([]));
      if (url.endsWith(`/${TASK_A_ID}/status`) && init?.method === 'POST') return pending.promise;
      if (url.endsWith(`/${TASK_A_ID}`)) return Promise.resolve(detail());
      return Promise.resolve(list());
    });
    renderPanel();
    await screen.findByText('Client asked for a response before noon.');
    fireEvent.click(screen.getByRole('button', { name: 'Change status' }));
    fireEvent.change(screen.getByLabelText('Search tasks'), { target: { value: 'new filter' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    pending.resolve(detail({ ...taskDetail, status: 'IN_PROGRESS' }));
    await waitFor(() =>
      expect(urls.filter((url) => url.includes('search=new+filter')).length).toBeGreaterThanOrEqual(
        2,
      ),
    );
  });

  it('locks repeated create submission until the first request settles', async () => {
    const pending = deferred<Response>();
    let creates = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = input instanceof Request ? input.url : input.toString();
      if (url.includes('/v1/notifications')) return Promise.resolve(list([]));
      if (url.endsWith('/v1/tasks') && init?.method === 'POST') {
        creates += 1;
        return pending.promise;
      }
      if (url.endsWith(`/${TASK_A_ID}`)) return Promise.resolve(detail());
      return Promise.resolve(list());
    });
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'New task' }));
    fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: 'One request only' } });
    const submit = screen.getByRole('button', { name: 'Create task' });
    fireEvent.click(submit);
    fireEvent.click(submit);
    expect(creates).toBe(1);
    pending.resolve(detail({ ...taskDetail, title: 'One request only' }));
    expect(await screen.findByText('Task created.')).toBeVisible();
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
  let taskLists = 0;
  vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = input instanceof Request ? input.url : input.toString();
    if (url.includes('/v1/notifications')) return Promise.resolve(list([]));
    if (url.endsWith(`/${TASK_A_ID}`)) return Promise.resolve(detail());
    taskLists += 1;
    return Promise.resolve(list());
  });
  render(
    <I18nProvider initialLocale="en">
      <LocaleHarness />
    </I18nProvider>,
  );
  fireEvent.click(await screen.findByRole('button', { name: 'New task' }));
  fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: 'Draft in progress' } });
  const before = taskLists;
  fireEvent.click(screen.getByRole('button', { name: 'switch' }));
  expect(await screen.findByRole('heading', { name: 'Pipeline des tâches' })).toBeVisible();
  expect(screen.getByDisplayValue('Draft in progress')).toBeVisible();
  expect(taskLists).toBe(before);
});
