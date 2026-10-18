import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Button } from './Button.js';
import {
  ContextualActions,
  DirectoryPage,
  FilterToolbar,
  PageShell,
  PageState,
  RecordPage,
} from './PageSystem.js';

describe('page system foundation', () => {
  it('composes an accessible directory without taking ownership of its controls', () => {
    render(
      <DirectoryPage
        compact
        description="Manage the directory"
        layout="fill"
        primaryAction={<Button>Create client</Button>}
        title="Clients"
        toolbar={
          <FilterToolbar
            actions={<Button variant="secondary">Export</Button>}
            aria-label="Client filters"
            filters={
              <select aria-label="Status">
                <option>All</option>
              </select>
            }
            search={<input aria-label="Search clients" />}
            status={<span>20 results</span>}
          />
        }
      >
        <p>Directory rows</p>
      </DirectoryPage>,
    );

    const page = screen.getByRole('region', { name: 'Clients' });
    const heading = within(page).getByRole('heading', { level: 1, name: 'Clients' });
    expect(page).toHaveAttribute('data-page-kind', 'directory');
    expect(page).toHaveAttribute('data-page-layout', 'fill');
    expect(page).toHaveAttribute('aria-labelledby', heading.id);
    expect(within(page).getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('region', { name: 'Client filters' })).toContainElement(
      screen.getByRole('textbox', { name: 'Search clients' }),
    );
    expect(screen.getByRole('combobox', { name: 'Status' })).toBeVisible();
    expect(screen.getByText('20 results')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Create client' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Export' })).toBeVisible();
  });

  it('keeps record actions caller-owned and in secondary, overflow, primary order', () => {
    render(
      <RecordPage
        secondaryActions={
          <ContextualActions
            overflow={<button type="button">More actions</button>}
            primary={<button type="button">Edit record</button>}
            secondary={<button type="button">Back</button>}
          />
        }
        title="Client record"
      >
        <p>Record body</p>
      </RecordPage>,
    );

    const page = screen.getByRole('region', { name: 'Client record' });
    expect(page).toHaveAttribute('data-page-kind', 'record');
    expect(
      within(page)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Back', 'More actions', 'Edit record']);
  });

  it('renders loading, empty, error, and permission states with distinct semantics', () => {
    const { rerender } = render(<PageState kind="loading" title="Loading clients" />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading clients');

    rerender(
      <PageState kind="empty" title="No clients">
        Adjust your filters.
      </PageState>,
    );
    expect(screen.getByRole('region', { name: 'No clients' })).toHaveTextContent(
      'Adjust your filters.',
    );

    rerender(
      <PageState kind="error" title="Clients unavailable">
        Try again.
      </PageState>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Clients unavailableTry again.');

    rerender(
      <PageShell aria-label="Restricted page">
        <PageState kind="permission-denied" title="Access denied">
          Your role cannot open this page.
        </PageState>
      </PageShell>,
    );
    expect(screen.getByRole('alert')).toHaveAccessibleName('Access denied');
    expect(screen.getByRole('alert')).toHaveTextContent('Your role cannot open this page.');
  });
});
