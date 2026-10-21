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
  permissions: ['tasks:view', 'missions:view', 'candidates:view'],
};

afterEach(() => {
  window.localStorage.clear();
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
  it('separates Console tab navigation from the active page surface', () => {
    mockMobileNavigation(false);
    const { container } = render(
      <I18nProvider initialLocale="en">
        <AppShell
          apiState={{ status: 'ready', message: 'Synthetic API is healthy' }}
          consoleWorkspace={<div role="tablist" aria-label="Workspace tabs" />}
          currentRoute="tasks"
          onLogout={() => undefined}
          onNavigate={() => undefined}
          onRefreshUser={() => undefined}
          user={syntheticUser}
        >
          <section data-testid="workspace-page">Tasks content</section>
        </AppShell>
      </I18nProvider>,
    );

    const shell = container.querySelector('.app-shell');
    expect(shell).toHaveAttribute('data-console-workspace', 'true');
    const tabsRow = shell?.querySelector('.app-shell__console-workspace');
    expect(tabsRow?.querySelector('[role="tablist"]')).toBeInTheDocument();
    const utilityRow = shell?.querySelector('.app-shell__utility-bar');
    const moduleNavigation = shell?.querySelector('.app-shell__module-nav');
    const main = shell?.querySelector('.app-shell__main');
    expect(utilityRow?.compareDocumentPosition(moduleNavigation!)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(moduleNavigation?.compareDocumentPosition(tabsRow!)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(tabsRow?.compareDocumentPosition(main!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    const surface = container.querySelector('.app-shell__surface');
    expect(surface).toContainElement(screen.getByTestId('workspace-page'));
    expect(surface?.parentElement).toHaveClass('app-shell__content');
  });

  it('keeps the desktop shell compact and the More menu outside the tab-strip scrollport', () => {
    const shellCss = readFileSync(path.resolve('src/ui/shell/app-shell.css'), 'utf8');

    expect(shellCss).toMatch(/\.app-shell\s*\{[^}]*--layout-shell-topbar-height:\s*2\.75rem;/s);
    expect(shellCss).toMatch(/\.app-shell__more-panel\s*\{[^}]*position:\s*fixed;/s);
    expect(shellCss).toMatch(
      /@media\s*\(min-width:\s*56\.3125rem\)\s*\{[\s\S]*?\.console-tabs__tab,[\s\S]*?\.console-tabs__more\s*\{[^}]*min-height:\s*calc\(var\(--control-height-compact\)\s*-\s*var\(--border-width\)\);/,
    );
    expect(shellCss).toMatch(
      /\.console-tabs__dialog-item,[\s\S]*?\.console-tabs__action\s*\{[^}]*min-height:\s*max\(var\(--hit-target-min\),\s*2\.75rem\);/,
    );
  });

  it('uses a permission-filtered More menu without replacing the route', async () => {
    mockMobileNavigation(false);
    render(
      <I18nProvider initialLocale="en">
        <AppShell
          apiState={{ status: 'ready', message: 'Synthetic API is healthy' }}
          currentRoute="home"
          onLogout={() => undefined}
          onNavigate={() => undefined}
          onRefreshUser={() => undefined}
          user={{ ...syntheticUser, permissions: ['tasks:view', 'documents:view', 'users:view'] }}
        >
          <h1>Overview content</h1>
        </AppShell>
      </I18nProvider>,
    );
    const more = screen.getByRole('button', { name: 'More' });
    expect(screen.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Tasks' })).toHaveAttribute('href', '/tasks');
    expect(screen.queryByRole('link', { name: 'Administration' })).not.toBeInTheDocument();
    fireEvent.click(more);
    expect(screen.getByText('Documents')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Administration' })).toHaveAttribute('href', '/admin');
    fireEvent.keyDown(more, { key: 'Escape' });
    expect(screen.queryByRole('link', { name: 'Administration' })).not.toBeInTheDocument();
    await waitFor(() => expect(more).toHaveFocus());
  });

  it('keeps modified links native and closes the account popover with Escape', () => {
    mockMobileNavigation(false);
    render(<ShellHarness />);
    expect(screen.getByRole('heading', { name: 'Overview content' })).toBeVisible();
    const account = screen.getByLabelText('Account and session');
    fireEvent.click(account);
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeVisible();
    fireEvent.keyDown(account, { key: 'Escape' });
    expect(account).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Sign out' })).not.toBeVisible();
  });

  it('renders permission-aware semantic navigation and an active destination', () => {
    mockMobileNavigation(false);
    render(<ShellHarness />);

    expect(screen.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Tasks' })).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Administration' })).not.toBeInTheDocument();
    expect(screen.getByText('API healthy')).toBeVisible();
    fireEvent.click(screen.getByLabelText('Account and session'));
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

  it('renders a navigation badge with a visual count and an accessible label', () => {
    mockMobileNavigation(false);
    render(
      <I18nProvider initialLocale="en">
        <AppShell
          apiState={{ status: 'ready', message: 'Synthetic API is healthy' }}
          currentRoute="home"
          navigationBadges={{ messages: { display: '3', label: '3 unread conversations' } }}
          onLogout={() => undefined}
          onNavigate={() => undefined}
          onRefreshUser={() => undefined}
          user={{ ...syntheticUser, permissions: ['messages:view'] }}
        >
          <h1>Overview content</h1>
        </AppShell>
      </I18nProvider>,
    );

    const messages = screen.getByRole('link', {
      name: /Messages.*3 unread conversations/,
    });
    expect(messages).toHaveAccessibleName(/Messages.*3 unread conversations/);
    expect(messages).toHaveAttribute('href', '/messages');
  });

  it('hides Messages without messages:view', () => {
    mockMobileNavigation(false);
    render(<ShellHarness />);
    expect(screen.queryByRole('link', { name: /Messages/ })).not.toBeInTheDocument();
  });

  it('does not advertise unavailable global search and presents the application as context', () => {
    mockMobileNavigation(false);
    render(<ShellHarness />);

    expect(screen.queryByRole('search')).not.toBeInTheDocument();
    expect(screen.queryByText('Search HireMe…')).not.toBeInTheDocument();
    const applicationContext = screen.getByLabelText('Current application');
    expect(applicationContext).toHaveClass('app-shell__application-context');
    expect(applicationContext).toHaveTextContent('Recruitment');
    expect(applicationContext).not.toBeInstanceOf(HTMLButtonElement);
    expect(applicationContext).not.toHaveAttribute('aria-haspopup');

    const shellCss = readFileSync(path.resolve('src/ui/shell/app-shell.css'), 'utf8');
    expect(shellCss).toMatch(
      /\.app-shell__application-context\s*\{[^}]*display:\s*inline-flex;[^}]*color:\s*var\(--color-text-secondary\);/s,
    );
    expect(shellCss).not.toMatch(/\.app-shell__application-context\s*\{[^}]*background:/s);
    expect(shellCss).toMatch(
      /\.app-shell__utility-bar\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto;/s,
    );
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

  it('constrains the notification list to an independently scrolling grid row', () => {
    const shellCss = readFileSync(path.resolve('src/ui/shell/app-shell.css'), 'utf8');

    expect(shellCss).toMatch(
      /\.notification-center__panel\s*\{[^}]*grid-template-rows:\s*auto auto minmax\(0, 1fr\);[^}]*overflow:\s*clip;/s,
    );
    expect(shellCss).toMatch(
      /\.notification-center__body\s*\{[^}]*min-height:\s*0;[^}]*overflow-y:\s*auto;[^}]*overscroll-behavior-y:\s*auto;/s,
    );
    expect(shellCss).toMatch(
      /\.notification-center__header > \.ui-button,[^{]*\.notification-center__list li > \.ui-button\s*\{[^}]*max-width:\s*100%;[^}]*white-space:\s*normal;/s,
    );
  });
});

describe('AppShell single-destination domains and workspace layout', () => {
  const communicationUser: AuthenticatedUser = {
    ...syntheticUser,
    permissions: ['tasks:view', 'messages:view', 'users:view'],
  };

  function RoutedShell() {
    const [route, setRoute] = useState<InternalRoute>('home');
    return (
      <I18nProvider initialLocale="en">
        <AppShell
          apiState={{ status: 'ready', message: 'Synthetic API is healthy' }}
          currentRoute={route}
          onLogout={() => undefined}
          onNavigate={setRoute}
          onRefreshUser={() => undefined}
          user={communicationUser}
        >
          <h1>{`Route ${route}`}</h1>
        </AppShell>
      </I18nProvider>
    );
  }

  it('navigates using existing routes and reflects the active primary destination', () => {
    mockMobileNavigation(false);
    const { container } = render(<RoutedShell />);
    expect(container.querySelector('.app-shell')).toHaveAttribute('data-layout', 'flow');

    fireEvent.click(screen.getByRole('link', { name: 'Messages' }));
    expect(screen.getByRole('heading', { name: 'Route messages' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Messages' })).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('link', { name: 'Administration' })).not.toBeInTheDocument();
    expect(container.querySelector('.app-shell')).toHaveAttribute('data-layout', 'fill');

    const workspace = container.querySelector('.app-shell__console-workspace');
    expect(workspace).toBeNull();
    const utility = container.querySelector('.app-shell__utility-bar');
    const moduleNavigation = container.querySelector('.app-shell__module-nav');
    const moduleHome = screen.getByRole('main');
    expect(utility?.compareDocumentPosition(moduleNavigation!)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(moduleNavigation?.compareDocumentPosition(moduleHome)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it('navigates from More using the existing route and closes the menu', () => {
    mockMobileNavigation(false);
    render(<RoutedShell />);
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    const admin = screen.getByRole('link', { name: 'Administration' });
    expect(admin).toHaveAttribute('href', '/admin');
    fireEvent.click(admin);
    expect(screen.getByRole('heading', { name: 'Route admin' })).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Administration' })).not.toBeInTheDocument();
  });
});
