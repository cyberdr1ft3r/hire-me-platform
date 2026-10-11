import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../i18n/index.js';
import { MissionsPanel } from './MissionsPanel.js';
import {
  ACTOR_ID,
  deferred,
  jsonResponse,
  mockMissionApi,
  syntheticMission,
  type RecordedCall,
} from './mission-test-data.js';

const FIRST_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SECOND_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function listResponse(title: string, page = 1, total = 1): Response {
  return jsonResponse({
    missions: [syntheticMission(page === 1 ? FIRST_ID : SECOND_ID, title)],
    pagination: { page, pageSize: 20, total },
  });
}

function panel(locale: 'en' | 'fr' = 'en', accessToken = 'token-a') {
  return (
    <I18nProvider initialLocale={locale}>
      <MissionsPanel
        accessToken={accessToken}
        actorUserId={ACTOR_ID}
        initialMissionId={null}
        onSelectionChange={() => undefined}
        permissions={['missions:view']}
      />
    </I18nProvider>
  );
}

function renderPanel(locale: 'en' | 'fr' = 'en', accessToken = 'token-a') {
  return render(panel(locale, accessToken));
}

function missionCalls(calls: RecordedCall[]): RecordedCall[] {
  return calls.filter((call) => call.method === 'GET' && call.path === '/v1/missions');
}

function serveList(): RecordedCall[] {
  return mockMissionApi((call) =>
    call.path === '/v1/missions' && call.method === 'GET'
      ? listResponse('Mission result', Number(call.search.get('page') ?? '1'))
      : undefined,
  );
}

function setDate(label: string, value: string): void {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Missions deadline filters (#154)', () => {
  it('renders localized native date controls in English and French', async () => {
    serveList();
    const view = renderPanel();
    await screen.findByText('Mission result');
    expect(screen.getByLabelText('Deadline from')).toHaveAttribute('type', 'date');
    expect(screen.getByLabelText('Deadline to')).toHaveAttribute('type', 'date');

    view.unmount();
    serveList();
    renderPanel('fr');
    await screen.findByText('Mission result');
    expect(screen.getByLabelText('Échéance à partir du')).toHaveAttribute('type', 'date');
    expect(screen.getByLabelText('Échéance jusqu’au')).toHaveAttribute('type', 'date');
  });

  it('keeps draft dates request-free, then applies exact from and to UTC boundaries', async () => {
    const calls = serveList();
    renderPanel();
    await screen.findByText('Mission result');

    setDate('Deadline from', '2026-10-01');
    setDate('Deadline to', '2026-10-31');
    expect(missionCalls(calls)).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    await waitFor(() => expect(missionCalls(calls)).toHaveLength(2));
    const applied = missionCalls(calls).at(-1)!.search;
    expect(applied.get('deadlineFrom')).toBe('2026-10-01T00:00:00.000Z');
    expect(applied.get('deadlineTo')).toBe('2026-10-31T23:59:59.999Z');
    expect(applied.get('page')).toBe('1');
  });

  it.each([
    ['From only', '2026-10-01', '', '2026-10-01T00:00:00.000Z', null],
    ['To only', '', '2026-10-31', null, '2026-10-31T23:59:59.999Z'],
  ])(
    'applies %s without inventing the other boundary',
    async (_name, from, to, expectedFrom, expectedTo) => {
      const calls = serveList();
      renderPanel();
      await screen.findByText('Mission result');
      if (from) setDate('Deadline from', from);
      if (to) setDate('Deadline to', to);

      fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
      await waitFor(() => expect(missionCalls(calls)).toHaveLength(2));
      const applied = missionCalls(calls).at(-1)!.search;
      expect(applied.get('deadlineFrom')).toBe(expectedFrom);
      expect(applied.get('deadlineTo')).toBe(expectedTo);
    },
  );

  it('rejects an invalid draft range without applying or fetching and preserves both values', async () => {
    const calls = serveList();
    renderPanel();
    await screen.findByText('Mission result');
    setDate('Deadline from', '2026-10-20');
    setDate('Deadline to', '2026-10-10');

    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Deadline from must be on or before deadline to.',
    );
    expect(screen.getByLabelText('Deadline from')).toHaveValue('2026-10-20');
    expect(screen.getByLabelText('Deadline to')).toHaveValue('2026-10-10');
    expect(missionCalls(calls)).toHaveLength(1);
  });

  it('paginates with applied dates, ignores newer drafts, and Reset clears both dates on page 1', async () => {
    const calls = mockMissionApi((call) => {
      if (call.path !== '/v1/missions' || call.method !== 'GET') return undefined;
      const page = Number(call.search.get('page') ?? '1');
      return listResponse(page === 1 ? 'Page one' : 'Page two', page, 21);
    });
    renderPanel();
    await screen.findByText('Page one');
    setDate('Deadline from', '2026-10-01');
    setDate('Deadline to', '2026-10-31');
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    await waitFor(() => expect(missionCalls(calls)).toHaveLength(2));

    setDate('Deadline from', '2026-11-01');
    setDate('Deadline to', '2026-11-30');
    fireEvent.click(await screen.findByRole('button', { name: 'Next page' }));
    await screen.findByText('Page two');
    const paged = missionCalls(calls).at(-1)!.search;
    expect(paged.get('page')).toBe('2');
    expect(paged.get('deadlineFrom')).toBe('2026-10-01T00:00:00.000Z');
    expect(paged.get('deadlineTo')).toBe('2026-10-31T23:59:59.999Z');

    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(missionCalls(calls)).toHaveLength(4));
    const reset = missionCalls(calls).at(-1)!.search;
    expect(reset.get('page')).toBe('1');
    expect(reset.has('deadlineFrom')).toBe(false);
    expect(reset.has('deadlineTo')).toBe(false);
    expect(screen.getByLabelText('Deadline from')).toHaveValue('');
    expect(screen.getByLabelText('Deadline to')).toHaveValue('');
  });

  it('returns deadline drafts and the applied query to the canonical empty state on session reset', async () => {
    const calls = serveList();
    const view = renderPanel();
    await screen.findByText('Mission result');
    setDate('Deadline from', '2026-10-01');
    setDate('Deadline to', '2026-10-31');
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    await waitFor(() => expect(missionCalls(calls)).toHaveLength(2));

    view.rerender(panel('en', 'token-b'));

    await waitFor(() => expect(missionCalls(calls)).toHaveLength(3));
    expect(screen.getByLabelText('Deadline from')).toHaveValue('');
    expect(screen.getByLabelText('Deadline to')).toHaveValue('');
    const newSession = missionCalls(calls).at(-1)!.search;
    expect(newSession.has('deadlineFrom')).toBe(false);
    expect(newSession.has('deadlineTo')).toBe(false);
  });

  it('never lets a stale first Apply response replace the newer deadline result', async () => {
    const firstApply = deferred();
    let listRequest = 0;
    mockMissionApi((call) => {
      if (call.path !== '/v1/missions' || call.method !== 'GET') return undefined;
      listRequest += 1;
      if (listRequest === 1) return listResponse('Initial result');
      if (call.search.get('deadlineFrom') === '2026-10-01T00:00:00.000Z') {
        return firstApply.promise;
      }
      return listResponse('Newer range result');
    });
    renderPanel();
    await screen.findByText('Initial result');

    setDate('Deadline from', '2026-10-01');
    setDate('Deadline to', '2026-10-05');
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    await waitFor(() => expect(listRequest).toBe(2));

    setDate('Deadline from', '2026-11-01');
    setDate('Deadline to', '2026-11-05');
    fireEvent.submit(screen.getByRole('search', { name: 'Mission search' }));
    expect(await screen.findByText('Newer range result')).toBeVisible();

    await act(async () => {
      firstApply.resolve(listResponse('Stale range result'));
      await firstApply.promise;
    });
    expect(screen.getByText('Newer range result')).toBeVisible();
    expect(screen.queryByText('Stale range result')).toBeNull();
  });
});
