import type { CandidateDetail } from '@hire-me/contracts';
import { useEffect, useId, useRef } from 'react';

import { useI18n } from '../i18n/index.js';
import { Button, TextArea, TextField } from '../ui/index.js';
import { CANDIDATE_FIELD_LIMITS, useCandidateForm } from './candidate-form.js';
import type { CandidateFormOutcome, CandidateProfileValues } from './candidate-state.js';
import { CandidateFormFeedback } from './CandidateFormFeedback.js';

const PROFILE_FIELDS = [
  'displayName',
  'email',
  'phone',
  'currentJobTitle',
  'city',
  'country',
  'source',
  'professionalSummary',
] as const;

/**
 * Profile editing with exactly the eight approved master fields the workspace
 * has always sent. Compensation and consent are deliberately absent: this form
 * can never include them in a request, whatever the actor's permissions.
 */
export function CandidateProfileForm({
  busy,
  candidate,
  onCancel,
  onSaved,
  onSubmit,
  submitting,
}: {
  /** The workspace's single write lock: true while any Candidate write is in flight. */
  busy: boolean;
  candidate: CandidateDetail;
  onCancel: () => void;
  onSaved: () => void;
  onSubmit: (values: CandidateProfileValues) => Promise<CandidateFormOutcome>;
  /** True while this form's own update request is the write in flight. */
  submitting: boolean;
}) {
  const { t } = useI18n();
  const headingId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const form = useCandidateForm(
    { email: ['email'], fields: PROFILE_FIELDS, required: ['displayName'] },
    (values) => onSubmit(values),
    onSaved,
    busy,
  );

  useEffect(() => {
    const first = formRef.current?.elements.namedItem('displayName');
    if (first instanceof HTMLElement) {
      first.focus();
    }
  }, []);

  return (
    <section aria-labelledby={headingId} className="candidate-section">
      <div className="candidate-section__head">
        <h3 id={headingId}>{t('candidate.profile.editTitle')}</h3>
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
            defaultValue={candidate.displayName}
            error={form.errorFor('displayName')}
            label={t('candidate.fields.displayName')}
            maxLength={CANDIDATE_FIELD_LIMITS.displayName}
            name="displayName"
            required
          />
          <TextField
            autoComplete="off"
            defaultValue={candidate.email ?? ''}
            error={form.errorFor('email')}
            label={t('candidate.fields.email')}
            maxLength={CANDIDATE_FIELD_LIMITS.email}
            name="email"
            type="email"
          />
          <TextField
            autoComplete="off"
            defaultValue={candidate.phone ?? ''}
            label={t('candidate.fields.phone')}
            maxLength={CANDIDATE_FIELD_LIMITS.phone}
            name="phone"
            type="tel"
          />
          <TextField
            defaultValue={candidate.currentJobTitle ?? ''}
            label={t('candidate.fields.currentJobTitle')}
            maxLength={CANDIDATE_FIELD_LIMITS.currentJobTitle}
            name="currentJobTitle"
          />
          <TextField
            defaultValue={candidate.city ?? ''}
            label={t('candidate.fields.city')}
            maxLength={CANDIDATE_FIELD_LIMITS.city}
            name="city"
          />
          <TextField
            defaultValue={candidate.country ?? ''}
            label={t('candidate.fields.country')}
            maxLength={CANDIDATE_FIELD_LIMITS.country}
            name="country"
          />
          <TextField
            defaultValue={candidate.source ?? ''}
            label={t('candidate.fields.source')}
            maxLength={CANDIDATE_FIELD_LIMITS.source}
            name="source"
          />
        </div>
        <TextArea
          defaultValue={candidate.professionalSummary ?? ''}
          label={t('candidate.fields.professionalSummary')}
          maxLength={CANDIDATE_FIELD_LIMITS.professionalSummary}
          name="professionalSummary"
          rows={5}
        />
        <CandidateFormFeedback failure={form.failure} hasFieldErrors={form.hasFieldErrors} />
        <div className="candidate-form__actions">
          <Button
            disabled={busy}
            loading={submitting}
            loadingLabel={t('common.status.working')}
            type="submit"
          >
            {t('candidate.actions.save')}
          </Button>
          <Button disabled={submitting} onClick={onCancel} variant="secondary">
            {t('candidate.actions.cancel')}
          </Button>
        </div>
      </form>
    </section>
  );
}
