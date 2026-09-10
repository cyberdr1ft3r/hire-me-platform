import { useI18n } from '../i18n/index.js';
import { Button, TextField } from '../ui/index.js';
import { CANDIDATE_FIELD_LIMITS, useCandidateForm } from './candidate-form.js';
import type { CandidateFormOutcome, CandidateRecordInput } from './candidate-state.js';
import type { CandidateSkill } from './candidate-types.js';
import { CandidateFormFeedback } from './CandidateFormFeedback.js';
import { ArchivedRecordMarker, CandidateRecordSection } from './CandidateRecordSection.js';

export interface CandidateRecordSectionProps<Record> {
  busy: boolean;
  canAdd: boolean;
  canView: boolean;
  onAdd: (input: CandidateRecordInput) => Promise<CandidateFormOutcome>;
  records: readonly Record[];
}

/** Skills as compact rows: the skill, then its recorded level. */
export function CandidateSkills({
  busy,
  canAdd,
  canView,
  onAdd,
  records,
}: CandidateRecordSectionProps<CandidateSkill>) {
  const { t } = useI18n();

  return (
    <CandidateRecordSection
      addLabel={t('candidate.skills.add')}
      canAdd={canAdd}
      canView={canView}
      count={records.length}
      emptyText={t('candidate.skills.empty')}
      renderForm={(close) => <SkillForm busy={busy} onAdd={onAdd} onClose={close} />}
      title={t('candidate.skills.title')}
    >
      <ul className="candidate-rows">
        {records.map((skill) => (
          <li className="candidate-rows__item" key={skill.id}>
            <span className="candidate-rows__primary">{skill.name}</span>
            {skill.level ? <span className="candidate-rows__secondary">{skill.level}</span> : null}
            {skill.archivedAt ? <ArchivedRecordMarker /> : null}
          </li>
        ))}
      </ul>
    </CandidateRecordSection>
  );
}

function SkillForm({
  busy,
  onAdd,
  onClose,
}: {
  busy: boolean;
  onAdd: CandidateRecordSectionProps<CandidateSkill>['onAdd'];
  onClose: () => void;
}) {
  const { t } = useI18n();
  const form = useCandidateForm(
    { fields: ['name', 'level'] as const, required: ['name'] },
    (values) => onAdd({ kind: 'skill', values }),
    onClose,
  );

  return (
    <form
      aria-label={t('candidate.skills.add')}
      className="candidate-form"
      noValidate
      onSubmit={form.handleSubmit}
    >
      <div className="candidate-form__fields">
        <TextField
          error={form.errorFor('name')}
          label={t('candidate.skills.name')}
          maxLength={CANDIDATE_FIELD_LIMITS.name}
          name="name"
          required
        />
        <TextField
          label={t('candidate.skills.level')}
          maxLength={CANDIDATE_FIELD_LIMITS.level}
          name="level"
        />
      </div>
      <CandidateFormFeedback failure={form.failure} hasFieldErrors={form.hasFieldErrors} />
      <div className="candidate-form__actions">
        <Button
          loading={busy}
          loadingLabel={t('common.status.working')}
          size="compact"
          type="submit"
        >
          {t('candidate.skills.add')}
        </Button>
        <Button disabled={busy} onClick={onClose} size="compact" variant="secondary">
          {t('candidate.actions.cancel')}
        </Button>
      </div>
    </form>
  );
}
