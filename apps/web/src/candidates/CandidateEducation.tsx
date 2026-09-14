import { useI18n } from '../i18n/index.js';
import { Button, TextField } from '../ui/index.js';
import { candidateRecordLabel, orderEducation } from './candidate-format.js';
import { CANDIDATE_FIELD_LIMITS, useCandidateForm } from './candidate-form.js';
import {
  recordPendingAction,
  type CandidateFormOutcome,
  type CandidateRecordValues,
} from './candidate-state.js';
import type { CandidateEducation as CandidateEducationRecord } from './candidate-types.js';
import { CandidateFormFeedback } from './CandidateFormFeedback.js';
import {
  ArchivedRecordMarker,
  CandidateRecordRow,
  CandidateRecordSection,
} from './CandidateRecordSection.js';
import type { CandidateRecordSectionProps } from './CandidateSkills.js';

/** Education, most recent first where recorded dates can be compared. */
export function CandidateEducation({
  busy,
  canManage,
  canView,
  onAdd,
  onArchive,
  onUpdate,
  pending,
  records,
  submitting,
}: CandidateRecordSectionProps<CandidateEducationRecord>) {
  const { t } = useI18n();

  return (
    <CandidateRecordSection
      addLabel={t('candidate.education.add')}
      busy={busy}
      canAdd={canManage}
      canView={canView}
      count={records.length}
      emptyText={t('candidate.education.empty')}
      renderForm={(close) => (
        <EducationForm
          busy={busy}
          label={t('candidate.education.add')}
          onClose={close}
          onSubmit={(values) => onAdd({ kind: 'education', values })}
          submitLabel={t('candidate.education.add')}
          submitting={submitting}
        />
      )}
      title={t('candidate.education.title')}
    >
      <ol className="candidate-timeline">
        {orderEducation(records).map((education) => {
          const rowPending = pending === recordPendingAction(education.id);
          const label = candidateRecordLabel(education);
          const period = [education.startDate, education.endDate]
            .map((value) => value?.trim())
            .filter(Boolean);
          return (
            <CandidateRecordRow
              archived={education.archivedAt !== null}
              busy={busy}
              canManage={canManage}
              className="candidate-timeline__item"
              key={education.id}
              label={label}
              onArchive={() => onArchive({ kind: 'education', recordId: education.id })}
              pending={rowPending}
              renderEdit={(close) => (
                <EducationForm
                  busy={busy}
                  initial={education}
                  label={t('candidate.records.editLabel', { record: label })}
                  onClose={close}
                  onSubmit={(values) =>
                    onUpdate({ kind: 'education', recordId: education.id, values })
                  }
                  submitLabel={t('candidate.actions.save')}
                  submitting={rowPending}
                />
              )}
            >
              <p className="candidate-timeline__title">
                <strong>{education.qualification}</strong>
                <span className="candidate-timeline__org">{education.institution}</span>
              </p>
              {education.field || period.length > 0 || education.archivedAt ? (
                <p className="candidate-timeline__meta">
                  {education.field ? <span>{education.field}</span> : null}
                  {period.length > 0 ? (
                    <span className="u-tabular">
                      {t('candidate.experience.period', {
                        end: education.endDate?.trim() || '…',
                        start: education.startDate?.trim() || '…',
                      })}
                    </span>
                  ) : null}
                  {education.archivedAt ? <ArchivedRecordMarker /> : null}
                </p>
              ) : null}
              {education.description ? (
                <p className="candidate-timeline__description">{education.description}</p>
              ) : null}
            </CandidateRecordRow>
          );
        })}
      </ol>
    </CandidateRecordSection>
  );
}

/** Adds an education entry, or edits one when `initial` is given; the fields are the same. */
function EducationForm({
  busy,
  initial,
  label,
  onClose,
  onSubmit,
  submitLabel,
  submitting,
}: {
  busy: boolean;
  initial?: CandidateEducationRecord;
  label: string;
  onClose: () => void;
  onSubmit: (values: CandidateRecordValues['education']) => Promise<CandidateFormOutcome>;
  submitLabel: string;
  submitting: boolean;
}) {
  const { t } = useI18n();
  const form = useCandidateForm(
    {
      fields: ['institution', 'qualification', 'field'] as const,
      required: ['institution', 'qualification'],
    },
    onSubmit,
    onClose,
    busy,
  );

  return (
    <form aria-label={label} className="candidate-form" noValidate onSubmit={form.handleSubmit}>
      <div className="candidate-form__fields">
        <TextField
          defaultValue={initial?.institution}
          error={form.errorFor('institution')}
          label={t('candidate.education.institution')}
          maxLength={CANDIDATE_FIELD_LIMITS.institution}
          name="institution"
          required
        />
        <TextField
          defaultValue={initial?.qualification}
          error={form.errorFor('qualification')}
          label={t('candidate.education.qualification')}
          maxLength={CANDIDATE_FIELD_LIMITS.qualification}
          name="qualification"
          required
        />
        <TextField
          defaultValue={initial?.field ?? ''}
          label={t('candidate.education.field')}
          maxLength={CANDIDATE_FIELD_LIMITS.field}
          name="field"
        />
      </div>
      <CandidateFormFeedback failure={form.failure} hasFieldErrors={form.hasFieldErrors} />
      <div className="candidate-form__actions">
        <Button
          disabled={busy}
          loading={submitting}
          loadingLabel={t('common.status.working')}
          size="compact"
          type="submit"
        >
          {submitLabel}
        </Button>
        <Button disabled={submitting} onClick={onClose} size="compact" variant="secondary">
          {t('candidate.actions.cancel')}
        </Button>
      </div>
    </form>
  );
}
