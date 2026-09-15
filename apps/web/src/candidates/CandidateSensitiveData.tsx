import type { CandidateDetail } from '@hire-me/contracts';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

import { useI18n } from '../i18n/index.js';
import { isoToLocalInput } from '../tasks/task-datetime.js';
import { Button, Select, TextField } from '../ui/index.js';
import type { CandidateAccess } from './candidate-access.js';
import { useCandidateForm } from './candidate-form.js';
import { formatSalaryExpectation } from './candidate-format.js';
import { consentStatusLabelKey } from './candidate-labels.js';
import {
  CONSENT_STATUSES,
  salaryAmountInput,
  validateCompensationValues,
  validateConsentValues,
} from './candidate-sensitive.js';
import type {
  CandidateFormOutcome,
  CandidatePendingAction,
  CandidateSensitiveUpdate,
  CandidateSensitiveValues,
} from './candidate-state.js';
import type { CandidateCompensation, CandidateConsent } from './candidate-types.js';
import { CandidateFormFeedback } from './CandidateFormFeedback.js';

export interface CandidateSensitiveDataProps {
  access: Pick<
    CandidateAccess,
    'canEditCompensation' | 'canManageConsent' | 'canViewCompensation' | 'canViewConsent'
  >;
  /** An archived candidate is read-only: no restricted action is offered. */
  archived: boolean;
  /** The workspace's single write lock: true while any Candidate write is in flight. */
  busy: boolean;
  candidate: CandidateDetail;
  onUpdate: (update: CandidateSensitiveUpdate) => Promise<CandidateFormOutcome>;
  pending: CandidatePendingAction | null;
}

/**
 * Compensation and consent: the two candidate areas behind dedicated
 * permissions.
 *
 * Each block is rendered only when the actor holds its own view permission
 * *and* the API actually returned that data. Without the permission nothing is
 * rendered at all — no heading, no placeholder, no "hidden" label — so an
 * ordinary candidate viewer cannot even learn the area exists. The gate is in
 * this component's render logic, never in CSS.
 *
 * Editing is offered inside the block it changes, only when the actor may
 * both see and change it (`canEditCompensation`, `canManageConsent`) and the
 * candidate is not archived. An update or manage permission without the
 * matching view permission therefore never produces a blind editor, and an
 * unauthorized actor sees no disabled control either. The server re-checks
 * every permission and the archived state on each request.
 */
export function CandidateSensitiveData({
  access,
  archived,
  busy,
  candidate,
  onUpdate,
  pending,
}: CandidateSensitiveDataProps) {
  const { formatCurrency, formatDateTime, formatNumber, t } = useI18n();
  const headingId = useId();
  const compensation = access.canViewCompensation ? candidate.compensation : null;
  const consent = access.canViewConsent ? candidate.consent : null;

  if (!compensation && !consent) {
    return null;
  }

  const salary = compensation
    ? formatSalaryExpectation(compensation, { formatCurrency, formatNumber })
    : null;

  return (
    <section aria-labelledby={headingId} className="candidate-section candidate-sensitive">
      <div className="candidate-section__head">
        <h3 id={headingId}>{t('candidate.sensitive.title')}</h3>
        <span className="candidate-sensitive__label">{t('candidate.sensitive.label')}</span>
      </div>
      <p className="candidate-section__description">{t('candidate.sensitive.description')}</p>
      <div className="candidate-sensitive__groups">
        {compensation ? (
          <SensitiveGroup
            actionLabel={t('candidate.compensation.edit')}
            busy={busy}
            canChange={access.canEditCompensation && !archived}
            renderForm={(close) => (
              <CompensationForm
                busy={busy}
                current={compensation}
                onClose={close}
                onSubmit={(values) => onUpdate({ kind: 'compensation', values })}
                submitting={pending === 'compensation'}
              />
            )}
            title={t('candidate.compensation.title')}
          >
            <dl className="candidate-facts">
              <div>
                <dt>{t('candidate.compensation.salaryExpectation')}</dt>
                <dd className="u-tabular">{salary ?? t('candidate.compensation.notRecorded')}</dd>
              </div>
            </dl>
          </SensitiveGroup>
        ) : null}
        {consent ? (
          <SensitiveGroup
            actionLabel={t('candidate.consent.manage')}
            busy={busy}
            canChange={access.canManageConsent && !archived}
            renderForm={(close) => (
              <ConsentForm
                busy={busy}
                current={consent}
                onClose={close}
                onSubmit={(values) => onUpdate({ kind: 'consent', values })}
                submitting={pending === 'consent'}
              />
            )}
            title={t('candidate.consent.title')}
          >
            <dl className="candidate-facts">
              <div>
                <dt>{t('candidate.consent.status')}</dt>
                <dd>{t(consentStatusLabelKey(consent.consentStatus))}</dd>
              </div>
              <div>
                <dt>{t('candidate.consent.recordedAt')}</dt>
                <dd>
                  {consent.consentRecordedAt
                    ? formatDateTime(consent.consentRecordedAt)
                    : t('candidate.consent.notRecorded')}
                </dd>
              </div>
            </dl>
          </SensitiveGroup>
        ) : null}
      </div>
    </section>
  );
}

/**
 * One restricted block: its heading, its recorded values, and — for an actor
 * who may change it — one action that replaces the values with a bounded form.
 * Save and Cancel both return focus to that action.
 */
function SensitiveGroup({
  actionLabel,
  busy,
  canChange,
  children,
  renderForm,
  title,
}: {
  actionLabel: string;
  busy: boolean;
  canChange: boolean;
  children: ReactNode;
  renderForm: (close: () => void) => ReactNode;
  title: string;
}) {
  const headingId = useId();
  const groupRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const restoreFocus = useRef(false);
  const open = canChange && editing;

  function close(): void {
    restoreFocus.current = true;
    setEditing(false);
  }

  // Focus returns to the action once the form has closed and the action is enabled again.
  useEffect(() => {
    if (!restoreFocus.current || editing || busy) {
      return;
    }
    restoreFocus.current = false;
    groupRef.current?.querySelector<HTMLButtonElement>('[data-sensitive-action]')?.focus();
  }, [busy, editing]);

  return (
    <div
      aria-labelledby={headingId}
      className="candidate-sensitive__group"
      ref={groupRef}
      role="group"
    >
      <div className="candidate-sensitive__group-head">
        <h4 id={headingId}>{title}</h4>
        {canChange && !editing ? (
          <Button
            data-sensitive-action=""
            disabled={busy}
            onClick={() => setEditing(true)}
            size="compact"
            variant="secondary"
          >
            {actionLabel}
          </Button>
        ) : null}
      </div>
      {open ? renderForm(close) : children}
    </div>
  );
}

function useFocusFirstField(name: string) {
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const first = formRef.current?.elements.namedItem(name);
    if (first instanceof HTMLElement) {
      first.focus();
    }
  }, [name]);
  return formRef;
}

const COMPENSATION_FIELDS = ['amount', 'currency'] as const;

/**
 * The salary expectation in major units and its recorded currency. The amount
 * is pre-filled from the stored minor units exactly (`3600050` → `36000.50`);
 * the operator never types cents.
 */
function CompensationForm({
  busy,
  current,
  onClose,
  onSubmit,
  submitting,
}: {
  busy: boolean;
  current: CandidateCompensation;
  onClose: () => void;
  onSubmit: (values: CandidateSensitiveValues['compensation']) => Promise<CandidateFormOutcome>;
  submitting: boolean;
}) {
  const { t } = useI18n();
  const formRef = useFocusFirstField('amount');
  const form = useCandidateForm(
    { fields: COMPENSATION_FIELDS, validate: (values) => validateCompensationValues(values) },
    onSubmit,
    onClose,
    busy,
  );

  return (
    <form
      aria-label={t('candidate.compensation.edit')}
      className="candidate-form"
      noValidate
      onSubmit={form.handleSubmit}
      ref={formRef}
    >
      <div className="candidate-form__fields">
        <TextField
          autoComplete="off"
          defaultValue={salaryAmountInput(current.salaryExpectationCents)}
          error={form.errorFor('amount')}
          hint={t('candidate.compensation.amountHint')}
          inputMode="decimal"
          label={t('candidate.compensation.salaryExpectation')}
          name="amount"
        />
        <TextField
          autoComplete="off"
          defaultValue={current.salaryExpectationCurrency ?? ''}
          error={form.errorFor('currency')}
          hint={t('candidate.compensation.currencyHint')}
          label={t('candidate.compensation.currency')}
          maxLength={3}
          name="currency"
        />
      </div>
      <CandidateFormFeedback failure={form.failure} hasFieldErrors={form.hasFieldErrors} />
      <SensitiveFormActions busy={busy} onClose={onClose} submitting={submitting} />
    </form>
  );
}

const CONSENT_FIELDS = ['consentStatus', 'consentRecordedAt'] as const;

/**
 * The consent status, chosen by its localized label while the select carries
 * the language-neutral enum value, and the recorded date and time in local
 * time. The two are independent: changing the status leaves the date as is.
 */
function ConsentForm({
  busy,
  current,
  onClose,
  onSubmit,
  submitting,
}: {
  busy: boolean;
  current: CandidateConsent;
  onClose: () => void;
  onSubmit: (values: CandidateSensitiveValues['consent']) => Promise<CandidateFormOutcome>;
  submitting: boolean;
}) {
  const { locale, t } = useI18n();
  const formRef = useFocusFirstField('consentStatus');
  const form = useCandidateForm(
    {
      fields: CONSENT_FIELDS,
      validate: (values, element) => {
        const errors = validateConsentValues(values);
        // An incomplete date reads as empty; it must not silently clear the recorded one.
        const control = element.elements.namedItem('consentRecordedAt');
        if (control instanceof HTMLInputElement && control.validity.badInput) {
          errors.consentRecordedAt = 'dateTime';
        }
        return errors;
      },
    },
    onSubmit,
    onClose,
    busy,
  );

  return (
    <form
      aria-label={t('candidate.consent.manage')}
      className="candidate-form"
      noValidate
      onSubmit={form.handleSubmit}
      ref={formRef}
    >
      <div className="candidate-form__fields">
        <Select
          defaultValue={current.consentStatus}
          error={form.errorFor('consentStatus')}
          label={t('candidate.consent.status')}
          name="consentStatus"
        >
          {CONSENT_STATUSES.map((status) => (
            <option key={status} value={status}>
              {t(consentStatusLabelKey(status))}
            </option>
          ))}
        </Select>
        <TextField
          autoComplete="off"
          defaultValue={isoToLocalInput(current.consentRecordedAt)}
          error={form.errorFor('consentRecordedAt')}
          hint={t('candidate.consent.recordedAtHint')}
          label={t('candidate.consent.recordedAtField')}
          lang={locale}
          name="consentRecordedAt"
          type="datetime-local"
        />
      </div>
      <CandidateFormFeedback failure={form.failure} hasFieldErrors={form.hasFieldErrors} />
      <SensitiveFormActions busy={busy} onClose={onClose} submitting={submitting} />
    </form>
  );
}

function SensitiveFormActions({
  busy,
  onClose,
  submitting,
}: {
  busy: boolean;
  onClose: () => void;
  submitting: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className="candidate-form__actions">
      <Button
        disabled={busy}
        loading={submitting}
        loadingLabel={t('common.status.working')}
        size="compact"
        type="submit"
      >
        {t('candidate.actions.save')}
      </Button>
      <Button disabled={submitting} onClick={onClose} size="compact" variant="secondary">
        {t('candidate.actions.cancel')}
      </Button>
    </div>
  );
}
