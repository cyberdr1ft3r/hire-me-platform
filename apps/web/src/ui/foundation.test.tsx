import { readFileSync } from 'node:fs';
import path from 'node:path';

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DesignSystemPreview } from '../design-system-preview/DesignSystemPreview.js';
import { Button, InlineMessage, StatusBadge, TextField } from './index.js';

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
});
