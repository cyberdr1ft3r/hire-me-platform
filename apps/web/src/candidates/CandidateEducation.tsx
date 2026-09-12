import { useI18n } from '../i18n/index.js';
import { Button, TextField } from '../ui/index.js';
import { orderEducation } from './candidate-format.js';
import { CANDIDATE_FIELD_LIMITS, useCandidateForm } from './candidate-form.js';
import type { CandidateEducation as CandidateEducationRecord } from './candidate-types.js';
import { CandidateFormFeedback } from './CandidateFormFeedback.js';
import { ArchivedRecordMarker, CandidateRecordSection } from './CandidateRecordSection.js';
import type { CandidateRecordSectionProps } from './CandidateSkills.js';

/** Education, most recent first where recorded dates can be compared. */
export function CandidateEducation({
  busy,
  canAdd,
  canView,
  onAdd,
  records,
  submitting,
}: CandidateRecordSectionProps<CandidateEducationRecord>) {
  const { t } = useI18n();

  return (
    <CandidateRecordSection
      addLabel={t('candidate.education.add')}
      busy={busy}
      canAdd={canAdd}
      canView={canView}
      count={records.length}
      emptyText={t('candidate.education.empty')}
      renderForm={(close) => (
        <EducationForm busy={busy} onAdd={onAdd} onClose={close} submitting={submitting} />
      )}
      title={t('candidate.education.title')}
    >
      <ol className="candidate-timeline">
        {orderEducation(records).map((education) => {
          const period = [education.startDate, education.endDate]
            .map((value) => value?.trim())
            .filter(Boolean);
          return (
            <li className="candidate-timeline__item" key={education.id}>
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
            </li>
          );
        })}
      </ol>
    </CandidateRecordSection>
  );
}

function EducationForm({
  busy,
  onAdd,
  onClose,
  submitting,
}: {
  busy: boolean;
  onAdd: CandidateRecordSectionProps<CandidateEducationRecord>['onAdd'];
  onClose: () => void;
  submitting: boolean;
}) {
  const { t } = useI18n();
  const form = useCandidateForm(
    {
      fields: ['institution', 'qualification', 'field'] as const,
      required: ['institution', 'qualification'],
    },
    (values) => onAdd({ kind: 'education', values }),
    onClose,
    busy,
  );

  return (
    <form
      aria-label={t('candidate.education.add')}
      className="candidate-form"
      noValidate
      onSubmit={form.handleSubmit}
    >
      <div className="candidate-form__fields">
        <TextField
          error={form.errorFor('institution')}
          label={t('candidate.education.institution')}
          maxLength={CANDIDATE_FIELD_LIMITS.institution}
          name="institution"
          required
        />
        <TextField
          error={form.errorFor('qualification')}
          label={t('candidate.education.qualification')}
          maxLength={CANDIDATE_FIELD_LIMITS.qualification}
          name="qualification"
          required
        />
        <TextField
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
          {t('candidate.education.add')}
        </Button>
        <Button disabled={submitting} onClick={onClose} size="compact" variant="secondary">
          {t('candidate.actions.cancel')}
        </Button>
      </div>
    </form>
  );
}
