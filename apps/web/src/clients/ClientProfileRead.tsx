import type { ClientSummary } from '@hire-me/contracts';
import { useId, type ReactNode } from 'react';

import { useI18n } from '../i18n/index.js';

function formatClientLocation(city: string | null, country: string | null): string {
  return [city?.trim(), country?.trim()].filter(Boolean).join(', ');
}

function safeWebsiteUrl(website: string | null): string | null {
  if (!website?.trim()) return null;
  const trimmed = website.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/**
 * Approved client master fields as read-only structured metadata (Issue #204).
 * Commercial summary appears only when the actor may view commercial data.
 */
export function ClientProfileRead({
  client,
  includeCommercial,
}: {
  client: ClientSummary;
  includeCommercial: boolean;
}) {
  const { t } = useI18n();
  const companyId = useId();
  const commercialId = useId();
  const notRecorded = t('clients.notRecorded');
  const website = safeWebsiteUrl(client.website);

  return (
    <>
      <section aria-labelledby={companyId} className="client-section">
        <div className="client-section__head">
          <h3 id={companyId}>{t('clients.profile.companyTitle')}</h3>
        </div>
        <dl className="client-facts">
          <Fact
            label={t('clients.fields.industry')}
            value={client.industry}
            fallback={notRecorded}
          />
          <Fact
            label={t('clients.fields.website')}
            value={
              website ? (
                <a href={website} rel="noopener noreferrer" target="_blank">
                  {client.website}
                </a>
              ) : (
                client.website
              )
            }
            fallback={notRecorded}
          />
          <Fact
            label={t('clients.fields.mainPhone')}
            value={client.mainPhone}
            fallback={notRecorded}
          />
          <Fact
            label={t('clients.fields.location')}
            value={formatClientLocation(client.city, client.country)}
            fallback={notRecorded}
          />
        </dl>
      </section>
      {includeCommercial ? (
        <section aria-labelledby={commercialId} className="client-section">
          <div className="client-section__head">
            <h3 id={commercialId}>{t('clients.profile.commercialTitle')}</h3>
          </div>
          <div className="client-summary">
            <h4>{t('clients.fields.commercialSummary')}</h4>
            <p className="client-summary__text">
              {client.commercial?.commercialSummary?.trim()
                ? client.commercial.commercialSummary
                : notRecorded}
            </p>
          </div>
        </section>
      ) : null}
    </>
  );
}

function Fact({ fallback, label, value }: { fallback: string; label: string; value: ReactNode }) {
  const recorded = typeof value === 'string' ? value.trim().length > 0 : Boolean(value);
  return (
    <div>
      <dt>{label}</dt>
      <dd data-recorded={recorded ? undefined : 'false'}>{recorded ? value : fallback}</dd>
    </div>
  );
}
