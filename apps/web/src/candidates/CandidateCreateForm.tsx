import { useEffect, useId, useRef } from 'react';

import { useI18n } from '../i18n/index.js';
import { Button, TextField } from '../ui/index.js';
import { CANDIDATE_FIELD_LIMITS, useCandidateForm } from './candidate-form.js';
import type { CandidateCreateValues, CandidateFormOutcome } from './candidate-state.js';
import { CandidateFormFeedback } from './CandidateFormFeedback.js';

const CREATE_FIELDS = [
  'displayName',
  'email',
  'phone',
  'currentJobTitle',
  'city',
  'country',
  'source',
] as const;

/**
 * Candidate creation, with exactly the seven fields the workspace has always
 * offered. Only the name is required, as the contract requires.
 *
 * It is rendered only for actors holding `candidates:create`; the container
 * decides that, never this form.
 */
export function CandidateCreateForm({
  busy,
  onCancel,
  onCreated,
  onSubmit,
  submitting,
}: {
  /** The workspace's single write lock: true while any Candidate write is in flight. */
  busy: boolean;
  onCancel: () => void;
  onCreated: () => void;
  onSubmit: (values: CandidateCreateValues) => Promise<CandidateFormOutcome>;
  /** True while this form's own create request is the write in flight. */
  submitting: boolean;
}) {
  const { t } = useI18n();
  const headingId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const form = useCandidateForm(
    { email: ['email'], fields: CREATE_FIELDS, required: ['displayName'] },
    (values) => onSubmit(values),
    onCreated,
    busy,
  );

  // Opening the form moves focus to its first field, so keyboard users land in it.
  useEffect(() => {
    const first = formRef.current?.elements.namedItem('displayName');
    if (first instanceof HTMLElement) {
      first.focus();
    }
  }, []);

  return (
    <section aria-labelledby={headingId} className="candidate-create">
      <div className="candidate-section__head">
        <h2 id={headingId}>{t('candidate.create.title')}</h2>
        <p className="candidate-section__description">{t('candidate.create.description')}</p>
      </div>
      <form
        aria-labelledby={headingId}
        className="candidate-form"
        noValidate
        onSubmit={form.handleSubmit}
        ref={formRef}
      >
        <div className="candidate-form__fields">
          <TextField
            autoComplete="off"
            error={form.errorFor('displayName')}
            label={t('candidate.fields.displayName')}
            maxLength={CANDIDATE_FIELD_LIMITS.displayName}
            name="displayName"
            required
          />
          <TextField
            autoComplete="off"
            error={form.errorFor('email')}
            label={t('candidate.fields.email')}
            maxLength={CANDIDATE_FIELD_LIMITS.email}
            name="email"
            type="email"
          />
          <TextField
            autoComplete="off"
            label={t('candidate.fields.phone')}
            maxLength={CANDIDATE_FIELD_LIMITS.phone}
            name="phone"
            type="tel"
          />
          <TextField
            label={t('candidate.fields.currentJobTitle')}
            maxLength={CANDIDATE_FIELD_LIMITS.currentJobTitle}
            name="currentJobTitle"
          />
          <TextField
            label={t('candidate.fields.city')}
            maxLength={CANDIDATE_FIELD_LIMITS.city}
            name="city"
          />
          <TextField
            label={t('candidate.fields.country')}
            maxLength={CANDIDATE_FIELD_LIMITS.country}
            name="country"
          />
          <TextField
            label={t('candidate.fields.source')}
            maxLength={CANDIDATE_FIELD_LIMITS.source}
            name="source"
          />
        </div>
        <CandidateFormFeedback failure={form.failure} hasFieldErrors={form.hasFieldErrors} />
        <div className="candidate-form__actions">
          <Button
            disabled={busy}
            loading={submitting}
            loadingLabel={t('common.status.working')}
            type="submit"
          >
            {t('candidate.actions.create')}
          </Button>
          <Button disabled={submitting} onClick={onCancel} variant="secondary">
            {t('candidate.actions.cancel')}
          </Button>
        </div>
      </form>
    </section>
  );
}
