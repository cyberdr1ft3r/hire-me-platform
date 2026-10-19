import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../i18n/index.js';
import { AgendaPanel } from './AgendaPanel.js';

vi.mock('../api.js', () => ({
  listAgenda: vi.fn(() => ({
    items: [],
    window: { from: '2026-10-01T00:00:00.000Z', to: '2026-10-31T00:00:00.000Z' },
  })),
  getMeeting: vi.fn(),
}));

describe('AgendaPanel', () => {
  it('renders the agenda workspace shell', async () => {
    const { container } = render(
      <I18nProvider>
        <AgendaPanel accessToken="token" onNavigate={vi.fn()} />
      </I18nProvider>,
    );
    expect(await screen.findByRole('region', { name: 'My Agenda' })).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('region', { name: 'Agenda filters' })).toBeVisible();
    expect(container.querySelector('[data-page-kind="directory"]')).not.toBeNull();
    expect(container.querySelector('[data-state="empty"]')).not.toBeNull();
  });
});
