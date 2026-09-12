import type { CandidateDetail } from '@hire-me/contracts';
import { useId } from 'react';

import { useI18n } from '../i18n/index.js';
import type { CandidateAccess } from './candidate-access.js';
import { formatSalaryExpectation } from './candidate-format.js';
import { consentStatusLabelKey } from './candidate-labels.js';

/**
 * Compensation and consent: the two candidate areas behind dedicated
 * permissions.
 *
 * Each block is rendered only when the actor holds its own view permission
 * *and* the API actually returned that data. Without the permission nothing is
 * rendered at all — no heading, no placeholder, no "hidden" label — so an
 * ordinary candidate viewer cannot even learn the area exists. The gate is in
 * this component's render logic, never in CSS.
 *
 * Both blocks are read-only. The workspace has never offered compensation or
 * consent editing, and the profile form cannot send those fields, so holding
 * `candidate_compensation:update` or `candidate_consent:manage` changes
 * nothing here.
 */
export function CandidateSensitiveData({
  access,
  candidate,
}: {
  access: Pick<CandidateAccess, 'canViewCompensation' | 'canViewConsent'>;
  candidate: CandidateDetail;
}) {
  const { formatCurrency, formatDateTime, formatNumber, t } = useI18n();
  const headingId = useId();
  const compensation = access.canViewCompensation ? candidate.compensation : null;
  const consent = access.canViewConsent ? candidate.consent : null;

  if (!compensation && !consent) {
    return null;
  }

  const salary = compensation
    ? formatSalaryExpectation(compensation, { formatCurrency, formatNumber })
    : null;

  return (
    <section aria-labelledby={headingId} className="candidate-section candidate-sensitive">
      <div className="candidate-section__head">
        <h3 id={headingId}>{t('candidate.sensitive.title')}</h3>
        <span className="candidate-sensitive__label">{t('candidate.sensitive.label')}</span>
      </div>
      <p className="candidate-section__description">{t('candidate.sensitive.description')}</p>
      <div className="candidate-sensitive__groups">
        {compensation ? (
          <div className="candidate-sensitive__group">
            <h4>{t('candidate.compensation.title')}</h4>
            <dl className="candidate-facts">
              <div>
                <dt>{t('candidate.compensation.salaryExpectation')}</dt>
                <dd className="u-tabular">{salary ?? t('candidate.compensation.notRecorded')}</dd>
              </div>
            </dl>
          </div>
        ) : null}
        {consent ? (
          <div className="candidate-sensitive__group">
            <h4>{t('candidate.consent.title')}</h4>
            <dl className="candidate-facts">
              <div>
                <dt>{t('candidate.consent.status')}</dt>
                <dd>{t(consentStatusLabelKey(consent.consentStatus))}</dd>
              </div>
              <div>
                <dt>{t('candidate.consent.recordedAt')}</dt>
                <dd>
                  {consent.consentRecordedAt
                    ? formatDateTime(consent.consentRecordedAt)
                    : t('candidate.consent.notRecorded')}
                </dd>
              </div>
            </dl>
          </div>
        ) : null}
      </div>
    </section>
  );
}
