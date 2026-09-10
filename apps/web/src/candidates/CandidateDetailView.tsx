import type { CandidateDetail } from '@hire-me/contracts';
import { useEffect, useId, useRef, useState } from 'react';

import { useI18n } from '../i18n/index.js';
import { Button, EmptyState, InlineMessage, Skeleton, StatusBadge } from '../ui/index.js';
import type { CandidateAccess } from './candidate-access.js';
import { formatCandidateLocation } from './candidate-format.js';
import {
  CANDIDATE_LIFECYCLE_TARGETS,
  candidateFailureLabelKey,
  candidateStatusLabelKey,
  candidateStatusTone,
  lifecycleActionLabelKey,
} from './candidate-labels.js';
import type {
  CandidateDetailState,
  CandidateFeedback,
  CandidateFormOutcome,
  CandidateLifecycleTarget,
  CandidatePendingAction,
  CandidateProfileValues,
  CandidateRecordInput,
} from './candidate-state.js';
import { CandidateEducation } from './CandidateEducation.js';
import { CandidateExperience } from './CandidateExperience.js';
import { CandidateLanguages } from './CandidateLanguages.js';
import { CandidateProfile } from './CandidateProfile.js';
import { CandidateProfileForm } from './CandidateProfileForm.js';
import { CandidateSensitiveData } from './CandidateSensitiveData.js';
import { CandidateSkills } from './CandidateSkills.js';

export interface CandidateDetailViewProps {
  access: CandidateAccess;
  detail: CandidateDetailState;
  feedback: CandidateFeedback | null;
  onAddRecord: (input: CandidateRecordInput) => Promise<CandidateFormOutcome>;
  onArchive: () => void;
  onChangeStatus: (status: CandidateLifecycleTarget) => void;
  onRetry: () => void;
  onUpdate: (values: CandidateProfileValues) => Promise<CandidateFormOutcome>;
  pending: CandidatePendingAction | null;
}

/**
 * The selected candidate: loading, failure, nothing selected, or the record.
 */
export function CandidateDetailView(props: CandidateDetailViewProps) {
  const { t } = useI18n();
  const { detail } = props;

  if (detail.status === 'idle') {
    return (
      <EmptyState title={t('candidate.empty.noSelectionTitle')}>
        {t('candidate.empty.noSelection')}
      </EmptyState>
    );
  }
  if (detail.status === 'loading') {
    return (
      <div aria-busy="true" className="candidate-detail__loading">
        <Skeleton label={t('candidate.states.loadingDetail')} />
      </div>
    );
  }
  if (detail.status === 'error') {
    return (
      <InlineMessage announce title={t('candidate.states.detailErrorTitle')} tone="danger">
        <p className="candidate-message__text">{t('candidate.states.detailError')}</p>
        <Button onClick={props.onRetry} size="compact" variant="secondary">
          {t('common.actions.retry')}
        </Button>
      </InlineMessage>
    );
  }
  // Keyed by candidate so edit mode and open forms never carry over to another record.
  return <CandidateRecord {...props} candidate={detail.candidate} key={detail.candidate.id} />;
}

function CandidateRecord({
  access,
  candidate,
  feedback,
  onAddRecord,
  onArchive,
  onChangeStatus,
  onUpdate,
  pending,
}: CandidateDetailViewProps & { candidate: CandidateDetail }) {
  const { formatDateTime, t } = useI18n();
  const nameId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [editing, setEditing] = useState(false);
  const archived = candidate.status === 'ARCHIVED' || candidate.archivedAt !== null;
  const busy = pending !== null;
  const headline = [
    candidate.currentJobTitle?.trim(),
    formatCandidateLocation(candidate.city, candidate.country),
  ].filter(Boolean);

  /*
   * When the list and the record are stacked, a newly selected record can open
   * below the fold. Moving focus to its name then brings it into view for
   * keyboard and screen-reader users; beside the list it is already visible, so
   * focus stays where the user left it.
   */
  useEffect(() => {
    const heading = headingRef.current;
    if (heading && heading.getBoundingClientRect().top > window.innerHeight) {
      heading.focus();
    }
  }, []);

  // Write actions exist only with their own permission, and never on an archived record.
  const canEdit = access.canUpdate && !archived;
  const lifecycleTargets =
    access.canManageStatus && !archived
      ? CANDIDATE_LIFECYCLE_TARGETS.filter((status) => status !== candidate.status)
      : [];
  const canArchive = access.canArchive && !archived;
  const canAddRecords = access.canManageProfile && !archived;
  const showRecords = access.canViewProfile || canAddRecords;

  function closeEditor(): void {
    setEditing(false);
    window.setTimeout(() => headingRef.current?.focus(), 0);
  }

  return (
    <article aria-labelledby={nameId} className="candidate-detail">
      <header className="candidate-detail__identity">
        <div className="candidate-detail__heading">
          <h2 id={nameId} ref={headingRef} tabIndex={-1}>
            {candidate.displayName}
          </h2>
          <p className="candidate-detail__headline">
            {headline.length > 0 ? headline.join(' · ') : t('candidate.profile.noHeadline')}
          </p>
          <div className="candidate-detail__meta">
            <StatusBadge tone={candidateStatusTone(candidate.status)}>
              {t(candidateStatusLabelKey(candidate.status))}
            </StatusBadge>
            <span>
              {t('candidate.profile.updated', { date: formatDateTime(candidate.updatedAt) })}
            </span>
          </div>
        </div>
        {canEdit || lifecycleTargets.length > 0 || canArchive ? (
          <div
            aria-label={t('candidate.actions.region')}
            className="candidate-actions"
            role="group"
          >
            {canEdit && !editing ? (
              <Button disabled={busy} onClick={() => setEditing(true)} variant="secondary">
                {t('candidate.actions.edit')}
              </Button>
            ) : null}
            {lifecycleTargets.map((status) => (
              <Button
                disabled={busy}
                key={status}
                onClick={() => onChangeStatus(status)}
                variant="secondary"
              >
                {t(lifecycleActionLabelKey(status))}
              </Button>
            ))}
            {canArchive ? (
              <Button
                disabled={busy}
                loading={pending === 'archive'}
                loadingLabel={t('common.status.working')}
                onClick={onArchive}
                variant="danger"
              >
                {t('candidate.lifecycle.archive')}
              </Button>
            ) : null}
          </div>
        ) : null}
      </header>

      {feedback ? <CandidateFeedbackMessage feedback={feedback} /> : null}

      {archived ? (
        <InlineMessage title={t('domain.candidateStatus.ARCHIVED')} tone="info">
          {t('candidate.lifecycle.archivedNotice')}
        </InlineMessage>
      ) : null}

      {canEdit && editing ? (
        <CandidateProfileForm
          busy={pending === 'update'}
          candidate={candidate}
          onCancel={closeEditor}
          onSaved={closeEditor}
          onSubmit={onUpdate}
        />
      ) : (
        <CandidateProfile candidate={candidate} />
      )}

      {showRecords ? (
        <>
          <div className="candidate-detail__pair">
            <CandidateSkills
              busy={pending === 'skill'}
              canAdd={canAddRecords}
              canView={access.canViewProfile}
              onAdd={onAddRecord}
              records={candidate.skills}
            />
            <CandidateLanguages
              busy={pending === 'language'}
              canAdd={canAddRecords}
              canView={access.canViewProfile}
              onAdd={onAddRecord}
              records={candidate.languages}
            />
          </div>
          <CandidateExperience
            busy={pending === 'experience'}
            canAdd={canAddRecords}
            canView={access.canViewProfile}
            onAdd={onAddRecord}
            records={candidate.workExperiences}
          />
          <CandidateEducation
            busy={pending === 'education'}
            canAdd={canAddRecords}
            canView={access.canViewProfile}
            onAdd={onAddRecord}
            records={candidate.education}
          />
        </>
      ) : (
        <section className="candidate-section" aria-label={t('candidate.records.unavailableTitle')}>
          <p className="candidate-section__empty">{t('candidate.records.unavailable')}</p>
        </section>
      )}

      <CandidateSensitiveData access={access} candidate={candidate} />
    </article>
  );
}

function CandidateFeedbackMessage({ feedback }: { feedback: CandidateFeedback }) {
  const { t } = useI18n();

  if (feedback.tone === 'danger') {
    return (
      <InlineMessage announce title={t('candidate.feedback.failureTitle')} tone="danger">
        {t(candidateFailureLabelKey(feedback.failure))}
      </InlineMessage>
    );
  }
  return (
    <InlineMessage announce title={t('candidate.feedback.successTitle')} tone="success">
      {feedback.kind === 'statusChanged'
        ? t('candidate.feedback.statusChanged', {
            status: t(candidateStatusLabelKey(feedback.status)),
          })
        : t(`candidate.feedback.${feedback.kind}`)}
    </InlineMessage>
  );
}
