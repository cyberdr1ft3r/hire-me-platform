import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../i18n/index.js';
import { EMPTY_TASK_FILTERS, resolveTaskAccess } from './task-state.js';
import { taskDetail, taskSummary, taskUser } from './task-test-data.js';
import { TaskWorkspace, type TaskWorkspaceProps } from './TaskWorkspace.js';

function props(overrides: Partial<TaskWorkspaceProps> = {}): TaskWorkspaceProps {
  return {
    access: resolveTaskAccess(taskUser.permissions),
    appliedFilters: EMPTY_TASK_FILTERS,
    detail: { status: 'ready', task: taskDetail },
    feedback: null,
    filters: EMPTY_TASK_FILTERS,
    list: { status: 'ready', tasks: [taskSummary], total: 1 },
    notificationTotal: 0,
    notificationStatus: '',
    notifications: [],
    onAddAssignment: vi.fn(),
    onAddComment: vi.fn(),
    onAddReminder: vi.fn(),
    onArchive: vi.fn(),
    onChangeOwner: vi.fn(),
    onCreate: vi.fn().mockResolvedValue(true),
    onFiltersChange: vi.fn(),
    onNotificationArchive: vi.fn(),
    onNotificationFilter: vi.fn(),
    onNotificationRead: vi.fn(),
    onNotificationsReadAll: vi.fn(),
    onProcessReminders: vi.fn(),
    onResetFilters: vi.fn(),
    onRetryDetail: vi.fn(),
    onRetryList: vi.fn(),
    onSearch: vi.fn(),
    onSelect: vi.fn(),
    onTransition: vi.fn(),
    onUpdate: vi.fn().mockResolvedValue(true),
    pending: null,
    selectedId: taskDetail.id,
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

describe('Task workspace presentation', () => {
  it('uses one h1 and exposes queue selection as a real selected button', () => {
    renderWorkspace();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('button', { name: /Review candidate follow-up/ })).toHaveAttribute(
      'aria-current',
      'true',
    );
  });

  it('shows localized status, priority, owner, assignee, comments and reminders', () => {
    renderWorkspace();
    expect(screen.getAllByText('Open').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Urgent').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Task Operator').length).toBeGreaterThan(0);
    expect(screen.getByText('Client asked for a response before noon.')).toBeVisible();
    expect(screen.getByText('PENDING')).toBeVisible();
  });

  it('uses text as well as color for an overdue due date', () => {
    renderWorkspace();
    expect(screen.getAllByText(/Overdue/).length).toBeGreaterThan(0);
  });

  it('renders the complete Task interface in French', () => {
    renderWorkspace(props(), 'fr');
    expect(screen.getByRole('heading', { level: 1, name: 'Pipeline des tâches' })).toBeVisible();
    expect(screen.getAllByText('Ouverte').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Urgente').length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'Commentaires' })).toBeVisible();
  });

  it('hides every mutation action from a view-only actor', () => {
    renderWorkspace(props({ access: resolveTaskAccess(['tasks:view']) }));
    expect(screen.queryByRole('button', { name: 'New task' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit task' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Change status' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add comment' })).not.toBeInTheDocument();
  });

  it('distinguishes initial loading, empty, filtered-empty, and request failure', () => {
    const { rerender } = renderWorkspace(
      props({ detail: { status: 'idle' }, list: { status: 'loading' } }),
    );
    expect(screen.getByText('Loading tasks…')).toBeVisible();
    rerender(
      <I18nProvider initialLocale="en">
        <TaskWorkspace
          {...props({ detail: { status: 'idle' }, list: { status: 'ready', tasks: [], total: 0 } })}
        />
      </I18nProvider>,
    );
    expect(screen.getByRole('heading', { name: 'There are no visible tasks.' })).toBeVisible();
    rerender(
      <I18nProvider initialLocale="en">
        <TaskWorkspace
          {...props({
            appliedFilters: { ...EMPTY_TASK_FILTERS, search: 'none' },
            detail: { status: 'idle' },
            list: { status: 'ready', tasks: [], total: 0 },
          })}
        />
      </I18nProvider>,
    );
    expect(screen.getByRole('heading', { name: 'No tasks match these filters.' })).toBeVisible();
    rerender(
      <I18nProvider initialLocale="en">
        <TaskWorkspace {...props({ detail: { status: 'idle' }, list: { status: 'error' } })} />
      </I18nProvider>,
    );
    expect(screen.getByRole('heading', { name: 'Unable to load tasks.' })).toBeVisible();
  });

  it('offers only server-authorized transitions from the current status', () => {
    renderWorkspace();
    const status = screen.getByLabelText('Status', { selector: 'select[name="status"]' });
    expect(
      within(status)
        .getAllByRole('option')
        .map((option) => option.getAttribute('value')),
    ).toEqual(['IN_PROGRESS', 'WAITING', 'BLOCKED', 'COMPLETED', 'CANCELED']);
  });

  it('opens create with visible labels and restores focus after cancel', async () => {
    renderWorkspace();
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
    expect(screen.getByRole('button', { name: 'Add comment' })).toBeDisabled();
  });

  it('submits the stored status value rather than its translated label', () => {
    const onTransition = vi.fn();
    renderWorkspace(props({ onTransition }), 'fr');
    const status = screen.getByLabelText('Statut', { selector: 'select[name="status"]' });
    fireEvent.change(status, { target: { value: 'WAITING' } });
    fireEvent.click(screen.getByRole('button', { name: 'Changer le statut' }));
    expect(onTransition).toHaveBeenCalledWith('WAITING', null);
  });
});
