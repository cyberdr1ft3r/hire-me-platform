import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../i18n/index.js';
import { PublicOpportunityDetailPanel } from './PublicOpportunityDetailPanel.js';
import {
  API,
  callsTo,
  deferred,
  installBlobArrayBuffer,
  jsonResponse,
  mockPublicApi,
  resolveInAct,
  syntheticFile,
  syntheticOpportunity,
  type Deferred,
} from './public-opportunity-test-data.js';

/**
 * Deterministic ordering tests. Every response is a deferred promise the test
 * resolves explicitly, so no timer or sleep decides the order.
 *
 * The panel is re-rendered with a new slug rather than remounted, which proves
 * the container's own guards; the application also keys it by slug.
 */

const ROLE_A = syntheticOpportunity({ publicSlug: 'role-a', publicTitle: 'Synthetic role A' });
const ROLE_B = syntheticOpportunity({ publicSlug: 'role-b', publicTitle: 'Synthetic role B' });

function panel(slug: string) {
  return (
    <I18nProvider initialLocale="en">
      <PublicOpportunityDetailPanel publicSlug={slug} />
    </I18nProvider>
  );
}

function routeResponses() {
  const details = new Map<string, Deferred<Response>>();
  const submissions = new Map<string, Deferred<Response>>();
  const pending = (map: Map<string, Deferred<Response>>, slug: string) => {
    const existing = map.get(slug);
    if (existing) {
      return existing;
    }
    const created = deferred<Response>();
    map.set(slug, created);
    return created;
  };
  const fetchMock = mockPublicApi({
    detail: (slug) => pending(details, slug).promise,
    submit: (slug) => pending(submissions, slug).promise,
  });
  return {
    detail: (slug: string) => pending(details, slug),
    fetchMock,
    submission: (slug: string) => pending(submissions, slug),
  };
}

function applyWithRequiredFields() {
  fireEvent.change(screen.getByLabelText(/^Full name/), { target: { value: 'Ada Example' } });
  fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: 'ada@example.test' } });
  fireEvent.change(screen.getByLabelText(/^CV/), {
    target: { files: [syntheticFile('%PDF-1.4', 'synthetic-cv.pdf', 'application/pdf')] },
  });
  fireEvent.click(screen.getByRole('checkbox', { name: /I consent/ }));
  fireEvent.submit(screen.getByRole('form', { name: 'Apply for this role' }));
}

beforeAll(installBlobArrayBuffer);

afterEach(() => {
  vi.restoreAllMocks();
});

describe('detail navigation races', () => {
  it('never lets a late response for opportunity A replace opportunity B', async () => {
    const api = routeResponses();
    const { rerender } = render(panel('role-a'));
    expect(callsTo(api.fetchMock, `${API}/v1/public/opportunities/role-a`)).toHaveLength(1);

    rerender(panel('role-b'));
    await resolveInAct(api.detail('role-b'), jsonResponse({ opportunity: ROLE_B }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Synthetic role B' }),
    ).toBeVisible();

    await resolveInAct(api.detail('role-a'), jsonResponse({ opportunity: ROLE_A }));
    expect(screen.getByRole('heading', { level: 1, name: 'Synthetic role B' })).toBeVisible();
    expect(screen.queryByText('Synthetic role A')).toBeNull();
  });

  it('never lets a late failure for opportunity A mark opportunity B unavailable', async () => {
    const api = routeResponses();
    const { rerender } = render(panel('role-a'));
    rerender(panel('role-b'));
    await resolveInAct(api.detail('role-b'), jsonResponse({ opportunity: ROLE_B }));
    await screen.findByRole('heading', { level: 1, name: 'Synthetic role B' });

    await resolveInAct(api.detail('role-a'), jsonResponse({}, 404));
    expect(screen.getByRole('heading', { level: 1, name: 'Synthetic role B' })).toBeVisible();
    expect(screen.queryByText('This opportunity is not available')).toBeNull();
  });
});

describe('submission races', () => {
  it('shows nothing from opportunity A’s application on opportunity B', async () => {
    const api = routeResponses();
    const { rerender } = render(panel('role-a'));
    await resolveInAct(api.detail('role-a'), jsonResponse({ opportunity: ROLE_A }));
    await screen.findByRole('heading', { level: 1, name: 'Synthetic role A' });

    applyWithRequiredFields();
    await waitFor(() =>
      expect(
        callsTo(api.fetchMock, `${API}/v1/public/opportunities/role-a/applications`),
      ).toHaveLength(1),
    );

    rerender(panel('role-b'));
    await resolveInAct(api.detail('role-b'), jsonResponse({ opportunity: ROLE_B }));
    await screen.findByRole('heading', { level: 1, name: 'Synthetic role B' });

    // A is still pending when B is shown; B's form is usable, not locked by A.
    expect(screen.getByRole('button', { name: 'Submit application' })).toBeEnabled();

    await resolveInAct(
      api.submission('role-a'),
      jsonResponse({ message: 'x', status: 'RECEIVED' }),
    );
    expect(screen.queryByText('Application received')).toBeNull();
    expect(screen.getByRole('form', { name: 'Apply for this role' })).toBeVisible();

    applyWithRequiredFields();
    await waitFor(() =>
      expect(
        callsTo(api.fetchMock, `${API}/v1/public/opportunities/role-b/applications`),
      ).toHaveLength(1),
    );
    await resolveInAct(
      api.submission('role-b'),
      jsonResponse({ message: 'x', status: 'RECEIVED' }),
    );
    expect(await screen.findByText('Application received')).toBeVisible();
  });

  it('shows no failure from opportunity A’s application on opportunity B', async () => {
    const api = routeResponses();
    const { rerender } = render(panel('role-a'));
    await resolveInAct(api.detail('role-a'), jsonResponse({ opportunity: ROLE_A }));
    await screen.findByRole('heading', { level: 1, name: 'Synthetic role A' });
    applyWithRequiredFields();
    await waitFor(() =>
      expect(
        callsTo(api.fetchMock, `${API}/v1/public/opportunities/role-a/applications`),
      ).toHaveLength(1),
    );

    rerender(panel('role-b'));
    await resolveInAct(api.detail('role-b'), jsonResponse({ opportunity: ROLE_B }));
    await screen.findByRole('heading', { level: 1, name: 'Synthetic role B' });

    await resolveInAct(api.submission('role-a'), jsonResponse({}, 500));
    expect(screen.queryByText('Application not sent')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('ignores an application that resolves after the page is gone', async () => {
    const api = routeResponses();
    const consoleError = vi.spyOn(console, 'error');
    const { unmount } = render(panel('role-a'));
    await resolveInAct(api.detail('role-a'), jsonResponse({ opportunity: ROLE_A }));
    await screen.findByRole('heading', { level: 1, name: 'Synthetic role A' });
    applyWithRequiredFields();
    await waitFor(() =>
      expect(
        callsTo(api.fetchMock, `${API}/v1/public/opportunities/role-a/applications`),
      ).toHaveLength(1),
    );

    unmount();
    await resolveInAct(
      api.submission('role-a'),
      jsonResponse({ message: 'x', status: 'RECEIVED' }),
    );
    expect(consoleError).not.toHaveBeenCalled();
  });
});
