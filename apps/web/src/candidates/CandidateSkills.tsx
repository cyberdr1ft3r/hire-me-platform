import { useI18n } from '../i18n/index.js';
import { Button, TextField } from '../ui/index.js';
import { CANDIDATE_FIELD_LIMITS, useCandidateForm } from './candidate-form.js';
import type { CandidateFormOutcome, CandidateRecordInput } from './candidate-state.js';
import type { CandidateSkill } from './candidate-types.js';
import { CandidateFormFeedback } from './CandidateFormFeedback.js';
import { ArchivedRecordMarker, CandidateRecordSection } from './CandidateRecordSection.js';

export interface CandidateRecordSectionProps<Record> {
  /** The workspace's single write lock: true while any Candidate write is in flight. */
  busy: boolean;
  canAdd: boolean;
  canView: boolean;
  onAdd: (input: CandidateRecordInput) => Promise<CandidateFormOutcome>;
  records: readonly Record[];
  /** True while this section's own add request is the write in flight. */
  submitting: boolean;
}

/** Skills as compact rows: the skill, then its recorded level. */
export function CandidateSkills({
  busy,
  canAdd,
  canView,
  onAdd,
  records,
  submitting,
}: CandidateRecordSectionProps<CandidateSkill>) {
  const { t } = useI18n();

  return (
    <CandidateRecordSection
      addLabel={t('candidate.skills.add')}
      busy={busy}
      canAdd={canAdd}
      canView={canView}
      count={records.length}
      emptyText={t('candidate.skills.empty')}
      renderForm={(close) => (
        <SkillForm busy={busy} onAdd={onAdd} onClose={close} submitting={submitting} />
      )}
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
  submitting,
}: {
  busy: boolean;
  onAdd: CandidateRecordSectionProps<CandidateSkill>['onAdd'];
  onClose: () => void;
  submitting: boolean;
}) {
  const { t } = useI18n();
  const form = useCandidateForm(
    { fields: ['name', 'level'] as const, required: ['name'] },
    (values) => onAdd({ kind: 'skill', values }),
    onClose,
    busy,
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
          disabled={busy}
          loading={submitting}
          loadingLabel={t('common.status.working')}
          size="compact"
          type="submit"
        >
          {t('candidate.skills.add')}
        </Button>
        <Button disabled={submitting} onClick={onClose} size="compact" variant="secondary">
          {t('candidate.actions.cancel')}
        </Button>
      </div>
    </form>
  );
}
