import { useId, useState } from 'react';

import { useI18n } from '../i18n/index.js';
import { CreationDrawer, TextField } from '../ui/index.js';
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
 * Candidate creation in the shared creation drawer (#201), with exactly the seven
 * fields the workspace has always offered. Only the name is required, as the
 * contract requires. Closing with input asks before discarding it.
 *
 * It is rendered only for actors holding `candidates:create`; the container
 * decides that, never this form.
 */
export function CandidateCreateDrawer({
  busy,
  onClose,
  onSubmit,
  submitting,
}: {
  /** The workspace's single write lock: true while any Candidate write is in flight. */
  busy: boolean;
  onClose: () => void;
  onSubmit: (values: CandidateCreateValues) => Promise<CandidateFormOutcome>;
  /** True while this form's own create request is the write in flight. */
  submitting: boolean;
}) {
  const { t } = useI18n();
  const formId = useId();
  const [dirty, setDirty] = useState(false);
  const form = useCandidateForm(
    { email: ['email'], fields: CREATE_FIELDS, required: ['displayName'] },
    (values) => onSubmit(values),
    onClose,
    busy,
  );

  return (
    <CreationDrawer
      description={t('candidate.create.description')}
      dirty={dirty}
      formId={formId}
      onClose={onClose}
      submitDisabled={busy}
      submitLabel={t('candidate.actions.create')}
      submitting={submitting}
      title={t('candidate.create.title')}
    >
      <form
        aria-label={t('candidate.create.title')}
        className="candidate-form"
        id={formId}
        noValidate
        onInput={() => setDirty(true)}
        onSubmit={form.handleSubmit}
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
      </form>
    </CreationDrawer>
  );
}
