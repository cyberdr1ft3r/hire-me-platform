import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { I18nProvider, type Locale } from '../i18n/index.js';
import { MissionPicker } from './MissionPicker.js';
import { MissionProfile } from './MissionProfile.js';
import { syntheticMission } from './mission-test-data.js';

const MISSION_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

function renderIn(locale: Locale, node: ReactNode) {
  return render(<I18nProvider initialLocale={locale}>{node}</I18nProvider>);
}

describe('Missions polish', () => {
  it('words the picker search label the same way in English and French', () => {
    const loadOptions = vi.fn().mockResolvedValue([]);
    const picker = (
      <MissionPicker
        hint="Search clients by name, then choose one."
        label="Client"
        loadOptions={loadOptions}
        onChange={vi.fn()}
        sourceKey="test"
        value={null}
      />
    );
    const { unmount } = renderIn('en', picker);
    expect(screen.getByLabelText('Search: Client')).toBeTruthy();
    unmount();
    renderIn('fr', picker);
    expect(screen.getByLabelText(/^Rechercher\s:\sClient$/)).toBeTruthy();
  });

  it('keeps each salary bound on one line so a range wraps only between bounds', () => {
    const mission = syntheticMission(MISSION_ID, 'Synthetic Mission', {
      commercial: {
        commercialSummary: null,
        salaryCurrency: 'MAD',
        salaryMaxCents: 3_500_000,
        salaryMinCents: 2_000_000,
      },
    });
    const { container } = renderIn(
      'fr',
      <MissionProfile
        canEdit={false}
        mission={mission}
        model={{
          editValues: null,
          onEditValuesChange: vi.fn(),
          onSave: vi.fn().mockResolvedValue(true),
        }}
        writesLocked={false}
      />,
    );
    const bounds = [...container.querySelectorAll('.mission-summary .u-nowrap')].map(
      (bound) => bound.textContent,
    );
    expect(bounds).toHaveLength(2);
    expect(bounds[0]).toMatch(/20\s000,00\sMAD/);
    expect(bounds[1]).toMatch(/35\s000,00\sMAD/);
  });
});
