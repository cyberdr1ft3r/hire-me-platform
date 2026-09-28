import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider, useI18n } from '../i18n/index.js';
import { deferredEnglishRoutes } from '../navigation/internal-navigation.js';
import { ClientsPanel } from './ClientsPanel.js';

const clientId = '11111111-1111-4111-8111-111111111111';
const contactId = '22222222-2222-4222-8222-222222222222';

const fullPermissions = [
  'clients:view',
  'clients:create',
  'clients:update',
  'clients:status:manage',
  'clients:archive',
  'client_contacts:view',
  'client_contacts:create',
  'client_contacts:update',
  'client_contacts:status:manage',
  'client_contacts:archive',
  'commercial_data:access',
];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}

function clientSummary(name = 'Acme Corp') {
  return {
    id: clientId,
    name,
    normalizedName: name.toLowerCase(),
    status: 'ACTIVE',
    industry: 'Technology',
    website: null,
    mainPhone: null,
    country: 'France',
    city: 'Paris',
    commercial: null,
    archivedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function renderPanel(permissions = fullPermissions, locale: 'en' | 'fr' = 'en') {
  return render(
    <I18nProvider initialLocale={locale}>
      <ClientsPanel accessToken="token-a" permissions={permissions} />
    </I18nProvider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ClientsPanel', () => {
  it('renders localized EN workspace and excludes clients from deferred English routes', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = input instanceof Request ? input.url : input.toString();
      if (url.includes('/v1/clients?')) {
        return Promise.resolve(
          jsonResponse({
            clients: [clientSummary()],
            pagination: { page: 1, pageSize: 20, total: 1 },
          }),
        );
      }
      return Promise.reject(new Error(url));
    });

    renderPanel();
    expect(await screen.findByRole('heading', { name: 'Clients', level: 1 })).toBeVisible();
    expect(screen.getByRole('search', { name: 'Client search' })).toBeVisible();
    expect(deferredEnglishRoutes.includes('clients')).toBe(false);
  });

  it('renders localized FR headings', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = input instanceof Request ? input.url : input.toString();
      if (url.includes('/v1/clients?')) {
        return Promise.resolve(
          jsonResponse({
            clients: [clientSummary('Société Demo')],
            pagination: { page: 1, pageSize: 20, total: 1 },
          }),
        );
      }
      return Promise.reject(new Error(url));
    });

    renderPanel(fullPermissions, 'fr');
    expect(await screen.findByRole('heading', { name: 'Clients', level: 1 })).toBeVisible();
    expect(screen.getByRole('search', { name: 'Recherche clients' })).toBeVisible();
  });

  it('does not refetch client list when locale changes', async () => {
    let listCalls = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = input instanceof Request ? input.url : input.toString();
      if (url.includes('/v1/clients?')) {
        listCalls += 1;
        return Promise.resolve(
          jsonResponse({
            clients: [clientSummary()],
            pagination: { page: 1, pageSize: 20, total: 1 },
          }),
        );
      }
      return Promise.reject(new Error(url));
    });

    function LocaleToggle() {
      const { locale, setLocale } = useI18n();
      return (
        <button onClick={() => setLocale(locale === 'en' ? 'fr' : 'en')} type="button">
          Toggle locale
        </button>
      );
    }

    render(
      <I18nProvider initialLocale="en">
        <LocaleToggle />
        <ClientsPanel accessToken="token-a" permissions={fullPermissions} />
      </I18nProvider>,
    );
    await screen.findByRole('button', { name: /Acme Corp/ });
    const before = listCalls;
    fireEvent.click(screen.getByRole('button', { name: 'Toggle locale' }));
    expect(await screen.findByRole('search', { name: 'Recherche clients' })).toBeVisible();
    expect(listCalls).toBe(before);
  });

  it('passes search, status, industry and page to listClients', async () => {
    const calls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = input instanceof Request ? input.url : input.toString();
      if (url.includes('/v1/clients?')) {
        calls.push(url);
        return Promise.resolve(
          jsonResponse({
            clients: [],
            pagination: { page: 1, pageSize: 20, total: 0 },
          }),
        );
      }
      return Promise.reject(new Error(url));
    });

    renderPanel();
    const clientSearch = await screen.findByRole('search', { name: 'Client search' });
    fireEvent.change(within(clientSearch).getByLabelText('Search'), { target: { value: 'acme' } });
    fireEvent.change(within(clientSearch).getByLabelText('Status'), {
      target: { value: 'ACTIVE' },
    });
    fireEvent.change(within(clientSearch).getByLabelText('Industry'), {
      target: { value: 'Tech' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    await waitFor(() => expect(calls.length).toBeGreaterThan(1));
    expect(calls.at(-1)).toContain('search=acme');
    expect(calls.at(-1)).toContain('status=ACTIVE');
    expect(calls.at(-1)).toContain('industry=Tech');
  });

  it('hides commercial summary without commercial_data:access', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = input instanceof Request ? input.url : input.toString();
      if (url.includes('/v1/clients?')) {
        return Promise.resolve(
          jsonResponse({
            clients: [clientSummary()],
            pagination: { page: 1, pageSize: 20, total: 1 },
          }),
        );
      }
      if (url.endsWith(`/v1/clients/${clientId}`)) {
        return Promise.resolve(jsonResponse({ client: clientSummary() }));
      }
      if (url.includes('/contacts?')) {
        return Promise.resolve(
          jsonResponse({ contacts: [], pagination: { page: 1, pageSize: 20, total: 0 } }),
        );
      }
      return Promise.reject(new Error(url));
    });

    renderPanel(fullPermissions.filter((p) => p !== 'commercial_data:access'));
    await screen.findByRole('button', { name: /Acme Corp/ });
    fireEvent.click(screen.getByRole('button', { name: /Acme Corp/ }));
    await screen.findByRole('textbox', { name: 'Client name' });
    expect(screen.queryByLabelText('Commercial summary')).not.toBeInTheDocument();
  });

  it('loads contacts for selected client with search filter', async () => {
    const contactCalls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = input instanceof Request ? input.url : input.toString();
      if (url.includes('/v1/clients?')) {
        return Promise.resolve(
          jsonResponse({
            clients: [clientSummary()],
            pagination: { page: 1, pageSize: 20, total: 1 },
          }),
        );
      }
      if (url.endsWith(`/v1/clients/${clientId}`)) {
        return Promise.resolve(jsonResponse({ client: clientSummary() }));
      }
      if (url.includes(`/v1/clients/${clientId}/contacts?`)) {
        contactCalls.push(url);
        return Promise.resolve(
          jsonResponse({
            contacts: [
              {
                id: contactId,
                clientId,
                displayName: 'Jane Doe',
                email: 'jane@example.test',
                phone: null,
                roleTitle: 'Buyer',
                status: 'ACTIVE',
                archivedAt: null,
                createdAt: '2026-01-01T00:00:00.000Z',
                updatedAt: '2026-01-01T00:00:00.000Z',
              },
            ],
            pagination: { page: 1, pageSize: 20, total: 1 },
          }),
        );
      }
      return Promise.reject(new Error(url));
    });

    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: /Acme Corp/ }));
    await screen.findByRole('heading', { name: 'Contacts', level: 3 });
    await waitFor(() => expect(contactCalls.length).toBeGreaterThan(0));
    const contactSearch = screen.getByRole('search', { name: 'Contact search' });
    fireEvent.change(contactSearch.querySelector('input[name="contactSearch"]')!, {
      target: { value: 'jane' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Apply filters' })[1]!);
    await waitFor(() => expect(contactCalls.some((u) => u.includes('search=jane'))).toBe(true));
  });

  it('shows read-only notice for view-only permissions', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = input instanceof Request ? input.url : input.toString();
      if (url.includes('/v1/clients?')) {
        return Promise.resolve(
          jsonResponse({
            clients: [clientSummary()],
            pagination: { page: 1, pageSize: 20, total: 1 },
          }),
        );
      }
      return Promise.reject(new Error(url));
    });

    renderPanel(['clients:view']);
    await screen.findByRole('search', { name: 'Client search' });
    expect(screen.getAllByText('Read-only access').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Create client' })).not.toBeInTheDocument();
  });
});
