import { useI18n } from '../i18n/index.js';
import { Button, TextField } from '../ui/index.js';
import { CANDIDATE_FIELD_LIMITS, useCandidateForm } from './candidate-form.js';
import {
  recordPendingAction,
  type CandidateFormOutcome,
  type CandidatePendingAction,
  type CandidateRecordInput,
  type CandidateRecordRef,
  type CandidateRecordUpdate,
  type CandidateRecordValues,
} from './candidate-state.js';
import type { CandidateSkill } from './candidate-types.js';
import { CandidateFormFeedback } from './CandidateFormFeedback.js';
import {
  ArchivedRecordMarker,
  CandidateRecordRow,
  CandidateRecordSection,
} from './CandidateRecordSection.js';

export interface CandidateRecordSectionProps<Record> {
  /** The workspace's single write lock: true while any Candidate write is in flight. */
  busy: boolean;
  /** `candidate_profile:manage` on a candidate that is not archived: add, edit, archive. */
  canManage: boolean;
  canView: boolean;
  onAdd: (input: CandidateRecordInput) => Promise<CandidateFormOutcome>;
  onArchive: (record: CandidateRecordRef) => Promise<boolean>;
  onUpdate: (update: CandidateRecordUpdate) => Promise<CandidateFormOutcome>;
  pending: CandidatePendingAction | null;
  records: readonly Record[];
  /** True while this section's own add request is the write in flight. */
  submitting: boolean;
}

/** Skills as compact rows: the skill, then its recorded level. */
export function CandidateSkills({
  busy,
  canManage,
  canView,
  onAdd,
  onArchive,
  onUpdate,
  pending,
  records,
  submitting,
}: CandidateRecordSectionProps<CandidateSkill>) {
  const { t } = useI18n();

  return (
    <CandidateRecordSection
      addLabel={t('candidate.skills.add')}
      busy={busy}
      canAdd={canManage}
      canView={canView}
      count={records.length}
      emptyText={t('candidate.skills.empty')}
      renderForm={(close) => (
        <SkillForm
          busy={busy}
          label={t('candidate.skills.add')}
          onClose={close}
          onSubmit={(values) => onAdd({ kind: 'skill', values })}
          submitLabel={t('candidate.skills.add')}
          submitting={submitting}
        />
      )}
      title={t('candidate.skills.title')}
    >
      <ul className="candidate-rows">
        {records.map((skill) => {
          const rowPending = pending === recordPendingAction(skill.id);
          return (
            <CandidateRecordRow
              archived={skill.archivedAt !== null}
              busy={busy}
              canManage={canManage}
              className="candidate-rows__item"
              key={skill.id}
              label={skill.name}
              onArchive={() => onArchive({ kind: 'skill', recordId: skill.id })}
              pending={rowPending}
              renderEdit={(close) => (
                <SkillForm
                  busy={busy}
                  initial={skill}
                  label={t('candidate.records.editLabel', { record: skill.name })}
                  onClose={close}
                  onSubmit={(values) => onUpdate({ kind: 'skill', recordId: skill.id, values })}
                  submitLabel={t('candidate.actions.save')}
                  submitting={rowPending}
                />
              )}
            >
              <span className="candidate-rows__primary">{skill.name}</span>
              {skill.level ? (
                <span className="candidate-rows__secondary">{skill.level}</span>
              ) : null}
              {skill.archivedAt ? <ArchivedRecordMarker /> : null}
            </CandidateRecordRow>
          );
        })}
      </ul>
    </CandidateRecordSection>
  );
}

/** Adds a skill, or edits one when `initial` is given; the fields are the same. */
function SkillForm({
  busy,
  initial,
  label,
  onClose,
  onSubmit,
  submitLabel,
  submitting,
}: {
  busy: boolean;
  initial?: CandidateSkill;
  label: string;
  onClose: () => void;
  onSubmit: (values: CandidateRecordValues['skill']) => Promise<CandidateFormOutcome>;
  submitLabel: string;
  submitting: boolean;
}) {
  const { t } = useI18n();
  const form = useCandidateForm(
    { fields: ['name', 'level'] as const, required: ['name'] },
    onSubmit,
    onClose,
    busy,
  );

  return (
    <form aria-label={label} className="candidate-form" noValidate onSubmit={form.handleSubmit}>
      <div className="candidate-form__fields">
        <TextField
          defaultValue={initial?.name}
          error={form.errorFor('name')}
          label={t('candidate.skills.name')}
          maxLength={CANDIDATE_FIELD_LIMITS.name}
          name="name"
          required
        />
        <TextField
          defaultValue={initial?.level ?? ''}
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
          {submitLabel}
        </Button>
        <Button disabled={submitting} onClick={onClose} size="compact" variant="secondary">
          {t('candidate.actions.cancel')}
        </Button>
      </div>
    </form>
  );
}
