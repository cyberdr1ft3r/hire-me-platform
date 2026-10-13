import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PageHeader } from './PageHeader.js';
import {
  WorkspacePane,
  WorkspaceSection,
  WorkspaceSurface,
  WorkspaceToolbar,
} from './Workspace.js';

describe('Workspace Surface primitives', () => {
  it('renders one surface with a list and a record pane, toolbar pinned before the body', () => {
    const bodyRef = createRef<HTMLDivElement>();
    render(
      <WorkspaceSurface split="wide" view="detail">
        <WorkspacePane
          aria-labelledby="list-heading"
          kind="list"
          toolbar={
            <WorkspaceToolbar
              actions={<button type="button">Refresh</button>}
              heading={<h2 id="list-heading">Inbox</h2>}
            >
              <input aria-label="Search inbox" />
            </WorkspaceToolbar>
          }
        >
          <p>Rows</p>
        </WorkspacePane>
        <WorkspacePane as="div" bodyRef={bodyRef} kind="detail">
          <WorkspaceSection aria-label="Profile" heading={<h3>Profile</h3>}>
            <p>Record</p>
          </WorkspaceSection>
        </WorkspacePane>
      </WorkspaceSurface>,
    );

    const list = screen.getByRole('region', { name: 'Inbox' });
    expect(list).toHaveAttribute('data-pane', 'list');
    const surface = list.closest('.ui-workspace');
    expect(surface).toHaveAttribute('data-split', 'wide');
    expect(list.parentElement).toHaveAttribute('data-view', 'detail');
    const [toolbar, body] = Array.from(list.children);
    expect(toolbar).toHaveClass('ui-workspace__toolbar');
    expect(toolbar).toContainElement(screen.getByRole('textbox', { name: 'Search inbox' }));
    expect(toolbar).toContainElement(screen.getByRole('button', { name: 'Refresh' }));
    expect(body).toHaveClass('ui-workspace__pane-body');
    expect(bodyRef.current).toContainElement(screen.getByText('Record'));
    expect(screen.getByRole('region', { name: 'Profile' })).toHaveClass('ui-workspace__section');
  });

  it('offers a compact page header without dropping its content', () => {
    render(<PageHeader compact description="Purpose" eyebrow="Area" title="Workspace" />);
    const heading = screen.getByRole('heading', { level: 1, name: 'Workspace' });
    expect(heading.closest('header')).toHaveClass('ui-page-header', 'ui-page-header--compact');
    expect(screen.getByText('Purpose')).toBeVisible();
    expect(screen.getByText('Area')).toBeVisible();
  });
});
