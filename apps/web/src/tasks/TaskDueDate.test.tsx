import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../i18n/index.js';
import {
  dateInputEndIso,
  dateInputStartIso,
  isoToLocalInput,
  localInputToIso,
} from './task-datetime.js';
import { resolveTaskAccess } from './task-state.js';
import { TaskDetailPanel, type TaskDetailPanelProps } from './TaskDetail.js';
import { taskDetail, taskUser } from './task-test-data.js';

/**
 * Due dates are instants. These tests run outside UTC on purpose: slicing the
 * ISO string would show UTC wall-clock time and shift the instant on save.
 */
const originalTimezone = process.env.TZ;

beforeAll(() => {
  process.env.TZ = 'Europe/Paris';
});

afterAll(() => {
  if (originalTimezone === undefined) delete process.env.TZ;
  else process.env.TZ = originalTimezone;
});

const DUE = '2026-09-15T15:00:30.000Z';

describe('datetime-local round trip outside UTC', () => {
  it('runs in a non-UTC zone', () => {
    // Paris is UTC+2 in September; without this the tests below prove nothing.
    expect(new Date(DUE).getHours()).toBe(17);
  });

  it('shows an instant with its local date and time', () => {
    expect(isoToLocalInput(DUE)).toBe('2026-09-15T17:00');
    expect(isoToLocalInput('2026-12-31T23:30:00.000Z')).toBe('2027-01-01T00:30');
    expect(isoToLocalInput(null)).toBe('');
  });

  it('converts a typed local time back to the same instant', () => {
    expect(localInputToIso('2026-09-15T17:00')).toBe('2026-09-15T15:00:00.000Z');
    expect(localInputToIso(isoToLocalInput('2026-03-01T08:15:00.000Z'))).toBe(
      '2026-03-01T08:15:00.000Z',
    );
    expect(localInputToIso('')).toBeNull();
  });

  it('turns local calendar days into their first and last instants', () => {
    expect(dateInputStartIso('2026-09-15')).toBe('2026-09-14T22:00:00.000Z');
    expect(dateInputEndIso('2026-09-15')).toBe('2026-09-15T21:59:59.999Z');
  });
});

function panelProps(overrides: Partial<TaskDetailPanelProps> = {}): TaskDetailPanelProps {
  return {
    access: resolveTaskAccess(taskUser.permissions),
    contextLabels: {},
    currentUserId: taskUser.id,
    detail: { status: 'ready', task: { ...taskDetail, dueAt: DUE } },
    feedback: null,
    loadOptions: () => Promise.resolve([]),
    onAddAssignment: vi.fn().mockResolvedValue(true),
    onAddComment: vi.fn().mockResolvedValue(true),
    onAddReminder: vi.fn().mockResolvedValue(true),
    onArchive: vi.fn().mockResolvedValue(true),
    onArchiveComment: vi.fn().mockResolvedValue(true),
    onCancelReminder: vi.fn().mockResolvedValue(true),
    onChangeOwner: vi.fn().mockResolvedValue(true),
    onClose: vi.fn(),
    onEditComment: vi.fn().mockResolvedValue(true),
    onRemoveAssignment: vi.fn().mockResolvedValue(true),
    onRescheduleReminder: vi.fn().mockResolvedValue(true),
    onRetry: vi.fn(),
    onTransition: vi.fn().mockResolvedValue(true),
    onUpdate: vi.fn().mockResolvedValue(true),
    optionsKey: 'test',
    pending: null,
    ...overrides,
  };
}

describe('editing a task keeps its due instant', () => {
  it('shows the stored due instant in local time and omits it when untouched', async () => {
    const onUpdate = vi.fn().mockResolvedValue(true);
    render(
      <I18nProvider initialLocale="en">
        <TaskDetailPanel {...panelProps({ onUpdate })} />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit task' }));
    const form = screen.getByRole('form', { name: 'Edit task' });
    expect(within(form).getByLabelText('Due date and time')).toHaveValue('2026-09-15T17:00');
    fireEvent.change(within(form).getByLabelText(/^Title/), { target: { value: 'Renamed task' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(onUpdate).toHaveBeenCalled());
    const values = onUpdate.mock.calls[0]![0] as { dueAt: unknown; title: string };
    expect(values.title).toBe('Renamed task');
    // Not re-sent, so the stored instant, seconds included, stays exactly as it was.
    expect(values.dueAt).toBeUndefined();
  });

  it('sends a changed due date as the instant the local time denotes', async () => {
    const onUpdate = vi.fn().mockResolvedValue(true);
    render(
      <I18nProvider initialLocale="en">
        <TaskDetailPanel {...panelProps({ onUpdate })} />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit task' }));
    const form = screen.getByRole('form', { name: 'Edit task' });
    fireEvent.change(within(form).getByLabelText('Due date and time'), {
      target: { value: '2026-09-15T18:00' },
    });
    fireEvent.click(within(form).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(onUpdate).toHaveBeenCalled());
    expect((onUpdate.mock.calls[0]![0] as { dueAt: unknown }).dueAt).toBe(
      '2026-09-15T16:00:00.000Z',
    );
  });
});

describe('rescheduling a reminder uses local time', () => {
  it('shows the reminder in local time and sends the instant the new local time denotes', async () => {
    const onRescheduleReminder = vi.fn().mockResolvedValue(true);
    const reminder = { ...taskDetail.reminders[0]!, remindAt: '2026-09-15T07:30:00.000Z' };
    render(
      <I18nProvider initialLocale="en">
        <TaskDetailPanel
          {...panelProps({
            detail: { status: 'ready', task: { ...taskDetail, reminders: [reminder] } },
            onRescheduleReminder,
          })}
        />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reschedule' }));
    const form = screen.getByRole('form', { name: 'Reschedule' });
    const field = within(form).getByLabelText(/^New reminder date and time/);
    // 07:30 UTC is 09:30 in Paris in September.
    expect(field).toHaveValue('2026-09-15T09:30');
    fireEvent.change(field, { target: { value: '2026-09-16T08:15' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save new time' }));
    await waitFor(() =>
      expect(onRescheduleReminder).toHaveBeenCalledWith({
        remindAt: '2026-09-16T06:15:00.000Z',
        reminderId: reminder.id,
      }),
    );
  });
});
