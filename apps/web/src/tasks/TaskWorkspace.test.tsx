import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../i18n/index.js';
import {
  EMPTY_TASK_FILTERS,
  TASK_BOARD_COLUMNS,
  boardState,
  resolveTaskAccess,
  type LoadOptions,
  type TaskBoardState,
} from './task-state.js';
import {
  AMINA_ID,
  OMAR_ID,
  OMAR_SALES_ID,
  UUID_PATTERN,
  taskDetail,
  taskNotification,
  taskPeople,
  taskSummary,
  taskUser,
} from './task-test-data.js';
import { TaskWorkspace, type TaskWorkspaceProps } from './TaskWorkspace.js';

const people = taskPeople.map((person) => ({
  detail: person.email,
  id: person.id,
  label: person.displayName,
}));

function readyBoard(tasks = [taskSummary]): TaskBoardState {
  return Object.fromEntries(
    TASK_BOARD_COLUMNS.map((column) => {
      const inColumn = tasks.filter((task) => task.status === column);
      return [
        column,
        {
          loadingMore: false,
          loadMoreFailed: false,
          page: 1,
          status: 'ready',
          tasks: inColumn,
          total: inColumn.length,
        },
      ];
    }),
  ) as unknown as TaskBoardState;
}

function props(overrides: Partial<TaskWorkspaceProps> = {}): TaskWorkspaceProps {
  const loadOptions: LoadOptions = vi.fn(() => Promise.resolve(people));
  return {
    access: resolveTaskAccess(taskUser.permissions),
    appliedFilters: EMPTY_TASK_FILTERS,
    board: readyBoard(),
    contextLabels: {},
    currentUser: {
      detail: taskUser.email,
      id: taskUser.id,
      label: taskUser.displayName,
      self: true,
    },
    detail: { status: 'ready', task: taskDetail },
    feedback: null,
    filters: EMPTY_TASK_FILTERS,
    list: { page: 1, status: 'ready', tasks: [taskSummary], total: 1 },
    loadOptions,
    notificationStatus: '',
    notificationTotal: 0,
    notifications: [],
    onAddAssignment: vi.fn().mockResolvedValue(true),
    onAddComment: vi.fn().mockResolvedValue(true),
    onAddReminder: vi.fn().mockResolvedValue(true),
    onApplyFilters: vi.fn(),
    onArchive: vi.fn().mockResolvedValue(true),
    onChangeOwner: vi.fn().mockResolvedValue(true),
    onCloseDetail: vi.fn(),
    onCreate: vi.fn().mockResolvedValue(true),
    onFiltersChange: vi.fn(),
    onListPage: vi.fn(),
    onLoadMore: vi.fn(),
    onNotificationArchive: vi.fn(),
    onNotificationFilter: vi.fn(),
    onNotificationRead: vi.fn(),
    onNotificationsReadAll: vi.fn(),
    onProcessReminders: vi.fn(),
    onResetFilters: vi.fn(),
    onRetryBoard: vi.fn(),
    onRetryDetail: vi.fn(),
    onRetryList: vi.fn(),
    onSelect: vi.fn(),
    onTransition: vi.fn().mockResolvedValue(true),
    onUpdate: vi.fn().mockResolvedValue(true),
    onViewChange: vi.fn(),
    optionsKey: 'test',
    pending: null,
    selectedId: taskDetail.id,
    view: 'board',
    ...overrides,
  };
}

function renderWorkspace(value = props(), locale: 'en' | 'fr' = 'en') {
  return render(
    <I18nProvider initialLocale={locale}>
      <TaskWorkspace {...value} />
    </I18nProvider>,
  );
}

function dialog() {
  return screen.getByRole('dialog');
}

describe('Task workspace presentation', () => {
  it('uses one h1 and exposes the selected card as a real selected button', () => {
    renderWorkspace();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Review candidate follow-up' })).toHaveAttribute(
      'aria-current',
      'true',
    );
  });

  it('shows localized status, priority, owner, assignee, comments and reminders', () => {
    renderWorkspace();
    const detail = dialog();
    expect(within(detail).getAllByText('To do').length).toBeGreaterThan(0);
    expect(within(detail).getAllByText('Urgent').length).toBeGreaterThan(0);
    expect(within(detail).getAllByText('Task Operator').length).toBeGreaterThan(0);
    expect(within(detail).getByText('Client asked for a response before noon.')).toBeVisible();
    // The reminder status is a localized label for the stored PENDING value.
    expect(within(detail).getByText('Scheduled')).toBeVisible();
    expect(screen.queryByText('PENDING')).not.toBeInTheDocument();
  });

  it('uses text as well as color for an overdue due date', () => {
    renderWorkspace();
    expect(screen.getAllByText(/Overdue/).length).toBeGreaterThan(0);
  });

  it('renders the complete Task interface in French', () => {
    renderWorkspace(props(), 'fr');
    expect(screen.getByRole('heading', { level: 1, name: 'Pipeline des tâches' })).toBeVisible();
    expect(screen.getAllByText('À faire').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Urgente').length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'Commentaires' })).toBeVisible();
    expect(screen.getByText('Programmé')).toBeVisible();
  });

  it('hides every mutation action from a view-only actor', () => {
    renderWorkspace(props({ access: resolveTaskAccess(['tasks:view']) }));
    expect(screen.queryByRole('button', { name: 'New task' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit task' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Move task' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add comment' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Change owner' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Schedule reminder' })).not.toBeInTheDocument();
    expect(screen.queryByText('Reminder delivery')).not.toBeInTheDocument();
  });

  it('distinguishes initial loading, empty, filtered-empty, and request failure', () => {
    const list = (value: Partial<TaskWorkspaceProps>) =>
      props({ detail: { status: 'idle' }, view: 'list', ...value });
    const { rerender } = renderWorkspace(list({ list: { status: 'loading' } }));
    expect(screen.getByText('Loading tasks…')).toBeVisible();
    const again = (value: TaskWorkspaceProps) =>
      rerender(
        <I18nProvider initialLocale="en">
          <TaskWorkspace {...value} />
        </I18nProvider>,
      );
    again(list({ list: { page: 1, status: 'ready', tasks: [], total: 0 } }));
    expect(screen.getByRole('heading', { name: 'There are no visible tasks.' })).toBeVisible();
    again(
      list({
        appliedFilters: { ...EMPTY_TASK_FILTERS, search: 'none' },
        list: { page: 1, status: 'ready', tasks: [], total: 0 },
      }),
    );
    expect(screen.getByRole('heading', { name: 'No tasks match these filters.' })).toBeVisible();
    again(list({ list: { status: 'error' } }));
    expect(screen.getByRole('heading', { name: 'Unable to load tasks.' })).toBeVisible();

    again(props({ board: boardState({ status: 'loading' }), detail: { status: 'idle' } }));
    expect(screen.getAllByText('Loading tasks…')).toHaveLength(5);
    again(props({ board: readyBoard([]), detail: { status: 'idle' } }));
    expect(screen.getByRole('status')).toHaveTextContent('There are no visible tasks.');
    again(props({ board: boardState({ status: 'error' }), detail: { status: 'idle' } }));
    expect(screen.getAllByText('This column could not be loaded.')).toHaveLength(5);
  });

  it('offers only server-authorized transitions from the current status', () => {
    renderWorkspace();
    const move = within(dialog()).getByLabelText('Move to');
    expect(
      within(move)
        .getAllByRole('option')
        .map((option) => option.getAttribute('value')),
    ).toEqual(['IN_PROGRESS', 'WAITING', 'BLOCKED', 'COMPLETED', 'CANCELED']);
  });

  it('opens create with visible labels and restores focus after cancel', async () => {
    renderWorkspace(props({ detail: { status: 'idle' }, selectedId: null }));
    const trigger = screen.getByRole('button', { name: 'New task' });
    fireEvent.click(trigger);
    expect(screen.getByLabelText(/^Title/)).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('disables write entry points while a mutation is pending', () => {
    renderWorkspace(props({ pending: 'comment' }));
    expect(screen.getByRole('button', { name: 'New task' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Edit task' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move task' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Change owner' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add assignee' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Schedule reminder' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Archive task' })).toBeDisabled();
    // Only the operation in flight shows its loading state.
    expect(screen.getByRole('button', { name: 'Add comment' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Move task' })).not.toHaveAttribute('aria-busy');
  });

  it('submits the stored status value rather than its translated label', () => {
    const onTransition = vi.fn().mockResolvedValue(true);
    renderWorkspace(props({ onTransition }), 'fr');
    fireEvent.change(within(dialog()).getByLabelText('Déplacer vers'), {
      target: { value: 'WAITING' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Déplacer la tâche' }));
    expect(onTransition).toHaveBeenCalledWith('WAITING', null);
  });
});

describe('Task board', () => {
  const across = [
    taskSummary,
    {
      ...taskSummary,
      id: '22222222-2222-4222-8222-000000000002',
      status: 'IN_PROGRESS' as const,
      title: 'In progress task',
    },
    {
      ...taskSummary,
      id: '22222222-2222-4222-8222-000000000003',
      status: 'WAITING' as const,
      title: 'Waiting task',
    },
    {
      ...taskSummary,
      id: '22222222-2222-4222-8222-000000000004',
      status: 'BLOCKED' as const,
      title: 'Blocked task',
    },
    {
      ...taskSummary,
      id: '22222222-2222-4222-8222-000000000005',
      status: 'COMPLETED' as const,
      title: 'Completed task',
    },
  ];

  it('uses one column per active stored status, with WAITING and BLOCKED kept apart', () => {
    const { container } = renderWorkspace(
      props({ board: readyBoard(across), detail: { status: 'idle' } }),
    );
    const columns = Array.from(container.querySelectorAll('.task-column'));
    expect(columns.map((column) => column.getAttribute('data-status'))).toEqual([
      'OPEN',
      'IN_PROGRESS',
      'WAITING',
      'BLOCKED',
      'COMPLETED',
    ]);
    const headings = screen
      .getAllByRole('heading', { level: 2 })
      .map((heading) => heading.textContent);
    expect(headings).toEqual(
      expect.arrayContaining(['To do', 'In progress', 'Waiting', 'Blocked', 'Completed']),
    );
    expect(headings).not.toContain('Canceled');
    expect(headings).not.toContain('Archived');
    for (const task of across) {
      const card = screen.getByRole('button', { name: task.title }).closest('.task-column');
      expect(card).toHaveAttribute('data-status', task.status);
    }
  });

  it('opens the correct task when its card is selected, by keyboard or pointer', () => {
    const onSelect = vi.fn();
    renderWorkspace(
      props({ board: readyBoard(across), detail: { status: 'idle' }, onSelect, selectedId: null }),
    );
    const card = screen.getByRole('button', { name: 'Blocked task' });
    card.focus();
    expect(card).toHaveFocus();
    fireEvent.click(card);
    expect(onSelect).toHaveBeenCalledWith('22222222-2222-4222-8222-000000000004');
  });

  it('states status, priority, and due state as text on each card', () => {
    renderWorkspace(props({ detail: { status: 'idle' }, selectedId: null }));
    const card = screen
      .getByRole('button', { name: 'Review candidate follow-up' })
      .closest('article')!;
    expect(within(card).getByText('Status: To do')).toBeInTheDocument();
    expect(within(card).getByText('Urgent')).toBeVisible();
    expect(within(card).getByText(/Overdue/)).toBeVisible();
    expect(within(card).getByText('Assigned to you')).toBeVisible();
  });

  it('switches one column at a time on narrow screens without losing the others', () => {
    const { container } = renderWorkspace(
      props({ board: readyBoard(across), detail: { status: 'idle' } }),
    );
    const switcher = screen.getByRole('group', { name: 'Board columns' });
    const toggles = within(switcher).getAllByRole('button');
    expect(toggles).toHaveLength(5);
    expect(toggles[0]).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(within(switcher).getByRole('button', { name: /Blocked/ }));
    expect(within(switcher).getByRole('button', { name: /Blocked/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(container.querySelector('[data-status="BLOCKED"]')).toHaveAttribute(
      'data-active',
      'true',
    );
    expect(container.querySelector('[data-status="OPEN"]')).not.toHaveAttribute('data-active');
  });

  it('keeps canceled and archived work in the list view with its status filter', () => {
    renderWorkspace(props({ detail: { status: 'idle' }, view: 'list' }));
    const status = screen.getByLabelText('Status');
    expect(within(status).getByRole('option', { name: 'Canceled' })).toBeInTheDocument();
    expect(within(status).getByRole('option', { name: 'Archived' })).toBeInTheDocument();
  });
});

describe('Task selectors show people, never IDs', () => {
  it('lists people by name and email while the option value is the ID', async () => {
    renderWorkspace();
    const owner = within(dialog()).getByLabelText(/^Owner( \*)?$/);
    await waitFor(() =>
      expect(
        within(owner).getByRole('option', { name: 'Amina Berrada · amina.berrada@example.test' }),
      ).toBeInTheDocument(),
    );
    expect(
      within(owner).getByRole('option', { name: 'Amina Berrada · amina.berrada@example.test' }),
    ).toHaveValue(AMINA_ID);
    // Two people with the same name are told apart by email.
    expect(
      within(owner).getByRole('option', { name: 'Omar Tazi · omar.tazi@example.test' }),
    ).toHaveValue(OMAR_ID);
    expect(
      within(owner).getByRole('option', { name: 'Omar Tazi · omar.tazi.sales@example.test' }),
    ).toHaveValue(OMAR_SALES_ID);
  });

  it('renders no UUID as text anywhere and asks for no UUID input', async () => {
    const { container } = renderWorkspace(
      props({ notifications: [taskNotification()], notificationTotal: 1 }),
    );
    await waitFor(() =>
      expect(screen.getAllByRole('option', { name: /Amina Berrada/ }).length).toBeGreaterThan(0),
    );
    expect(container.textContent).not.toMatch(UUID_PATTERN);
    expect(document.body.textContent).not.toMatch(UUID_PATTERN);
    const labels = Array.from(document.querySelectorAll('label, legend')).map(
      (node) => node.textContent ?? '',
    );
    expect(labels.join(' ')).not.toMatch(/UUID/i);
    // Owner, assignee, and reminder recipient are choices, not free-text fields.
    for (const name of ['ownerUserId', 'userId', 'recipientUserId']) {
      expect(document.querySelector(`[name="${name}"]`)?.tagName).toBe('SELECT');
    }
    expect(document.querySelectorAll('input[name="mentionedUserIds"]')[0]).toHaveAttribute(
      'type',
      'checkbox',
    );
  });

  it('submits the chosen owner, assignee, reminder recipient, and mentions as IDs', async () => {
    const onChangeOwner = vi.fn().mockResolvedValue(true);
    const onAddAssignment = vi.fn().mockResolvedValue(true);
    const onAddReminder = vi.fn().mockResolvedValue(true);
    const onAddComment = vi.fn().mockResolvedValue(true);
    renderWorkspace(props({ onAddAssignment, onAddComment, onAddReminder, onChangeOwner }));
    const detail = dialog();
    await waitFor(() =>
      expect(
        within(detail).getAllByRole('option', { name: /Amina Berrada/ }).length,
      ).toBeGreaterThan(0),
    );

    fireEvent.change(within(detail).getByLabelText(/^Owner( \*)?$/), {
      target: { value: OMAR_SALES_ID },
    });
    fireEvent.click(within(detail).getByRole('button', { name: 'Change owner' }));
    expect(onChangeOwner).toHaveBeenCalledWith({ ownerUserId: OMAR_SALES_ID, reason: null });

    fireEvent.change(within(detail).getByLabelText(/^Assignee( \*)?$/), {
      target: { value: AMINA_ID },
    });
    fireEvent.click(within(detail).getByRole('button', { name: 'Add assignee' }));
    expect(onAddAssignment).toHaveBeenCalledWith({ reason: null, userId: AMINA_ID });

    fireEvent.change(within(detail).getByLabelText(/^Recipient( \*)?$/), {
      target: { value: OMAR_ID },
    });
    fireEvent.change(within(detail).getByLabelText(/Reminder date and time/), {
      target: { value: '2026-09-20T09:30' },
    });
    fireEvent.click(within(detail).getByRole('button', { name: 'Schedule reminder' }));
    expect(onAddReminder).toHaveBeenCalledWith({
      recipientUserId: OMAR_ID,
      remindAt: new Date('2026-09-20T09:30').toISOString(),
    });

    fireEvent.change(within(detail).getByLabelText(/^Comment/), {
      target: { value: 'Please check.' },
    });
    fireEvent.click(within(detail).getByRole('checkbox', { name: /omar.tazi.sales@example.test/ }));
    fireEvent.click(within(detail).getByRole('button', { name: 'Add comment' }));
    expect(onAddComment).toHaveBeenCalledWith({
      body: 'Please check.',
      mentionedUserIds: [OMAR_SALES_ID],
    });
  });

  it('links a new task to a record chosen by name, sending its ID', async () => {
    const missionId = '99999999-9999-4999-8999-999999999999';
    const onCreate = vi.fn().mockResolvedValue(true);
    const loadOptions = vi.fn<LoadOptions>((source) =>
      Promise.resolve(
        source.type === 'record'
          ? [{ detail: 'Synthetic Client A', id: missionId, label: 'Synthetic mission' }]
          : people,
      ),
    );
    renderWorkspace(
      props({
        access: resolveTaskAccess([...taskUser.permissions, 'missions:view']),
        detail: { status: 'idle' },
        loadOptions,
        onCreate,
        selectedId: null,
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'New task' }));
    fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: 'Brief the client' } });
    fireEvent.change(screen.getByLabelText('Linked record type'), { target: { value: 'mission' } });
    const mission = screen.getByLabelText('Mission');
    await waitFor(() =>
      expect(
        within(mission).getByRole('option', { name: 'Synthetic mission · Synthetic Client A' }),
      ).toHaveValue(missionId),
    );
    fireEvent.change(mission, { target: { value: missionId } });
    fireEvent.click(screen.getByRole('button', { name: 'Create task' }));
    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        context: { recruitmentMissionId: missionId },
        title: 'Brief the client',
      }),
    );
  });

  it('requests people for the purpose and task each selector prepares', async () => {
    const loadOptions = vi.fn<LoadOptions>(() => Promise.resolve(people));
    renderWorkspace(props({ loadOptions }));
    await waitFor(() => expect(loadOptions).toHaveBeenCalled());
    const sources = loadOptions.mock.calls.map(([source]) => source);
    expect(sources).toEqual(
      expect.arrayContaining([
        { purpose: 'owner', taskId: taskDetail.id, type: 'person' },
        { purpose: 'assignee', taskId: taskDetail.id, type: 'person' },
        { purpose: 'mention', taskId: taskDetail.id, type: 'person' },
        { purpose: 'reminder', taskId: taskDetail.id, type: 'person' },
      ]),
    );
  });

  it('offers no people selector to an actor who may not use it', async () => {
    const loadOptions = vi.fn<LoadOptions>(() => Promise.resolve(people));
    renderWorkspace(
      props({
        access: resolveTaskAccess(['tasks:view', 'tasks:create', 'tasks:comment']),
        loadOptions,
      }),
    );
    await waitFor(() => expect(loadOptions).toHaveBeenCalled());
    const purposes = loadOptions.mock.calls.map(([source]) =>
      source.type === 'person' ? source.purpose : source.type,
    );
    expect(purposes).toEqual(['mention']);
    expect(screen.queryByLabelText(/^Owner( \*)?$/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Recipient( \*)?$/)).not.toBeInTheDocument();
  });
});

describe('Task localization of stored values', () => {
  it('never shows raw reminder, notification, or context identifiers in French', async () => {
    const task = {
      ...taskDetail,
      context: {
        ...taskDetail.context,
        recruitmentMissionId: '99999999-9999-4999-8999-999999999999',
      },
    };
    renderWorkspace(
      props({
        contextLabels: {
          'recruitmentMissionId:99999999-9999-4999-8999-999999999999':
            'Mission synthétique · Client A',
        },
        detail: { status: 'ready', task },
        notificationTotal: 2,
        notifications: [
          taskNotification(),
          taskNotification({
            id: '88888888-8888-4888-8888-888888888888',
            status: 'READ',
            type: 'tasks.comment.mention',
          }),
        ],
      }),
      'fr',
    );
    await waitFor(() =>
      expect(screen.getAllByRole('option', { name: /Amina Berrada/ }).length).toBeGreaterThan(0),
    );
    const text = document.body.textContent ?? '';
    for (const raw of [
      'PENDING',
      'UNREAD',
      'READ',
      'recruitmentMissionId',
      'missionCandidateId',
      'Task overdue',
    ]) {
      expect(text).not.toContain(raw);
    }
    expect(screen.getByText('Programmé')).toBeVisible();
    expect(screen.getAllByText('Non lue').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Lue').length).toBeGreaterThan(0);
    expect(screen.getByText('Tâche en retard')).toBeVisible();
    expect(screen.getByText('Mention dans une tâche')).toBeVisible();
    expect(within(dialog()).getByText('Mission')).toBeVisible();
    expect(within(dialog()).getByText('Mission synthétique · Client A')).toBeVisible();
  });
});

describe('Task detail dialog and global write lock', () => {
  it('is a labelled modal dialog that focuses its close control and closes on Escape', () => {
    const onCloseDetail = vi.fn();
    renderWorkspace(props({ onCloseDetail }));
    const detail = dialog();
    expect(detail).toHaveAttribute('aria-modal', 'true');
    expect(detail).toHaveAccessibleName('Review candidate follow-up');
    expect(screen.getByRole('button', { name: 'Close task details' })).toHaveFocus();
    fireEvent.keyDown(detail, { key: 'Escape' });
    expect(onCloseDetail).toHaveBeenCalled();
  });

  it('disables already-open forms while another write owns the lock', () => {
    const view = renderWorkspace();
    fireEvent.click(screen.getByRole('button', { name: 'Edit task' }));
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
    view.rerender(
      <I18nProvider initialLocale="en">
        <TaskWorkspace {...props({ pending: 'comment' })} />
      </I18nProvider>,
    );
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save changes' })).not.toHaveAttribute('aria-busy');
    view.rerender(
      <I18nProvider initialLocale="en">
        <TaskWorkspace {...props({ pending: 'update' })} />
      </I18nProvider>,
    );
    expect(screen.getByRole('button', { name: 'Add comment' })).toBeDisabled();
  });

  it('disables notification actions too while a write is in flight', () => {
    renderWorkspace(
      props({
        detail: { status: 'idle' },
        notificationTotal: 1,
        notifications: [taskNotification()],
        pending: 'transition',
        selectedId: null,
      }),
    );
    expect(screen.getByRole('button', { name: 'Mark read' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Archive' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Mark all read' })).toBeDisabled();
  });

  it('keeps manual reminder delivery out of the header and away from ordinary users', () => {
    const { rerender } = renderWorkspace(props({ detail: { status: 'idle' } }));
    expect(
      screen.queryByRole('button', { name: 'Deliver due reminders now' }),
    ).not.toBeInTheDocument();
    rerender(
      <I18nProvider initialLocale="en">
        <TaskWorkspace
          {...props({
            access: resolveTaskAccess([...taskUser.permissions, 'tasks:view_all']),
            detail: { status: 'idle' },
          })}
        />
      </I18nProvider>,
    );
    const header = screen.getByRole('heading', { level: 1 }).closest('header')!;
    expect(within(header).queryByRole('button', { name: /reminders/i })).not.toBeInTheDocument();
    expect(screen.getByText('Reminder delivery')).toBeInTheDocument();
  });
});
