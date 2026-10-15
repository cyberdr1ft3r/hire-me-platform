import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { I18nProvider } from '../i18n/index.js';
import { RouteChunkErrorBoundary, RouteModuleFallback } from './RouteModuleBoundary.js';

function BrokenModule(): never {
  throw new Error('Chunk load failed');
}

describe('RouteModuleBoundary', () => {
  it('shows a localized loading fallback', () => {
    render(
      <I18nProvider initialLocale="en">
        <RouteModuleFallback />
      </I18nProvider>,
    );
    expect(screen.getByText('Loading workspace…')).toBeVisible();
  });

  it('shows retry UI when a lazy module throws', () => {
    render(
      <I18nProvider initialLocale="en">
        <RouteChunkErrorBoundary>
          <BrokenModule />
        </RouteChunkErrorBoundary>
      </I18nProvider>,
    );
    expect(screen.getByText(/workspace module could not be loaded/i)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
  });
});
