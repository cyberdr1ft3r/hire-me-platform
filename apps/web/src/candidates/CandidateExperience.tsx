import { useI18n } from '../i18n/index.js';
import { Button, Checkbox, TextField } from '../ui/index.js';
import { orderWorkExperiences } from './candidate-format.js';
import { CANDIDATE_FIELD_LIMITS, useCandidateForm } from './candidate-form.js';
import type { CandidateWorkExperience } from './candidate-types.js';
import { CandidateFormFeedback } from './CandidateFormFeedback.js';
import { ArchivedRecordMarker, CandidateRecordSection } from './CandidateRecordSection.js';
import type { CandidateRecordSectionProps } from './CandidateSkills.js';

/**
 * Work experience in chronological reading order: current roles first, then
 * the most recent start. Dates are shown exactly as they were recorded.
 */
export function CandidateExperience({
  busy,
  canAdd,
  canView,
  onAdd,
  records,
}: CandidateRecordSectionProps<CandidateWorkExperience>) {
  const { t } = useI18n();

  return (
    <CandidateRecordSection
      addLabel={t('candidate.experience.add')}
      canAdd={canAdd}
      canView={canView}
      count={records.length}
      emptyText={t('candidate.experience.empty')}
      renderForm={(close) => <ExperienceForm busy={busy} onAdd={onAdd} onClose={close} />}
      title={t('candidate.experience.title')}
    >
      <ol className="candidate-timeline">
        {orderWorkExperiences(records).map((experience) => (
          <li className="candidate-timeline__item" key={experience.id}>
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
          </li>
        ))}
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

function ExperienceForm({
  busy,
  onAdd,
  onClose,
}: {
  busy: boolean;
  onAdd: CandidateRecordSectionProps<CandidateWorkExperience>['onAdd'];
  onClose: () => void;
}) {
  const { t } = useI18n();
  const form = useCandidateForm(
    {
      fields: ['employer', 'title', 'startDate', 'endDate', 'isCurrent'] as const,
      required: ['employer', 'title'],
    },
    ({ isCurrent, ...values }) =>
      onAdd({ kind: 'experience', values: { ...values, isCurrent: isCurrent === 'on' } }),
    onClose,
  );

  return (
    <form
      aria-label={t('candidate.experience.add')}
      className="candidate-form"
      noValidate
      onSubmit={form.handleSubmit}
    >
      <div className="candidate-form__fields">
        <TextField
          error={form.errorFor('employer')}
          label={t('candidate.experience.employer')}
          maxLength={CANDIDATE_FIELD_LIMITS.employer}
          name="employer"
          required
        />
        <TextField
          error={form.errorFor('title')}
          label={t('candidate.experience.jobTitle')}
          maxLength={CANDIDATE_FIELD_LIMITS.title}
          name="title"
          required
        />
        <TextField
          hint={t('candidate.experience.dateHint')}
          label={t('candidate.experience.startDate')}
          maxLength={CANDIDATE_FIELD_LIMITS.startDate}
          name="startDate"
        />
        <TextField
          hint={t('candidate.experience.dateHint')}
          label={t('candidate.experience.endDate')}
          maxLength={CANDIDATE_FIELD_LIMITS.endDate}
          name="endDate"
        />
      </div>
      <Checkbox label={t('candidate.experience.isCurrent')} name="isCurrent" />
      <CandidateFormFeedback failure={form.failure} hasFieldErrors={form.hasFieldErrors} />
      <div className="candidate-form__actions">
        <Button
          loading={busy}
          loadingLabel={t('common.status.working')}
          size="compact"
          type="submit"
        >
          {t('candidate.experience.add')}
        </Button>
        <Button disabled={busy} onClick={onClose} size="compact" variant="secondary">
          {t('candidate.actions.cancel')}
        </Button>
      </div>
    </form>
  );
}
