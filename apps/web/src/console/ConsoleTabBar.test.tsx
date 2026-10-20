import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../i18n/index.js';
import { consoleReducer, initialConsoleState, type TabId } from './console-state.js';
import { ConsoleTabBar } from './ConsoleTabBar.js';

afterEach(() => vi.unstubAllGlobals());

function makeState() {
  return consoleReducer(
    consoleReducer(initialConsoleState(), { type: 'openWorkspace', route: 'clients' }),
    {
      type: 'openWorkspace',
      route: 'tasks',
    },
  );
}

function renderBar(locale: 'en' | 'fr' = 'en', pending = false) {
  const state = makeState();
  const onActivate = vi.fn();
  const onClose = vi.fn();
  const onCancelPending = vi.fn();
  const onContinuePending = vi.fn();
  const onReplacePending = vi.fn();
  render(
    <I18nProvider initialLocale={locale}>
      <ConsoleTabBar
        canReplacePending={false}
        dirtyTabId="ws:tasks"
        onActivate={onActivate}
        onCancelPending={onCancelPending}
        onClose={onClose}
        onContinuePending={onContinuePending}
        onReplacePending={onReplacePending}
        pendingLabel={pending ? 'Missions' : undefined}
        state={state}
        visibleTabs={state.tabs}
      />
    </I18nProvider>,
  );
  return { onActivate, onClose, onCancelPending, onContinuePending, onReplacePending, state };
}

describe('ConsoleTabBar', () => {
  it('opens the localized tab-list dialog, exposes dirty state, and closes with Escape', async () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }));
    renderBar('fr');

    fireEvent.click(screen.getByRole('button', { name: 'Onglets' }));
    expect(screen.getByRole('dialog', { name: 'Espaces ouverts' })).toBeVisible();
    expect(
      screen.getByRole('tab', { name: /Tâches.*Modifications non enregistrées/ }),
    ).toBeVisible();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Onglets' })).toHaveFocus());
  });

  it('uses arrow-key tab navigation to activate a workspace and preserves the close action', () => {
    const { onActivate, onClose, state } = renderBar();
    const overview = screen.getByRole('tab', { name: 'Overview' });
    fireEvent.keyDown(overview, { key: 'ArrowRight' });
    expect(onActivate).toHaveBeenCalledWith(state.tabs[1], true);
    fireEvent.click(screen.getByRole('button', { name: 'Close Clients' }));
    expect(onClose).toHaveBeenCalledWith('ws:clients' satisfies TabId);
  });

  it('prevents replacement when no least-recently-used clean tab can be replaced', () => {
    renderBar('en', true);
    fireEvent.click(screen.getByRole('button', { name: 'More tabs' }));
    expect(
      screen.getByRole('button', { name: 'Replace least-recently-used clean tab' }),
    ).toBeDisabled();
  });
});
