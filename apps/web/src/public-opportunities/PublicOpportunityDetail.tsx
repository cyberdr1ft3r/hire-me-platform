import { useEffect, useId, useRef, type ReactNode } from 'react';
import type { PublicOpportunity } from '@hire-me/contracts';

import { useI18n } from '../i18n/index.js';
import { Button } from '../ui/index.js';
import type { ApplicationSnapshot } from './public-application.js';
import { PublicApplicationForm } from './PublicApplicationForm.js';
import {
  formatDeadline,
  formatPublishedSalary,
  publishedText,
} from './public-opportunity-format.js';
import type { PublicDetailState, PublicSubmissionState } from './public-opportunity-state.js';

/**
 * One public opportunity: reading first, then the application.
 *
 * Every rendered value comes from the public contract. The page renders no
 * identifier other than the slug already in its own URL, and nothing is
 * serialized into attributes.
 */
export function PublicOpportunityDetail({
  detail,
  onRetry,
  onSubmit,
  submission,
}: {
  detail: PublicDetailState;
  onRetry: () => void;
  onSubmit: (snapshot: ApplicationSnapshot) => void;
  submission: PublicSubmissionState;
}) {
  switch (detail.status) {
    case 'loading':
      return <DetailLoading />;
    case 'notFound':
      return <DetailNotFound />;
    case 'error':
      return <DetailError onRetry={onRetry} />;
    default:
      return (
        <OpportunityContent
          onSubmit={onSubmit}
          opportunity={detail.opportunity}
          submission={submission}
        />
      );
  }
}

function BackLink() {
  const { t } = useI18n();
  return (
    <a className="public-back" href="/opportunities">
      <span aria-hidden="true">←</span> {t('publicOpportunity.detail.back')}
    </a>
  );
}

function DetailLoading() {
  const { t } = useI18n();
  return (
    <div className="public-page">
      <BackLink />
      <h1 className="sr-only">{t('publicOpportunity.detail.loadingTitle')}</h1>
      <div aria-busy="true" className="public-detail-loading" role="status">
        <span className="sr-only">{t('publicOpportunity.states.loadingDetail')}</span>
        <span aria-hidden="true" className="ui-skeleton public-detail-loading__title" />
        <span aria-hidden="true" className="ui-skeleton ui-skeleton--short" />
        <span aria-hidden="true" className="ui-skeleton" />
        <span aria-hidden="true" className="ui-skeleton" />
      </div>
    </div>
  );
}

/**
 * The same words for every 404, because the server gives the same 404 for every
 * reason an opportunity is not public. No slug, status, or reason is echoed.
 */
function DetailNotFound() {
  const { t } = useI18n();
  return (
    <div className="public-page">
      <div className="public-state public-state--page">
        <h1>{t('publicOpportunity.states.notFoundTitle')}</h1>
        <p>{t('publicOpportunity.states.notFound')}</p>
        <a className="public-link-button" href="/opportunities">
          {t('publicOpportunity.feedback.browseRoles')}
        </a>
      </div>
    </div>
  );
}

function DetailError({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <div className="public-page">
      <BackLink />
      <div className="public-state public-state--page">
        <h1>{t('publicOpportunity.states.detailErrorTitle')}</h1>
        <p role="alert">{t('publicOpportunity.states.detailError')}</p>
        <div>
          <Button onClick={onRetry} variant="secondary">
            {t('common.actions.retry')}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Fact({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="public-facts__row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function OpportunityContent({
  onSubmit,
  opportunity,
  submission,
}: {
  onSubmit: (snapshot: ApplicationSnapshot) => void;
  opportunity: PublicOpportunity;
  submission: PublicSubmissionState;
}) {
  const { formatCurrency, formatDateTime, formatNumber, t } = useI18n();
  const titleId = useId();
  const factsId = useId();
  const aboutId = useId();
  const skillsId = useId();
  const applyId = useId();

  const summary = publishedText(opportunity.publicSummary);
  const description = publishedText(opportunity.publicDescription);
  const skills = publishedText(opportunity.publicSkills);
  const location = publishedText(opportunity.publicLocation);
  const workArrangement = publishedText(opportunity.publicWorkArrangement);
  const engagementType = publishedText(opportunity.publicEngagementType);
  const experienceLevel = publishedText(opportunity.publicExperienceLevel);
  const clientName = publishedText(opportunity.clientName);
  const salary = formatPublishedSalary(opportunity.salary, { formatCurrency, formatNumber }, t);
  const deadline = opportunity.applicationDeadline
    ? formatDeadline(opportunity.applicationDeadline, formatDateTime, t)
    : null;

  return (
    <article aria-labelledby={titleId} className="public-page public-opportunity">
      <BackLink />
      <div className="public-opportunity__header">
        <h1 id={titleId}>{opportunity.publicTitle}</h1>
        {summary ? <p className="public-intro__lead">{summary}</p> : null}
      </div>

      <div className="public-opportunity__layout">
        <aside aria-labelledby={factsId} className="public-facts">
          <h2 className="public-facts__title" id={factsId}>
            {t('publicOpportunity.detail.keyDetails')}
          </h2>
          <dl className="public-facts__list">
            {/* A hidden client name has always read as confidential, never as blank. */}
            <Fact label={t('publicOpportunity.fields.company')}>
              {clientName ?? t('publicOpportunity.values.confidentialCompany')}
            </Fact>
            {location ? (
              <Fact label={t('publicOpportunity.fields.location')}>{location}</Fact>
            ) : null}
            {workArrangement ? (
              <Fact label={t('publicOpportunity.fields.workArrangement')}>{workArrangement}</Fact>
            ) : null}
            {engagementType ? (
              <Fact label={t('publicOpportunity.fields.engagementType')}>{engagementType}</Fact>
            ) : null}
            {experienceLevel ? (
              <Fact label={t('publicOpportunity.fields.experienceLevel')}>{experienceLevel}</Fact>
            ) : null}
            {salary ? (
              <Fact label={t('publicOpportunity.fields.salary')}>
                <span className="u-tabular">{salary}</span>
              </Fact>
            ) : null}
            {deadline ? (
              <Fact label={t('publicOpportunity.fields.deadline')}>
                <span className="u-tabular">{deadline}</span>
              </Fact>
            ) : null}
          </dl>
          {submission.status === 'received' ? null : (
            <a className="public-link-button public-link-button--primary" href="#apply">
              {t('publicOpportunity.detail.apply')}
            </a>
          )}
        </aside>

        <div className="public-opportunity__content">
          {description ? (
            <section aria-labelledby={aboutId} className="public-section">
              <h2 id={aboutId}>{t('publicOpportunity.detail.about')}</h2>
              <p className="public-prose">{description}</p>
            </section>
          ) : null}
          {skills ? (
            <section aria-labelledby={skillsId} className="public-section">
              <h2 id={skillsId}>{t('publicOpportunity.detail.skills')}</h2>
              <p className="public-prose">{skills}</p>
            </section>
          ) : null}
          <section aria-labelledby={applyId} className="public-apply" id="apply">
            <h2 className="public-apply__title" id={applyId} tabIndex={-1}>
              {t('publicOpportunity.application.title')}
            </h2>
            {submission.status === 'received' ? (
              <ApplicationReceived />
            ) : (
              <PublicApplicationForm
                labelledBy={applyId}
                onSubmit={onSubmit}
                opportunity={opportunity}
                submission={submission}
              />
            )}
          </section>
        </div>
      </div>
    </article>
  );
}

/**
 * Shown only after the server answered `RECEIVED`. It says what the server's
 * answer guarantees and nothing more: no response time, contact, or ranking.
 * Focus moves to its heading so keyboard and screen-reader users land on it.
 */
function ApplicationReceived() {
  const { t } = useI18n();
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <div className="public-received" role="status">
      <span aria-hidden="true" className="public-received__mark">
        ✓
      </span>
      <div className="public-received__body">
        <h3 ref={headingRef} tabIndex={-1}>
          {t('publicOpportunity.feedback.receivedTitle')}
        </h3>
        <p>{t('publicOpportunity.feedback.receivedBody')}</p>
        <a href="/opportunities">{t('publicOpportunity.feedback.browseRoles')}</a>
      </div>
    </div>
  );
}
