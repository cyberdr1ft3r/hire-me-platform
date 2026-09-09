import { readFileSync } from 'node:fs';
import path from 'node:path';
import { useState } from 'react';
import type { AuthenticatedUser } from '@hire-me/contracts';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppShellPreview } from '../../app-shell-preview/AppShellPreview.js';
import { I18nProvider } from '../../i18n/index.js';
import type { InternalRoute } from '../../navigation/internal-navigation.js';
import { Button } from '../Button.js';
import { PageHeader } from '../PageHeader.js';
import { AppShell } from './AppShell.js';

const syntheticUser: AuthenticatedUser = {
  id: '00000000-0000-4000-8000-000000000052',
  displayName: 'Synthetic Operator',
  email: 'operator@example.test',
  permissions: ['tasks:view', 'missions:view'],
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function mockMobileNavigation(matches: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      addEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches,
      media: '(max-width: 56.25rem)',
      onchange: null,
      removeEventListener: vi.fn(),
    }),
  );
}

function ShellHarness() {
  const [route, setRoute] = useState<InternalRoute>('home');
  return (
    <I18nProvider initialLocale="en">
      <AppShell
        apiState={{ status: 'ready', message: 'Synthetic API is healthy' }}
        currentRoute={route}
        onLogout={() => undefined}
        onNavigate={setRoute}
        onRefreshUser={() => undefined}
        user={syntheticUser}
      >
        <h1>{route === 'home' ? 'Overview content' : 'Task content'}</h1>
      </AppShell>
    </I18nProvider>
  );
}

describe('AppShell', () => {
  it('renders permission-aware semantic navigation and an active destination', () => {
    mockMobileNavigation(false);
    render(<ShellHarness />);

    expect(screen.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Tasks' })).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Administration' })).not.toBeInTheDocument();
    expect(screen.getByText('API healthy')).toBeVisible();
    expect(screen.getByText('operator@example.test')).toBeVisible();
  });

  it('uses real destination links and focuses main content after route navigation', async () => {
    mockMobileNavigation(false);
    render(<ShellHarness />);

    const tasks = screen.getByRole('link', { name: 'Tasks' });
    expect(tasks).toHaveAttribute('href', '/tasks');
    fireEvent.click(tasks);

    expect(await screen.findByRole('heading', { name: 'Task content' })).toBeVisible();
    expect(tasks).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('main')).toHaveFocus();
  });

  it('provides a skip target', () => {
    mockMobileNavigation(false);
    render(<ShellHarness />);

    expect(screen.getByRole('link', { name: 'Skip to main content' })).toHaveAttribute(
      'href',
      '#main-content',
    );
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
  });

  it('opens and closes modal-style mobile navigation with Escape and focus restoration', async () => {
    mockMobileNavigation(true);
    render(<ShellHarness />);

    const trigger = screen.getByRole('button', { name: 'Open navigation' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('dialog', { name: 'Mobile navigation' })).not.toBeInTheDocument();

    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Mobile navigation' });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('main')).toHaveAttribute('inert');

    const closeButton = screen.getByRole('button', { name: 'Close navigation' });
    await waitFor(() => expect(closeButton).toHaveFocus());
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(screen.getByRole('button', { name: 'Sign out' })).toHaveFocus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(closeButton).toHaveFocus();

    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(dialog).toHaveAttribute('aria-hidden', 'true');
    expect(dialog).toHaveAttribute('inert');
  });

  it('renders the synthetic full-screen preview without making API calls', () => {
    mockMobileNavigation(false);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    render(<AppShellPreview />);

    expect(screen.getByRole('heading', { name: 'AppShell review' })).toBeVisible();
    expect(screen.getByText('HM-SYNTHETIC')).toBeVisible();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('keeps PageHeader action labels intact while the action group can wrap', () => {
    render(
      <PageHeader
        primaryAction={<Button>Create item</Button>}
        secondaryActions={<Button variant="secondary">Secondary action</Button>}
        title="Constrained header"
      />,
    );

    expect(screen.getByRole('button', { name: 'Create item' })).toHaveTextContent('Create item');
    expect(screen.getByRole('button', { name: 'Secondary action' })).toHaveTextContent(
      'Secondary action',
    );

    const componentCss = readFileSync(path.resolve('src/styles/components.css'), 'utf8');
    const shellCss = readFileSync(path.resolve('src/ui/shell/app-shell.css'), 'utf8');
    expect(componentCss).toMatch(/\.ui-button\s*\{[^}]*white-space:\s*nowrap;/s);
    expect(shellCss).toMatch(/\.ui-page-header__actions\s*\{[^}]*flex-wrap:\s*wrap;/s);
    expect(shellCss).toMatch(/\.ui-page-header__actions > \*\s*\{[^}]*flex-shrink:\s*0;/s);
  });

  it('keeps the padded sidebar within the viewport and scrolls navigation before the session footer', () => {
    const shellSource = readFileSync(path.resolve('src/ui/shell/AppShell.tsx'), 'utf8');
    const shellCss = readFileSync(path.resolve('src/ui/shell/app-shell.css'), 'utf8');

    expect(shellSource).toContain("const mobileNavigationQuery = '(max-width: 56.25rem)'");
    expect(shellCss).toContain('@media (max-width: 56.25rem)');
    expect(shellCss).toMatch(/\.app-shell__sidebar\s*\{[^}]*box-sizing:\s*border-box;/s);
    expect(shellCss).toMatch(
      /\.app-shell__navigation\s*\{[^}]*flex:\s*1 1 auto;[^}]*min-height:\s*0;[^}]*overflow-y:\s*auto;/s,
    );
    expect(shellCss).toMatch(/\.app-shell__session\s*\{[^}]*flex:\s*0 0 auto;/s);
  });
});
