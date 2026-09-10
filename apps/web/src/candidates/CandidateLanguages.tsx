import { useI18n } from '../i18n/index.js';
import { Button, TextField } from '../ui/index.js';
import { CANDIDATE_FIELD_LIMITS, useCandidateForm } from './candidate-form.js';
import type { CandidateLanguage } from './candidate-types.js';
import { CandidateFormFeedback } from './CandidateFormFeedback.js';
import { ArchivedRecordMarker, CandidateRecordSection } from './CandidateRecordSection.js';
import type { CandidateRecordSectionProps } from './CandidateSkills.js';

/** Languages as compact rows: the language, then its recorded proficiency. */
export function CandidateLanguages({
  busy,
  canAdd,
  canView,
  onAdd,
  records,
}: CandidateRecordSectionProps<CandidateLanguage>) {
  const { t } = useI18n();

  return (
    <CandidateRecordSection
      addLabel={t('candidate.languages.add')}
      canAdd={canAdd}
      canView={canView}
      count={records.length}
      emptyText={t('candidate.languages.empty')}
      renderForm={(close) => <LanguageForm busy={busy} onAdd={onAdd} onClose={close} />}
      title={t('candidate.languages.title')}
    >
      <ul className="candidate-rows">
        {records.map((language) => (
          <li className="candidate-rows__item" key={language.id}>
            <span className="candidate-rows__primary">{language.language}</span>
            <span className="candidate-rows__secondary">{language.proficiency}</span>
            {language.archivedAt ? <ArchivedRecordMarker /> : null}
          </li>
        ))}
      </ul>
    </CandidateRecordSection>
  );
}

function LanguageForm({
  busy,
  onAdd,
  onClose,
}: {
  busy: boolean;
  onAdd: CandidateRecordSectionProps<CandidateLanguage>['onAdd'];
  onClose: () => void;
}) {
  const { t } = useI18n();
  const form = useCandidateForm(
    { fields: ['language', 'proficiency'] as const, required: ['language', 'proficiency'] },
    (values) => onAdd({ kind: 'language', values }),
    onClose,
  );

  return (
    <form
      aria-label={t('candidate.languages.add')}
      className="candidate-form"
      noValidate
      onSubmit={form.handleSubmit}
    >
      <div className="candidate-form__fields">
        <TextField
          error={form.errorFor('language')}
          label={t('candidate.languages.language')}
          maxLength={CANDIDATE_FIELD_LIMITS.language}
          name="language"
          required
        />
        <TextField
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
          loading={busy}
          loadingLabel={t('common.status.working')}
          size="compact"
          type="submit"
        >
          {t('candidate.languages.add')}
        </Button>
        <Button disabled={busy} onClick={onClose} size="compact" variant="secondary">
          {t('candidate.actions.cancel')}
        </Button>
      </div>
    </form>
  );
}
