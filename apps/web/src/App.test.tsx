import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from './App.js';

describe('App', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows API health returned through the configured API client', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'ok',
          service: 'hire-me-api',
          timestamp: '2026-07-21T10:00:00.000Z',
          uptimeSeconds: 1,
        }),
        { headers: { 'Content-Type': 'application/json' } },
      ),
    );

    render(<App />);

    expect(
      screen.getByRole('heading', { name: /recruitment operations workspace/i }),
    ).toBeVisible();
    expect(await screen.findByText('hire-me-api is ok')).toBeVisible();
  });
});
