import { useI18n } from '../i18n/index.js';
import { Button, TextField } from '../ui/index.js';
import { CANDIDATE_FIELD_LIMITS, useCandidateForm } from './candidate-form.js';
import {
  recordPendingAction,
  type CandidateFormOutcome,
  type CandidateRecordValues,
} from './candidate-state.js';
import type { CandidateLanguage } from './candidate-types.js';
import { CandidateFormFeedback } from './CandidateFormFeedback.js';
import {
  ArchivedRecordMarker,
  CandidateRecordRow,
  CandidateRecordSection,
} from './CandidateRecordSection.js';
import type { CandidateRecordSectionProps } from './CandidateSkills.js';

/** Languages as compact rows: the language, then its recorded proficiency. */
export function CandidateLanguages({
  busy,
  canManage,
  canView,
  onAdd,
  onArchive,
  onUpdate,
  pending,
  records,
  submitting,
}: CandidateRecordSectionProps<CandidateLanguage>) {
  const { t } = useI18n();

  return (
    <CandidateRecordSection
      addLabel={t('candidate.languages.add')}
      busy={busy}
      canAdd={canManage}
      canView={canView}
      count={records.length}
      emptyText={t('candidate.languages.empty')}
      renderForm={(close) => (
        <LanguageForm
          busy={busy}
          label={t('candidate.languages.add')}
          onClose={close}
          onSubmit={(values) => onAdd({ kind: 'language', values })}
          submitLabel={t('candidate.languages.add')}
          submitting={submitting}
        />
      )}
      title={t('candidate.languages.title')}
    >
      <ul className="candidate-rows">
        {records.map((language) => {
          const rowPending = pending === recordPendingAction(language.id);
          return (
            <CandidateRecordRow
              archived={language.archivedAt !== null}
              busy={busy}
              canManage={canManage}
              className="candidate-rows__item"
              key={language.id}
              label={language.language}
              onArchive={() => onArchive({ kind: 'language', recordId: language.id })}
              pending={rowPending}
              renderEdit={(close) => (
                <LanguageForm
                  busy={busy}
                  initial={language}
                  label={t('candidate.records.editLabel', { record: language.language })}
                  onClose={close}
                  onSubmit={(values) =>
                    onUpdate({ kind: 'language', recordId: language.id, values })
                  }
                  submitLabel={t('candidate.actions.save')}
                  submitting={rowPending}
                />
              )}
            >
              <span className="candidate-rows__primary">{language.language}</span>
              <span className="candidate-rows__secondary">{language.proficiency}</span>
              {language.archivedAt ? <ArchivedRecordMarker /> : null}
            </CandidateRecordRow>
          );
        })}
      </ul>
    </CandidateRecordSection>
  );
}

/** Adds a language, or edits one when `initial` is given; the fields are the same. */
function LanguageForm({
  busy,
  initial,
  label,
  onClose,
  onSubmit,
  submitLabel,
  submitting,
}: {
  busy: boolean;
  initial?: CandidateLanguage;
  label: string;
  onClose: () => void;
  onSubmit: (values: CandidateRecordValues['language']) => Promise<CandidateFormOutcome>;
  submitLabel: string;
  submitting: boolean;
}) {
  const { t } = useI18n();
  const form = useCandidateForm(
    { fields: ['language', 'proficiency'] as const, required: ['language', 'proficiency'] },
    onSubmit,
    onClose,
    busy,
  );

  return (
    <form aria-label={label} className="candidate-form" noValidate onSubmit={form.handleSubmit}>
      <div className="candidate-form__fields">
        <TextField
          defaultValue={initial?.language}
          error={form.errorFor('language')}
          label={t('candidate.languages.language')}
          maxLength={CANDIDATE_FIELD_LIMITS.language}
          name="language"
          required
        />
        <TextField
          defaultValue={initial?.proficiency}
          error={form.errorFor('proficiency')}
          label={t('candidate.languages.proficiency')}
          maxLength={CANDIDATE_FIELD_LIMITS.proficiency}
          name="proficiency"
          required
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
