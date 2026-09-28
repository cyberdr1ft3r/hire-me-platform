import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider, useI18n } from '../i18n/index.js';
import { deferredEnglishRoutes } from '../navigation/internal-navigation.js';
import { ClientsPanel } from './ClientsPanel.js';

const clientId = '11111111-1111-4111-8111-111111111111';
const secondClientId = '33333333-3333-4333-8333-333333333333';
const contactId = '22222222-2222-4222-8222-222222222222';
const secondContactId = '44444444-4444-4444-8444-444444444444';

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

function clientSummary(name = 'Acme Corp', id = clientId) {
  return {
    id,
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

function contactSummary(displayName: string, id: string, forClientId = clientId) {
  const email = `${displayName.toLowerCase().replace(/\s+/g, '.')}@example.test`;
  return {
    id,
    clientId: forClientId,
    displayName,
    email,
    normalizedEmail: email,
    phone: null,
    roleTitle: 'Buyer',
    status: 'ACTIVE',
    portalStatus: 'DISABLED',
    archivedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

type RecordedCall = { method: string; token: string | null; url: string };

function readAuthToken(init?: RequestInit, input?: RequestInfo | URL): string | null {
  const headers = init?.headers ?? (input instanceof Request ? input.headers : undefined);
  if (!headers) {
    return null;
  }
  let value: string | null | undefined;
  if (headers instanceof Headers) {
    value = headers.get('Authorization');
  } else if (Array.isArray(headers)) {
    value = headers.find(([key]) => key.toLowerCase() === 'authorization')?.[1];
  } else if (headers && typeof headers === 'object') {
    value = Object.entries(headers).find(
      ([key]) => key.toLowerCase() === 'authorization',
    )?.[1];
  }
  return typeof value === 'string' ? value : null;
}

function deferredResponse() {
  let release: (response: Response) => void = () => undefined;
  const promise = new Promise<Response>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

function defaultClientsFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
  hold?: (call: RecordedCall) => Response | Promise<Response> | undefined, // eslint-disable-line @typescript-eslint/no-redundant-type-constituents
): Promise<Response> {
  const url = input instanceof Request ? input.url : input.toString();
  const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
  const call: RecordedCall = {
    method,
    token: readAuthToken(init, input),
    url,
  };
  const held = hold?.(call);
  if (held) {
    return Promise.resolve(held);
  }

  if (url.includes('/v1/clients?')) {
    return Promise.resolve(
      jsonResponse({
        clients: [clientSummary('Acme Corp'), clientSummary('Beta Industries', secondClientId)],
        pagination: { page: 1, pageSize: 20, total: 2 },
      }),
    );
  }
  if (url.endsWith(`/v1/clients/${clientId}`) && method === 'GET') {
    return Promise.resolve(jsonResponse({ client: clientSummary('Acme Corp') }));
  }
  if (url.endsWith(`/v1/clients/${secondClientId}`) && method === 'GET') {
    return Promise.resolve(
      jsonResponse({ client: clientSummary('Beta Industries', secondClientId) }),
    );
  }
  if (url.includes(`/v1/clients/${clientId}/contacts?`)) {
    return Promise.resolve(
      jsonResponse({
        contacts: [
          contactSummary('Jane Doe', contactId),
          contactSummary('John Smith', secondContactId),
        ],
        pagination: { page: 1, pageSize: 20, total: 2 },
      }),
    );
  }
  if (url.includes(`/v1/clients/${secondClientId}/contacts?`)) {
    return Promise.resolve(
      jsonResponse({
        contacts: [
          contactSummary('Beta Contact', '55555555-5555-4555-8555-555555555555', secondClientId),
        ],
        pagination: { page: 1, pageSize: 20, total: 1 },
      }),
    );
  }
  return Promise.reject(new Error(`${method} ${url}`));
}

function stubClientsApi(hold?: (call: RecordedCall) => Response | Promise<Response> | undefined) {
  const calls: RecordedCall[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = input instanceof Request ? input.url : input.toString();
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
    const call: RecordedCall = {
      method,
      token: readAuthToken(init, input),
      url,
    };
    calls.push(call);
    return defaultClientsFetch(input, init, hold);
  });
  return { calls };
}

async function selectClientByName(name: string) {
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(name) }));
  await screen.findByRole('form', { name: 'Client profile' });
}

function clientProfileForm() {
  return screen.getByRole('form', { name: 'Client profile' });
}

function contactEditForm() {
  return screen.getByRole('form', { name: 'Edit contact' });
}

async function waitForWriteToSettle() {
  await waitFor(() => expect(screen.getByRole('button', { name: 'Create client' })).toBeEnabled());
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

  it('does not show read-only when only contact mutations are allowed', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) =>
      defaultClientsFetch(input, init),
    );
    renderPanel(['clients:view', 'client_contacts:view', 'client_contacts:update']);
    await screen.findByRole('search', { name: 'Client search' });
    expect(screen.queryByText('Read-only access')).not.toBeInTheDocument();
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

describe('Client writes stay scoped to the client they started on', () => {
  it('does not show a late client update success on another selected client', async () => {
    const update = deferredResponse();
    stubClientsApi((call) =>
      call.method === 'PATCH' && call.url.endsWith(`/v1/clients/${clientId}`)
        ? update.promise
        : undefined,
    );
    renderPanel();
    await selectClientByName('Acme Corp');
    fireEvent.change(within(clientProfileForm()).getByRole('textbox', { name: 'Client name' }), {
      target: { value: 'Updated Acme' },
    });
    fireEvent.click(within(clientProfileForm()).getByRole('button', { name: 'Save client' }));
    await selectClientByName('Beta Industries');
    update.release(jsonResponse({ client: clientSummary('Updated Acme') }));
    await waitForWriteToSettle();

    expect(screen.getByRole('heading', { level: 2, name: 'Beta Industries' })).toBeVisible();
    expect(screen.queryByText('Client updated.')).toBeNull();
    expect(within(clientProfileForm()).getByRole('textbox', { name: 'Client name' })).toHaveValue(
      'Beta Industries',
    );
  });

  it('does not show a late contact update under another selected client', async () => {
    const update = deferredResponse();
    stubClientsApi((call) =>
      call.method === 'PATCH' && call.url.endsWith(`/v1/clients/${clientId}/contacts/${contactId}`)
        ? update.promise
        : undefined,
    );
    renderPanel();
    await selectClientByName('Acme Corp');
    fireEvent.click(await screen.findByRole('button', { name: /Jane Doe/ }));
    fireEvent.change(within(contactEditForm()).getByRole('textbox', { name: 'Contact name' }), {
      target: { value: 'Jane Updated' },
    });
    fireEvent.click(within(contactEditForm()).getByRole('button', { name: 'Save contact' }));
    await selectClientByName('Beta Industries');
    update.release(jsonResponse({ contact: contactSummary('Jane Updated', contactId) }));
    await waitForWriteToSettle();

    expect(screen.getByRole('heading', { level: 2, name: 'Beta Industries' })).toBeVisible();
    expect(screen.queryByText('Contact updated.')).toBeNull();
    expect(screen.queryByRole('heading', { level: 4, name: 'Jane Updated' })).toBeNull();
    expect(screen.getByRole('button', { name: /Beta Contact/ })).toBeVisible();
  });

  it('does not select a late-created contact after selecting another client', async () => {
    const create = deferredResponse();
    stubClientsApi((call) =>
      call.method === 'POST' && call.url.endsWith(`/v1/clients/${clientId}/contacts`)
        ? create.promise
        : undefined,
    );
    renderPanel();
    await selectClientByName('Acme Corp');
    const createContactForm = screen.getByRole('form', { name: 'New contact' });
    fireEvent.change(within(createContactForm).getByRole('textbox', { name: 'Contact name' }), {
      target: { value: 'Late Contact' },
    });
    fireEvent.click(within(createContactForm).getByRole('button', { name: 'Create contact' }));
    await selectClientByName('Beta Industries');
    create.release(
      jsonResponse(
        { contact: contactSummary('Late Contact', '66666666-6666-4666-8666-666666666666') },
        201,
      ),
    );
    await waitForWriteToSettle();

    expect(screen.getByRole('heading', { level: 2, name: 'Beta Industries' })).toBeVisible();
    expect(screen.queryByText('Contact created.')).toBeNull();
    expect(screen.queryByRole('heading', { level: 4, name: 'Late Contact' })).toBeNull();
  });

  it('keeps the newer selected contact when an older contact update resolves late', async () => {
    const update = deferredResponse();
    stubClientsApi((call) =>
      call.method === 'PATCH' && call.url.endsWith(`/v1/clients/${clientId}/contacts/${contactId}`)
        ? update.promise
        : undefined,
    );
    renderPanel();
    await selectClientByName('Acme Corp');
    fireEvent.click(await screen.findByRole('button', { name: /Jane Doe/ }));
    fireEvent.change(within(contactEditForm()).getByRole('textbox', { name: 'Contact name' }), {
      target: { value: 'Jane Updated' },
    });
    fireEvent.click(within(contactEditForm()).getByRole('button', { name: 'Save contact' }));
    fireEvent.click(screen.getByRole('button', { name: /John Smith/ }));
    expect(screen.getByRole('heading', { level: 4, name: 'John Smith' })).toBeVisible();
    update.release(jsonResponse({ contact: contactSummary('Jane Updated', contactId) }));
    await waitForWriteToSettle();

    expect(screen.getByRole('heading', { level: 4, name: 'John Smith' })).toBeVisible();
    expect(screen.queryByText('Contact updated.')).toBeNull();
    expect(within(contactEditForm()).getByRole('textbox', { name: 'Contact name' })).toHaveValue(
      'John Smith',
    );
  });
});

describe('Client writes respect session and permission principal', () => {
  it('does not commit a write after the access token is replaced', async () => {
    const update = deferredResponse();
    const { calls } = stubClientsApi((call) =>
      call.method === 'PATCH' && call.url.endsWith(`/v1/clients/${clientId}`)
        ? update.promise
        : undefined,
    );
    const panel = (token: string) => (
      <I18nProvider initialLocale="en">
        <ClientsPanel accessToken={token} permissions={fullPermissions} />
      </I18nProvider>
    );
    const view = render(panel('token-a'));
    await selectClientByName('Acme Corp');
    fireEvent.change(within(clientProfileForm()).getByRole('textbox', { name: 'Client name' }), {
      target: { value: 'Session A edit' },
    });
    fireEvent.click(within(clientProfileForm()).getByRole('button', { name: 'Save client' }));
    await waitFor(() => expect(calls.some((call) => call.method === 'PATCH')).toBe(true));
    const switchedAt = calls.length;

    view.rerender(panel('token-b'));
    expect(screen.getByRole('button', { name: 'Create client' })).toBeDisabled();
    await waitFor(() =>
      expect(
        calls.some((call) => call.url.includes('/v1/clients?') && call.token === 'Bearer token-b'),
      ).toBe(true),
    );

    update.release(jsonResponse({ client: clientSummary('Stale Name') }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Create client' })).toBeEnabled(),
    );

    expect(screen.queryByText('Client updated.')).toBeNull();
    expect(screen.queryByRole('form', { name: 'Client profile' })).toBeNull();
    expect(
      screen.getByText('Select a client to inspect its profile, lifecycle, and contacts.'),
    ).toBeVisible();
    const afterSwitch = calls.slice(switchedAt);
    expect(afterSwitch.every((call) => call.token === 'Bearer token-b')).toBe(true);
  });

  it('does not commit a write after the permission principal changes', async () => {
    const update = deferredResponse();
    stubClientsApi((call) =>
      call.method === 'PATCH' && call.url.endsWith(`/v1/clients/${clientId}`)
        ? update.promise
        : undefined,
    );
    const view = render(
      <I18nProvider initialLocale="en">
        <ClientsPanel accessToken="token-a" permissions={fullPermissions} />
      </I18nProvider>,
    );
    await selectClientByName('Acme Corp');
    fireEvent.change(within(clientProfileForm()).getByRole('textbox', { name: 'Client name' }), {
      target: { value: 'Principal edit' },
    });
    fireEvent.click(within(clientProfileForm()).getByRole('button', { name: 'Save client' }));

    view.rerender(
      <I18nProvider initialLocale="en">
        <ClientsPanel
          accessToken="token-a"
          permissions={fullPermissions.filter((permission) => permission !== 'clients:update')}
        />
      </I18nProvider>,
    );
    expect(screen.getByRole('button', { name: 'Create client' })).toBeDisabled();

    update.release(jsonResponse({ client: clientSummary('Stale Name') }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Create client' })).toBeEnabled(),
    );

    expect(screen.queryByText('Client updated.')).toBeNull();
    expect(screen.queryByRole('form', { name: 'Client profile' })).toBeNull();
  });
});

describe('Client writes never overlap', () => {
  it('locks other write entry points while a client update is in flight', async () => {
    const update = deferredResponse();
    const { calls } = stubClientsApi((call) =>
      call.method === 'PATCH' && call.url.endsWith(`/v1/clients/${clientId}`)
        ? update.promise
        : undefined,
    );
    renderPanel();
    await selectClientByName('Acme Corp');
    fireEvent.change(within(clientProfileForm()).getByRole('textbox', { name: 'Client name' }), {
      target: { value: 'Overlap edit' },
    });
    fireEvent.click(within(clientProfileForm()).getByRole('button', { name: 'Save client' }));
    await waitFor(() => expect(calls.filter((call) => call.method === 'PATCH')).toHaveLength(1));

    fireEvent.click(await screen.findByRole('button', { name: /Jane Doe/ }));
    expect(within(contactEditForm()).getByRole('button', { name: 'Save contact' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Create contact' })).toBeDisabled();
    const clientLifecycle = within(screen.getByRole('region', { name: 'Lifecycle' }));
    for (const name of ['Mark prospect', 'Mark inactive', 'Archive client']) {
      expect(clientLifecycle.getByRole('button', { name })).toBeDisabled();
    }

    fireEvent.click(within(contactEditForm()).getByRole('button', { name: 'Save contact' }));
    expect(calls.filter((call) => call.method === 'PATCH')).toHaveLength(1);

    update.release(jsonResponse({ client: clientSummary('Acme Corp') }));
    await waitForWriteToSettle();
    fireEvent.click(within(contactEditForm()).getByRole('button', { name: 'Save contact' }));
    await waitFor(() => expect(calls.filter((call) => call.method === 'PATCH')).toHaveLength(2));
  });
});
