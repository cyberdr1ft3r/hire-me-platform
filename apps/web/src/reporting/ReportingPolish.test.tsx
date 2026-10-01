import { render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import { I18nProvider } from '../i18n/index.js';
import { ReportingPipeline } from './ReportingPipeline.js';
import { ReportingTrends } from './ReportingTrends.js';

function renderInEnglish(node: ReactNode) {
  return render(<I18nProvider initialLocale="en">{node}</I18nProvider>);
}

describe('ReportingPipeline order', () => {
  it('lists states in pipeline stage order, not by count or code, with unknown values last', () => {
    renderInEnglish(
      <ReportingPipeline
        entries={[
          { count: 9, key: 'PRESENTED_TO_CLIENT' },
          { count: 2, key: 'HR_INTERVIEW_COMPLETED' },
          { count: 2, key: 'HR_PRESELECTION' },
          { count: 5, key: 'LEGACY_STATE' },
          { count: 1, key: 'NEW' },
        ]}
      />,
    );

    const labels = within(screen.getByRole('list'))
      .getAllByRole('listitem')
      .map((item) => item.querySelector('.reporting-bars__label')?.textContent);
    expect(labels).toEqual([
      'New',
      'HR preselection',
      'HR interview completed',
      'Presented to client',
      'LEGACY_STATE',
    ]);
  });
});

describe('ReportingTrends zero series', () => {
  const buckets = ['2026-06-01T00:00:00.000Z', '2026-06-08T00:00:00.000Z'];

  it('gives a metric with no activity a one-line note instead of an empty chart', () => {
    const { container } = renderInEnglish(
      <ReportingTrends
        series={[
          {
            metric: 'processesCreated',
            points: buckets.map((bucketStart, index) => ({ bucketStart, count: index + 1 })),
          },
          {
            metric: 'offersCreated',
            points: buckets.map((bucketStart) => ({ bucketStart, count: 0 })),
          },
        ]}
      />,
    );

    const rows = container.querySelectorAll('.reporting-trends__row');
    expect(rows).toHaveLength(2);
    expect(rows[0]?.querySelector('svg')).not.toBeNull();
    expect(rows[1]?.querySelector('svg')).toBeNull();
    expect(rows[1]).toHaveAttribute('data-empty', 'true');
    expect(within(rows[1] as HTMLElement).getByText('No activity in this window')).toBeVisible();
    // The weekly counts stay available as text for every metric, zero included.
    expect(
      screen.getByRole('table', { name: 'Weekly counts for every trend metric' }),
    ).toBeTruthy();
  });
});
