import { useState } from 'react';
import type { AuthenticatedUser } from '@hire-me/contracts';

import { I18nProvider, useI18n } from '../i18n/index.js';
import type { InternalRoute } from '../navigation/internal-navigation.js';
import { Button, PageHeader, StatusBadge } from '../ui/index.js';
import { AppShell } from '../ui/shell/AppShell.js';

const syntheticUser: AuthenticatedUser = {
  id: '00000000-0000-4000-8000-000000000052',
  displayName: 'Amina Example',
  email: 'amina@example.test',
  permissions: [
    'users:view',
    'clients:view',
    'candidates:view',
    'missions:view',
    'tasks:view',
    'documents:view',
    'training_programs:view',
    'reporting:recruitment:view',
    'quotations:view',
    'payments:view',
  ],
};

/** A language-neutral value exactly as the API and database store it. */
const syntheticRecordState = 'ACTIVE';

/** Fixed so the preview renders the same formatted values on every machine. */
const syntheticDate = new Date('2026-03-09T21:45:00.000Z');

/**
 * Synthetic, API-free review surface.
 *
 * It hosts the real `I18nProvider` inside the real `AppShell`, so switching
 * language in the shell's own control is what proves the English and French
 * shells. There is no second, translated copy of the shell anywhere.
 */
export function AppShellPreview() {
  return (
    <I18nProvider>
      <AppShellPreviewContent />
    </I18nProvider>
  );
}

function AppShellPreviewContent() {
  const [route, setRoute] = useState<InternalRoute>('home');
  const { formatCurrency, formatDateTime, formatNumber, t } = useI18n();

  return (
    <AppShell
      apiState={{ status: 'ready', message: 'hire-me-api is ok' }}
      currentRoute={route}
      onLogout={() => undefined}
      onNavigate={setRoute}
      onRefreshUser={() => undefined}
      user={syntheticUser}
    >
      <PageHeader
        description={t('preview.description')}
        eyebrow={t('preview.eyebrow')}
        metadata={
          <>
            <span>{t('preview.route', { route })}</span>
            <span>
              {t('preview.formatting', {
                values: [
                  formatNumber(1234.5),
                  formatDateTime(syntheticDate, { timeZone: 'UTC' }),
                  formatCurrency(1250, 'MAD'),
                  formatCurrency(499, 'EUR'),
                ].join(' · '),
              })}
            </span>
            <span>{t('common.counts.candidates', { count: 12 })}</span>
          </>
        }
        primaryAction={<Button>{t('preview.createItem')}</Button>}
        secondaryActions={<Button variant="secondary">{t('preview.secondaryAction')}</Button>}
        title={t('preview.title')}
      />
      <section aria-labelledby="preview-workspace-title" className="app-shell-preview__workspace">
        <div>
          <p className="app-shell-preview__kicker">{t('preview.kicker')}</p>
          <h2 id="preview-workspace-title">{t('preview.workspaceTitle')}</h2>
          <p>{t('preview.paragraph')}</p>
        </div>
        <div aria-label={t('preview.dataRegion')} className="app-shell-preview__data">
          <div>
            <strong>{t('preview.reference')}</strong>
            <span>{t('preview.status')}</span>
            <span>{t('preview.owner')}</span>
          </div>
          <div>
            <strong>HM-SYNTHETIC</strong>
            <span>
              {/*
                The stored value stays `ACTIVE`. Only its label is translated, at
                the UI boundary, and the label is never sent back to the API.
              */}
              <StatusBadge tone="success">
                {t(`domain.recordState.${syntheticRecordState}`)}
              </StatusBadge>
            </span>
            <span>{t('preview.ownerValue')}</span>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
