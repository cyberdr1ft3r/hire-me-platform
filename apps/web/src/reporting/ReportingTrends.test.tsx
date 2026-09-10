import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { I18nProvider } from '../i18n/index.js';
import { LanguageSelect } from '../ui/shell/LanguageSelect.js';
import { ReportingTrends } from './ReportingTrends.js';

const SERIES = [
  {
    metric: 'processesCreated' as const,
    points: [
      { bucketStart: '2026-06-01T00:00:00.000Z', count: 4 },
      { bucketStart: '2026-06-08T00:00:00.000Z', count: 7 },
      { bucketStart: '2026-06-15T00:00:00.000Z', count: 3 },
      { bucketStart: '2026-06-22T00:00:00.000Z', count: 5 },
    ],
  },
  {
    metric: 'placementsConfirmed' as const,
    points: [
      { bucketStart: '2026-06-01T00:00:00.000Z', count: 1 },
      { bucketStart: '2026-06-08T00:00:00.000Z', count: 0 },
      { bucketStart: '2026-06-15T00:00:00.000Z', count: 2 },
      { bucketStart: '2026-06-22T00:00:00.000Z', count: 1 },
    ],
  },
];

describe('ReportingTrends visible axis', () => {
  it('renders one shared visible axis aligned to weekly buckets', () => {
    render(
      <I18nProvider initialLocale="en">
        <ReportingTrends series={SERIES} />
      </I18nProvider>,
    );

    const axis = document.querySelector('.reporting-trends__axis');
    expect(axis).not.toBeNull();
    expect(axis?.querySelectorAll('.reporting-trends__axis-tick')).toHaveLength(4);
    expect(axis?.textContent).toContain('1 Jun');
    expect(axis?.textContent).toContain('22 Jun');
  });

  it('pairs every selected tick with a full and a compact label for the same bucket', () => {
    render(
      <I18nProvider initialLocale="fr">
        <ReportingTrends series={SERIES} />
      </I18nProvider>,
    );

    const labelsOf = (length: 'compact' | 'full') =>
      Array.from(
        document.querySelectorAll(`.reporting-trends__axis-label[data-length="${length}"]`),
        (label) => label.textContent?.replace(/\s/gu, ' '),
      );

    expect(labelsOf('full')).toEqual([
      '1 juin 2026',
      '8 juin 2026',
      '15 juin 2026',
      '22 juin 2026',
    ]);
    expect(labelsOf('compact')).toEqual(['1 juin', '8 juin', '15 juin', '22 juin']);
  });

  it('does not render a visible axis when weekly trends are empty', () => {
    render(
      <I18nProvider initialLocale="en">
        <ReportingTrends
          series={[
            {
              metric: 'processesCreated',
              points: [{ bucketStart: '2026-06-01T00:00:00.000Z', count: 0 }],
            },
          ]}
        />
      </I18nProvider>,
    );

    expect(screen.getByText('No recruitment activity was recorded in this window.')).toBeVisible();
    expect(document.querySelector('.reporting-trends__axis')).toBeNull();
  });

  it('rerenders visible axis date labels when the locale changes', () => {
    render(
      <I18nProvider initialLocale="en">
        <LanguageSelect />
        <ReportingTrends series={SERIES} />
      </I18nProvider>,
    );

    const axis = document.querySelector('.reporting-trends__axis');
    expect(axis?.textContent).toMatch(/1 Jun/);

    fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'fr' } });

    expect(axis?.textContent).toMatch(/1 juin/);
    expect(axis?.textContent).toMatch(/22 juin/);
  });
});
