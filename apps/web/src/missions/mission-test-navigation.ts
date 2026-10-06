import { fireEvent, screen } from '@testing-library/react';

export async function showMissionDetailTab(
  tab: 'overview' | 'team' | 'pipeline' | 'public',
  locale: 'en' | 'fr' = 'en',
): Promise<void> {
  const labels: Record<typeof tab, Record<'en' | 'fr', string>> = {
    overview: { en: 'Overview', fr: 'Vue d’ensemble' },
    team: { en: 'Team', fr: 'Équipe' },
    pipeline: { en: 'Pipeline', fr: 'Vivier' },
    public: { en: 'Public', fr: 'Public' },
  };
  fireEvent.click(await screen.findByRole('tab', { name: labels[tab][locale] }));
}
