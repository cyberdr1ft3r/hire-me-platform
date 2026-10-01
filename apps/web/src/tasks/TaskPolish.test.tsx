import { render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { I18nProvider, type Locale } from '../i18n/index.js';
import { TaskCard } from './TaskBoard.js';
import { TaskNotifications } from './TaskNotifications.js';
import type { TaskAccess } from './task-state.js';
import { USER_ID, taskNotification, taskSummary } from './task-test-data.js';

const OTHER_USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const access: TaskAccess = {
  canArchive: true,
  canAssign: true,
  canComment: true,
  canCreate: true,
  canManageNotifications: true,
  canManageReminders: true,
  canTransition: true,
  canUpdate: true,
  canViewAll: true,
  canViewMissionCandidates: false,
  canViewNotifications: true,
  contextFilterKinds: [],
  contextKinds: [],
};

function renderIn(locale: Locale, node: ReactNode) {
  return render(<I18nProvider initialLocale={locale}>{node}</I18nProvider>);
}

describe('TaskCard people line', () => {
  it('states the viewer’s own ownership as "you" instead of repeating their name', () => {
    renderIn(
      'en',
      <TaskCard currentUserId={USER_ID} onSelect={vi.fn()} selected={false} task={taskSummary} />,
    );
    expect(screen.getByText('Owner: you')).toBeVisible();
    expect(screen.queryByText(/Task Operator/)).toBeNull();
    expect(screen.getByText('Assigned to you')).toBeVisible();
  });

  it('keeps another owner’s name, in French too', () => {
    renderIn(
      'fr',
      <TaskCard
        currentUserId={OTHER_USER_ID}
        onSelect={vi.fn()}
        selected={false}
        task={taskSummary}
      />,
    );
    expect(screen.getByText(/^Responsable\s:\sTask Operator$/)).toBeVisible();
  });
});

describe('TaskNotifications controls', () => {
  function renderNotifications(locale: Locale) {
    return renderIn(
      locale,
      <TaskNotifications
        access={access}
        busy={false}
        filter=""
        notifications={[taskNotification()]}
        onArchive={vi.fn()}
        onFilter={vi.fn()}
        onOpenTask={vi.fn()}
        onRead={vi.fn()}
        onReadAll={vi.fn()}
        pending={null}
        total={1}
        unreadCount={1}
      />,
    );
  }

  it('keeps the status filter a labelled native select in one row with a full-height bulk action', () => {
    const { container } = renderNotifications('en');
    const row = container.querySelector('.tasks__notification-controls');
    expect(row).not.toBeNull();

    const select = within(row as HTMLElement).getByRole('combobox', {
      name: 'Notification status',
    });
    expect(select.tagName).toBe('SELECT');
    expect(
      within(select)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Any status', 'Unread', 'Read']);

    // The action shares the select's control height instead of the compact size.
    const markAll = within(row as HTMLElement).getByRole('button', { name: 'Mark all read' });
    expect(markAll).toHaveClass('ui-button--standard');
    expect(markAll).not.toHaveClass('ui-button--compact');
  });

  it('renders the same controls in French', () => {
    const { container } = renderNotifications('fr');
    const row = container.querySelector('.tasks__notification-controls') as HTMLElement;
    expect(within(row).getByRole('combobox', { name: 'Statut des notifications' })).toBeTruthy();
    expect(within(row).getByRole('button', { name: 'Tout marquer comme lu' })).toBeTruthy();
  });
});
