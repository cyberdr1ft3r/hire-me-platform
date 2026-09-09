import { useState } from 'react';
import type { AuthenticatedUser } from '@hire-me/contracts';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppShellPreview } from '../../app-shell-preview/AppShellPreview.js';
import type { InternalRoute } from '../../navigation/internal-navigation.js';
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
      media: '(max-width: 47.999rem)',
      onchange: null,
      removeEventListener: vi.fn(),
    }),
  );
}

function ShellHarness() {
  const [route, setRoute] = useState<InternalRoute>('home');
  return (
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
});
