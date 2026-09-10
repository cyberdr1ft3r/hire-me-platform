import type { CandidateDetail } from '@hire-me/contracts';
import { useId, type ReactNode } from 'react';

import { useI18n } from '../i18n/index.js';
import { formatCandidateLocation, safeProfileUrl } from './candidate-format.js';

/**
 * The approved master fields as read-only structured metadata.
 *
 * Every field shown here is one the ordinary candidate response already
 * carries for `candidates:view`; nothing protected is rendered. A value that
 * is not recorded says so rather than leaving an ambiguous blank.
 */
export function CandidateProfile({ candidate }: { candidate: CandidateDetail }) {
  const { formatDateTime, t } = useI18n();
  const contactId = useId();
  const sourceId = useId();
  const notRecorded = t('candidate.profile.notRecorded');
  const linkedin = safeProfileUrl(candidate.linkedinUrl);

  return (
    <>
      <section aria-labelledby={contactId} className="candidate-section">
        <div className="candidate-section__head">
          <h3 id={contactId}>{t('candidate.profile.contactTitle')}</h3>
        </div>
        <dl className="candidate-facts">
          <Fact
            label={t('candidate.fields.email')}
            value={candidate.email}
            fallback={notRecorded}
          />
          <Fact
            label={t('candidate.fields.phone')}
            value={candidate.phone}
            fallback={notRecorded}
          />
          <Fact
            label={t('candidate.fields.currentJobTitle')}
            value={candidate.currentJobTitle}
            fallback={notRecorded}
          />
          <Fact
            label={t('candidate.fields.location')}
            value={formatCandidateLocation(candidate.city, candidate.country)}
            fallback={notRecorded}
          />
          <Fact
            label={t('candidate.fields.linkedinUrl')}
            value={
              linkedin ? (
                <a href={linkedin} rel="noopener noreferrer" target="_blank">
                  {candidate.linkedinUrl}
                </a>
              ) : (
                candidate.linkedinUrl
              )
            }
            fallback={notRecorded}
          />
          <Fact
            label={t('candidate.fields.availabilityNotice')}
            value={candidate.availabilityNotice}
            fallback={notRecorded}
          />
        </dl>
        <div className="candidate-summary">
          <h4>{t('candidate.fields.professionalSummary')}</h4>
          <p className="candidate-summary__text">
            {candidate.professionalSummary?.trim() ? candidate.professionalSummary : notRecorded}
          </p>
        </div>
      </section>

      <section aria-labelledby={sourceId} className="candidate-section">
        <div className="candidate-section__head">
          <h3 id={sourceId}>{t('candidate.profile.sourceTitle')}</h3>
        </div>
        <dl className="candidate-facts">
          <Fact
            label={t('candidate.fields.source')}
            value={candidate.source}
            fallback={notRecorded}
          />
          <Fact
            label={t('candidate.fields.sourceDetail')}
            value={candidate.sourceDetail}
            fallback={notRecorded}
          />
          <Fact
            label={t('candidate.profile.createdLabel')}
            value={formatDateTime(candidate.createdAt)}
            fallback={notRecorded}
          />
          <Fact
            label={t('candidate.profile.updatedLabel')}
            value={formatDateTime(candidate.updatedAt)}
            fallback={notRecorded}
          />
          {candidate.archivedAt ? (
            <Fact
              label={t('candidate.profile.archivedLabel')}
              value={formatDateTime(candidate.archivedAt)}
              fallback={notRecorded}
            />
          ) : null}
        </dl>
      </section>
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
