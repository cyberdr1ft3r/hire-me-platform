import { useI18n } from '../i18n/index.js';
import { Button, Checkbox, TextField } from '../ui/index.js';
import { candidateRecordLabel, orderWorkExperiences } from './candidate-format.js';
import { CANDIDATE_FIELD_LIMITS, useCandidateForm } from './candidate-form.js';
import {
  recordPendingAction,
  type CandidateFormOutcome,
  type CandidateRecordValues,
} from './candidate-state.js';
import type { CandidateWorkExperience } from './candidate-types.js';
import { CandidateFormFeedback } from './CandidateFormFeedback.js';
import {
  ArchivedRecordMarker,
  CandidateRecordRow,
  CandidateRecordSection,
} from './CandidateRecordSection.js';
import type { CandidateRecordSectionProps } from './CandidateSkills.js';

/**
 * Work experience in chronological reading order: current roles first, then
 * the most recent start. Dates are shown exactly as they were recorded.
 */
export function CandidateExperience({
  busy,
  canManage,
  canView,
  onAdd,
  onArchive,
  onUpdate,
  pending,
  records,
  submitting,
}: CandidateRecordSectionProps<CandidateWorkExperience>) {
  const { t } = useI18n();

  return (
    <CandidateRecordSection
      addLabel={t('candidate.experience.add')}
      busy={busy}
      canAdd={canManage}
      canView={canView}
      count={records.length}
      emptyText={t('candidate.experience.empty')}
      renderForm={(close) => (
        <ExperienceForm
          busy={busy}
          label={t('candidate.experience.add')}
          onClose={close}
          onSubmit={(values) => onAdd({ kind: 'experience', values })}
          submitLabel={t('candidate.experience.add')}
          submitting={submitting}
        />
      )}
      title={t('candidate.experience.title')}
    >
      <ol className="candidate-timeline">
        {orderWorkExperiences(records).map((experience) => {
          const rowPending = pending === recordPendingAction(experience.id);
          const label = candidateRecordLabel(experience);
          return (
            <CandidateRecordRow
              archived={experience.archivedAt !== null}
              busy={busy}
              canManage={canManage}
              className="candidate-timeline__item"
              key={experience.id}
              label={label}
              onArchive={() => onArchive({ kind: 'experience', recordId: experience.id })}
              pending={rowPending}
              renderEdit={(close) => (
                <ExperienceForm
                  busy={busy}
                  initial={experience}
                  label={t('candidate.records.editLabel', { record: label })}
                  onClose={close}
                  onSubmit={(values) =>
                    onUpdate({ kind: 'experience', recordId: experience.id, values })
                  }
                  submitLabel={t('candidate.actions.save')}
                  submitting={rowPending}
                />
              )}
            >
              <p className="candidate-timeline__title">
                <strong>{experience.title}</strong>
                <span className="candidate-timeline__org">{experience.employer}</span>
              </p>
              <p className="candidate-timeline__meta">
                <span className="u-tabular">{experiencePeriod(experience, t)}</span>
                {experience.isCurrent ? (
                  <span className="candidate-timeline__current">
                    {t('candidate.experience.current')}
                  </span>
                ) : null}
                {experience.archivedAt ? <ArchivedRecordMarker /> : null}
              </p>
              {experience.description ? (
                <p className="candidate-timeline__description">{experience.description}</p>
              ) : null}
            </CandidateRecordRow>
          );
        })}
      </ol>
    </CandidateRecordSection>
  );
}

function experiencePeriod(
  experience: CandidateWorkExperience,
  t: ReturnType<typeof useI18n>['t'],
): string {
  const start = experience.startDate?.trim();
  const end = experience.isCurrent ? t('candidate.experience.present') : experience.endDate?.trim();
  if (!start && !end) {
    return t('candidate.experience.undated');
  }
  return t('candidate.experience.period', { end: end || '…', start: start || '…' });
}

/** Adds an experience, or edits one when `initial` is given; the fields are the same. */
function ExperienceForm({
  busy,
  initial,
  label,
  onClose,
  onSubmit,
  submitLabel,
  submitting,
}: {
  busy: boolean;
  initial?: CandidateWorkExperience;
  label: string;
  onClose: () => void;
  onSubmit: (values: CandidateRecordValues['experience']) => Promise<CandidateFormOutcome>;
  submitLabel: string;
  submitting: boolean;
}) {
  const { t } = useI18n();
  const form = useCandidateForm(
    {
      fields: ['employer', 'title', 'startDate', 'endDate', 'isCurrent'] as const,
      required: ['employer', 'title'],
    },
    ({ isCurrent, ...values }) => onSubmit({ ...values, isCurrent: isCurrent === 'on' }),
    onClose,
    busy,
  );

  return (
    <form aria-label={label} className="candidate-form" noValidate onSubmit={form.handleSubmit}>
      <div className="candidate-form__fields">
        <TextField
          defaultValue={initial?.employer}
          error={form.errorFor('employer')}
          label={t('candidate.experience.employer')}
          maxLength={CANDIDATE_FIELD_LIMITS.employer}
          name="employer"
          required
        />
        <TextField
          defaultValue={initial?.title}
          error={form.errorFor('title')}
          label={t('candidate.experience.jobTitle')}
          maxLength={CANDIDATE_FIELD_LIMITS.title}
          name="title"
          required
        />
        <TextField
          defaultValue={initial?.startDate ?? ''}
          hint={t('candidate.experience.dateHint')}
          label={t('candidate.experience.startDate')}
          maxLength={CANDIDATE_FIELD_LIMITS.startDate}
          name="startDate"
        />
        <TextField
          defaultValue={initial?.endDate ?? ''}
          hint={t('candidate.experience.dateHint')}
          label={t('candidate.experience.endDate')}
          maxLength={CANDIDATE_FIELD_LIMITS.endDate}
          name="endDate"
        />
      </div>
      <Checkbox
        defaultChecked={initial?.isCurrent ?? false}
        label={t('candidate.experience.isCurrent')}
        name="isCurrent"
      />
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
