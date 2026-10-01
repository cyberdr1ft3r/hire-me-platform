import { readFileSync } from 'node:fs';
import path from 'node:path';

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DesignSystemPreview } from '../design-system-preview/DesignSystemPreview.js';
import { Button, InlineMessage, Select, StatusBadge, TextField } from './index.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('HireMe foundation components', () => {
  it('keeps a disabled button native and non-interactive', () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Save
      </Button>,
    );

    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('prevents a loading button from triggering twice', () => {
    const onClick = vi.fn();
    render(
      <Button loading loadingLabel="Saving…" onClick={onClick}>
        Save
      </Button>,
    );

    const button = screen.getByRole('button', { name: 'Saving…' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    fireEvent.click(button);
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('uses a native focusable button and a global focus-visible treatment', () => {
    render(<Button>Continue</Button>);
    const button = screen.getByRole('button', { name: 'Continue' });
    button.focus();
    expect(button).toHaveFocus();
    expect(button.tagName).toBe('BUTTON');

    const baseCss = readFileSync(path.resolve('src/styles/base.css'), 'utf8');
    expect(baseCss).toContain(':focus-visible');
    expect(baseCss).toContain('var(--color-focus)');
  });

  it('associates field labels, hints, and errors with the native control', () => {
    render(<TextField error="Enter a valid reference." hint="Format: HM-0000" label="Reference" />);

    const input = screen.getByLabelText('Reference');
    const error = screen.getByRole('alert');
    const describedBy = input.getAttribute('aria-describedby') ?? '';
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(describedBy).toContain(error.id);
    expect(screen.getByText('Format: HM-0000').id).not.toBe('');
  });

  it('renders status meaning as text instead of color alone', () => {
    render(<StatusBadge tone="success">Active</StatusBadge>);
    const badge = screen.getByText('Active');
    expect(badge).toHaveAttribute('data-status', 'success');
    expect(badge).toHaveTextContent('Active');
  });

  it('keeps ordinary inline messages out of live regions', () => {
    render(
      <>
        <InlineMessage title="Information">Static guidance.</InlineMessage>
        <InlineMessage title="Unable to continue" tone="danger">
          Static recovery guidance.
        </InlineMessage>
      </>,
    );

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('announces explicitly dynamic feedback with urgency derived from its tone', () => {
    const { rerender } = render(
      <InlineMessage announce title="Saved" tone="success">
        Changes are up to date.
      </InlineMessage>,
    );

    expect(screen.getByRole('status')).toHaveAttribute('aria-atomic', 'true');

    rerender(
      <InlineMessage announce title="Unable to save" tone="danger">
        Try again.
      </InlineMessage>,
    );

    expect(screen.getByRole('alert')).toHaveAttribute('aria-atomic', 'true');
  });

  it('renders the preview without making API calls', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    render(<DesignSystemPreview />);
    expect(
      screen.getByRole('heading', { name: 'Calm systems for consequential work.' }),
    ).toBeVisible();
    const selectedRow = screen.getByRole('row', { name: /Candidate 1044/ });
    expect(selectedRow).toHaveAttribute('aria-selected', 'true');
    expect(selectedRow.querySelector('.preview-table__selection-marker')).not.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('keeps reduced-motion behavior and density tokens wired into the foundation', () => {
    const baseCss = readFileSync(path.resolve('src/styles/base.css'), 'utf8');
    const tokensCss = readFileSync(path.resolve('src/styles/tokens.css'), 'utf8');

    expect(baseCss).toContain('@media (prefers-reduced-motion: reduce)');
    expect(tokensCss).toContain("[data-density='internal-compact']");
    expect(tokensCss).toContain("[data-density='public-spacious']");
    expect(tokensCss).toContain('--motion-standard:');
  });

  it('keeps shared field, status, and select presentation fixes from Issue #115', () => {
    const componentsCss = readFileSync(path.resolve('src/styles/components.css'), 'utf8');
    // The declaration block of a top-level rule written as `selector {`.
    const rule = (selector: string) => {
      const start = componentsCss.indexOf(`\n${selector} {`);
      return start < 0 ? '' : componentsCss.slice(start, componentsCss.indexOf('}', start));
    };

    // A neighbour's hint must not stretch this field's control.
    expect(rule('.ui-field')).toContain('align-content: start;');
    // A status keeps its content width instead of stretching across a row.
    expect(rule('.ui-status')).toContain('width: fit-content;');
    // Selects stay native; only their presentation and opened list are styled.
    expect(componentsCss).toContain('\nselect.ui-field__control {\n  appearance: none;');
    expect(componentsCss).toContain('@supports (appearance: base-select)');
    expect(componentsCss).toContain('select.ui-field__control option:focus-visible');
  });

  it('renders Select as a labelled native select element', () => {
    render(
      <Select hint="Choose one" label="Notification status" onChange={() => undefined} value="">
        <option value="">Any status</option>
        <option value="UNREAD">Unread</option>
      </Select>,
    );
    const select = screen.getByRole('combobox', { name: 'Notification status' });
    expect(select.tagName).toBe('SELECT');
    expect(select).toHaveClass('ui-field__control');
    expect(select).toHaveAccessibleDescription('Choose one');
  });

  it('uses a system font stack, a bounded reading measure, and 44px mobile navigation', () => {
    const tokensCss = readFileSync(path.resolve('src/styles/tokens.css'), 'utf8');
    const utilitiesCss = readFileSync(path.resolve('src/styles/utilities.css'), 'utf8');
    const shellCss = readFileSync(path.resolve('src/ui/shell/app-shell.css'), 'utf8');

    const fontStack = tokensCss.match(/--font-family-ui:([^;]+);/)?.[1] ?? '';
    expect(fontStack).toMatch(/system-ui/);
    expect(fontStack).not.toMatch(/Inter/);
    expect(tokensCss).toContain('--layout-reading-measure:');
    expect(utilitiesCss).toContain('max-inline-size: var(--layout-reading-measure);');
    const mobile = shellCss.slice(shellCss.indexOf('@media (max-width: 56.25rem)'));
    expect(mobile).toMatch(
      /\.app-shell__nav-group a,[^{]*\{\s*min-height: var\(--hit-target-min\);/,
    );
  });
});
