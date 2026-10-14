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

/**
 * Opens a mission's focused record the way a user does in Missions v2.0: back to the
 * directory if a record is open, preview the row, then Open full record.
 */
export async function openMissionRecord(name: string | RegExp): Promise<void> {
  const back = screen.queryByRole('button', { name: /Back to missions|Retour aux missions/ });
  if (back) fireEvent.click(back);
  const pattern = typeof name === 'string' ? new RegExp(`^${name}`) : name;
  fireEvent.click(await screen.findByRole('button', { name: pattern }));
  fireEvent.click(
    await screen.findByRole('button', { name: /^(Open full record|Ouvrir la fiche complète)$/ }),
  );
}
