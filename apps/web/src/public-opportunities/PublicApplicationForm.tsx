import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import type { PublicOpportunity } from '@hire-me/contracts';

import { LOCALE_METADATA, useI18n, type PlainMessageKey } from '../i18n/index.js';
import { Button, InlineMessage, TextArea, TextField } from '../ui/index.js';
import {
  APPLICATION_FIELD_LIMITS,
  hasValidationErrors,
  isFileRequired,
  readApplicationForm,
  validateApplication,
  visibleFileSlots,
  type ApplicationErrorTarget,
  type ApplicationFieldError,
  type ApplicationFileSlot,
  type ApplicationSnapshot,
  type ApplicationTextField,
  type ApplicationValidation,
} from './public-application.js';
import { formatAcceptedTypes, formatMegabytes } from './public-opportunity-format.js';
import type { PublicSubmissionFailure, PublicSubmissionState } from './public-opportunity-state.js';

/**
 * Controls rendered as `type="number"`, whose text the browser may refuse to
 * read at all. The salary amount is deliberately not one of them: it is a text
 * control with a decimal input mode, so "." and "," are read the same way in
 * every locale instead of depending on the browser's own number parsing.
 */
const NUMBER_FIELDS: readonly ApplicationTextField[] = ['experienceYears'];

const FILE_CATEGORY_LABELS: Record<ApplicationFileSlot, PlainMessageKey> = {
  additional: 'domain.publicApplicationFileCategory.ADDITIONAL',
  certification: 'domain.publicApplicationFileCategory.CERTIFICATION',
  cv: 'domain.publicApplicationFileCategory.CV',
  diploma: 'domain.publicApplicationFileCategory.DIPLOMA',
};

function failureLabelKey(failure: PublicSubmissionFailure): PlainMessageKey {
  return `publicOpportunity.feedback.failure.${failure}`;
}

function validationLabelKey(
  code: Exclude<ApplicationFieldError['code'], 'fileSize'>,
): PlainMessageKey {
  return `publicOpportunity.validation.${code}`;
}

/** A number control holding text the browser could not read as a number. */
function badNumberInputs(form: HTMLFormElement): Set<ApplicationTextField> {
  const bad = new Set<ApplicationTextField>();
  for (const field of NUMBER_FIELDS) {
    const control = form.elements.namedItem(field);
    if (control instanceof HTMLInputElement && control.validity.badInput) {
      bad.add(field);
    }
  }
  return bad;
}

function focusFirstInvalid(form: HTMLFormElement, validation: ApplicationValidation): void {
  const control =
    Array.from(form.elements).find((element) =>
      Object.hasOwn(validation.fields, element.getAttribute('name') ?? ''),
    ) ?? (validation.totalLimitBytes !== null ? form.elements.namedItem('cv') : null);
  if (control instanceof HTMLElement) {
    const disclosure = control.closest('details');
    if (disclosure) disclosure.open = true;
    control.focus();
  }
}

/**
 * Required fields and the CV are visible before optional details are expanded.
 *
 * It validates locally, then hands one snapshot of the form to the container,
 * which owns the request. While a submission is in flight the form refuses a
 * second one, even through implicit submission from a text field, and the
 * container holds its own synchronous lock as well.
 *
 * Every control is uncontrolled, so switching language re-renders labels and
 * messages without clearing anything the candidate has typed or chosen.
 */
export function PublicApplicationForm({
  labelledBy,
  onSubmit,
  opportunity,
  submission,
}: {
  labelledBy: string;
  onSubmit: (snapshot: ApplicationSnapshot) => void;
  opportunity: PublicOpportunity;
  submission: PublicSubmissionState;
}) {
  const { formatNumber, locale, t } = useI18n();
  const requirements = opportunity.uploadRequirements;
  const [validation, setValidation] = useState<ApplicationValidation | null>(null);
  const documentsHintId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const focusInvalid = useRef(false);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const submitting = submission.status === 'submitting';
  const failure = submission.status === 'failed' ? submission.failure : null;

  useLayoutEffect(() => {
    if (focusInvalid.current && validation && formRef.current) {
      focusInvalid.current = false;
      focusFirstInvalid(formRef.current, validation);
    }
  }, [validation]);

  useEffect(() => {
    if (failure) feedbackRef.current?.focus();
  }, [failure]);

  function updateValidation(form: HTMLFormElement): void {
    if (!validation) return;
    const result = validateApplication(
      readApplicationForm(form),
      requirements,
      badNumberInputs(form),
    );
    setValidation(hasValidationErrors(result) ? result : null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (submitting) {
      return;
    }
    const form = event.currentTarget;
    const snapshot = readApplicationForm(form);
    const result = validateApplication(snapshot, requirements, badNumberInputs(form));
    if (hasValidationErrors(result)) {
      focusInvalid.current = true;
      setValidation(result);
      return;
    }
    setValidation(null);
    onSubmit(snapshot);
  }

  function errorFor(target: ApplicationErrorTarget): string | undefined {
    const error = validation?.fields[target];
    if (!error) {
      return undefined;
    }
    return error.code === 'fileSize'
      ? t('publicOpportunity.validation.fileSize', {
          size: formatMegabytes(error.limitBytes, formatNumber),
        })
      : t(validationLabelKey(error.code));
  }

  const accept = requirements.allowedMimeTypes.join(',');
  const fileSlots = visibleFileSlots(requirements);
  const primaryFiles = fileSlots.filter(
    (name) => name === 'cv' || isFileRequired(name, requirements),
  );
  const optionalFiles = fileSlots.filter((name) => !primaryFiles.includes(name));

  function renderFiles(slots: ApplicationFileSlot[]): ReactNode {
    return slots.map((name) => (
      <PublicFileField
        accept={accept}
        error={errorFor(name)}
        key={name}
        label={t(FILE_CATEGORY_LABELS[name])}
        name={name}
        onClear={updateValidation}
        required={isFileRequired(name, requirements)}
      />
    ));
  }

  return (
    <form
      aria-busy={submitting || undefined}
      aria-labelledby={labelledBy}
      className="public-form"
      noValidate
      onChange={(event) => updateValidation(event.currentTarget)}
      onSubmit={handleSubmit}
      ref={formRef}
    >
      <p className="public-form__note">{t('publicOpportunity.application.description')}</p>

      <FormGroup legend={t('publicOpportunity.application.sections.about')}>
        <TextField
          autoComplete="name"
          error={errorFor('fullName')}
          label={t('publicOpportunity.application.fields.fullName')}
          maxLength={APPLICATION_FIELD_LIMITS.fullName}
          name="fullName"
          required
        />
        <TextField
          autoComplete="email"
          error={errorFor('email')}
          label={t('publicOpportunity.application.fields.email')}
          maxLength={APPLICATION_FIELD_LIMITS.email}
          name="email"
          required
          type="email"
        />
      </FormGroup>

      <FormGroup
        describedBy={documentsHintId}
        legend={t('publicOpportunity.application.sections.documents')}
        single
      >
        <p className="public-form__group-hint" id={documentsHintId}>
          {t('publicOpportunity.application.hints.documents', {
            fileSize: formatMegabytes(requirements.maxFileSizeBytes, formatNumber),
            totalSize: formatMegabytes(requirements.maxTotalUploadBytes, formatNumber),
            types: formatAcceptedTypes(
              requirements.allowedMimeTypes,
              LOCALE_METADATA[locale].formattingLocale,
              t,
            ),
          })}
        </p>
        {renderFiles(primaryFiles)}
        {validation?.totalLimitBytes ? (
          <p className="ui-field__error" role="alert">
            {t('publicOpportunity.validation.fileTotal', {
              size: formatMegabytes(validation.totalLimitBytes, formatNumber),
            })}
          </p>
        ) : null}
      </FormGroup>

      <details className="public-form__optional">
        <summary>{t('publicOpportunity.application.optionalDetails')}</summary>
        <div className="public-form__optional-body">
          {optionalFiles.length > 0 ? (
            <FormGroup
              describedBy={documentsHintId}
              legend={t('publicOpportunity.application.sections.optionalDocuments')}
              single
            >
              {renderFiles(optionalFiles)}
            </FormGroup>
          ) : null}
          <FormGroup legend={t('publicOpportunity.application.sections.moreContact')}>
            <TextField
              autoComplete="tel"
              label={t('publicOpportunity.application.fields.phone')}
              maxLength={APPLICATION_FIELD_LIMITS.text}
              name="phone"
              type="tel"
            />
            <TextField
              autoComplete="address-level2"
              label={t('publicOpportunity.application.fields.city')}
              maxLength={APPLICATION_FIELD_LIMITS.text}
              name="city"
            />
            <TextField
              autoComplete="country-name"
              label={t('publicOpportunity.application.fields.country')}
              maxLength={APPLICATION_FIELD_LIMITS.text}
              name="country"
            />
          </FormGroup>

          <FormGroup legend={t('publicOpportunity.application.sections.experience')}>
            <TextField
              autoComplete="organization-title"
              label={t('publicOpportunity.application.fields.currentPosition')}
              maxLength={APPLICATION_FIELD_LIMITS.text}
              name="currentPosition"
            />
            <TextField
              error={errorFor('experienceYears')}
              inputMode="numeric"
              label={t('publicOpportunity.application.fields.experienceYears')}
              max={APPLICATION_FIELD_LIMITS.experienceYearsMax}
              min={0}
              name="experienceYears"
              step={1}
              type="number"
            />
            <Wide>
              <TextField
                hint={t('publicOpportunity.application.hints.availability')}
                label={t('publicOpportunity.application.fields.availability')}
                maxLength={APPLICATION_FIELD_LIMITS.text}
                name="availability"
              />
            </Wide>
            <Wide>
              <TextArea
                label={t('publicOpportunity.application.fields.skills')}
                maxLength={APPLICATION_FIELD_LIMITS.text}
                name="skills"
                rows={3}
              />
            </Wide>
            <Wide>
              <TextArea
                label={t('publicOpportunity.application.fields.languages')}
                maxLength={APPLICATION_FIELD_LIMITS.text}
                name="languages"
                rows={2}
              />
            </Wide>
          </FormGroup>

          <FormGroup legend={t('publicOpportunity.application.sections.salary')}>
            <TextField
              error={errorFor('salaryExpectationAmount')}
              hint={t('publicOpportunity.application.hints.salaryAmount')}
              inputMode="decimal"
              label={t('publicOpportunity.application.fields.salaryAmount')}
              maxLength={APPLICATION_FIELD_LIMITS.salaryExpectationAmount}
              name="salaryExpectationAmount"
            />
            <TextField
              autoCapitalize="characters"
              error={errorFor('salaryExpectationCurrency')}
              hint={t('publicOpportunity.application.hints.salaryCurrency')}
              label={t('publicOpportunity.application.fields.salaryCurrency')}
              maxLength={APPLICATION_FIELD_LIMITS.salaryExpectationCurrency}
              name="salaryExpectationCurrency"
            />
          </FormGroup>

          <FormGroup legend={t('publicOpportunity.application.sections.motivation')}>
            <Wide>
              <TextArea
                hint={t('publicOpportunity.application.hints.professionalLinks')}
                label={t('publicOpportunity.application.fields.professionalLinks')}
                maxLength={APPLICATION_FIELD_LIMITS.text}
                name="professionalLinks"
                rows={2}
              />
            </Wide>
            <Wide>
              <TextArea
                label={t('publicOpportunity.application.fields.motivation')}
                maxLength={APPLICATION_FIELD_LIMITS.text}
                name="motivation"
                rows={5}
              />
            </Wide>
          </FormGroup>
        </div>
      </details>

      <ConsentField error={errorFor('consentGranted')} />

      {/* Anti-spam trap: hidden from people and assistive technology, sent as before. */}
      <div aria-hidden="true" className="public-form__trap">
        <input autoComplete="off" name="website" tabIndex={-1} />
      </div>

      {validation || failure ? (
        <div ref={feedbackRef} tabIndex={-1}>
          <FormFeedback failure={failure} invalid={validation !== null} />
        </div>
      ) : null}

      <div className="public-form__actions">
        <Button
          disabled={submitting}
          loading={submitting}
          loadingLabel={t('publicOpportunity.application.submitting')}
          type="submit"
        >
          {t('publicOpportunity.application.submit')}
        </Button>
      </div>
    </form>
  );
}

function FormGroup({
  children,
  describedBy,
  legend,
  single = false,
}: {
  children: ReactNode;
  describedBy?: string;
  legend: string;
  single?: boolean;
}) {
  return (
    <fieldset aria-describedby={describedBy} className="public-form__group">
      <legend className="public-form__legend">{legend}</legend>
      <div className={single ? 'public-form__stack' : 'public-form__grid'}>{children}</div>
    </fieldset>
  );
}

function Wide({ children }: { children: ReactNode }) {
  return <div className="public-form__wide">{children}</div>;
}

/**
 * A file control whose visible text follows the interface language.
 *
 * The native input stays in the page, focusable and labelled, but its own
 * browser-language button text is replaced by a real `<label>` that opens the
 * same picker. The chosen file's name is announced as the control's
 * description.
 */
function PublicFileField({
  accept,
  error,
  label,
  name,
  onClear,
  required,
}: {
  accept: string;
  error?: string;
  label: string;
  name: ApplicationFileSlot;
  onClear: (form: HTMLFormElement) => void;
  required: boolean;
}) {
  const { t } = useI18n();
  const inputId = useId();
  const labelId = `${inputId}-label`;
  const statusId = `${inputId}-status`;
  const errorId = `${inputId}-error`;
  const [fileName, setFileName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function clearFile(): void {
    const input = inputRef.current;
    if (!input?.form) return;
    input.value = '';
    setFileName(null);
    onClear(input.form);
    input.focus();
  }

  return (
    <div className="public-file" data-invalid={error ? 'true' : undefined}>
      <span className="ui-field__label" id={labelId}>
        {label}
        {required ? (
          <span aria-hidden="true"> *</span>
        ) : (
          <span className="public-file__optional" aria-hidden="true">
            {' '}
            {t('publicOpportunity.application.files.optional')}
          </span>
        )}
      </span>
      <div className="public-file__control">
        <input
          accept={accept}
          aria-describedby={error ? `${statusId} ${errorId}` : statusId}
          aria-invalid={error ? 'true' : undefined}
          aria-labelledby={labelId}
          className="public-file__input"
          id={inputId}
          name={name}
          onChange={(event) => setFileName(event.currentTarget.files?.[0]?.name ?? null)}
          ref={inputRef}
          required={required}
          type="file"
        />
        <label className="public-file__button" htmlFor={inputId}>
          {t('publicOpportunity.application.files.choose')}
        </label>
        <span className="public-file__name" id={statusId}>
          {fileName ?? t('publicOpportunity.application.files.none')}
        </span>
        {fileName ? (
          <Button
            aria-label={t('publicOpportunity.application.files.removeLabel', { document: label })}
            onClick={clearFile}
            variant="quiet"
          >
            {t('publicOpportunity.application.files.remove')}
          </Button>
        ) : null}
      </div>
      {error ? (
        <span className="ui-field__error" id={errorId} role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

function ConsentField({ error }: { error?: string }) {
  const { t } = useI18n();
  const controlId = useId();
  const errorId = `${controlId}-error`;

  return (
    <div className="public-consent" data-invalid={error ? 'true' : undefined}>
      <label className="public-consent__label" htmlFor={controlId}>
        <input
          aria-describedby={error ? errorId : undefined}
          aria-invalid={error ? 'true' : undefined}
          id={controlId}
          name="consentGranted"
          required
          type="checkbox"
        />
        <span>
          {t('publicOpportunity.application.consent')}
          <span aria-hidden="true"> *</span>
        </span>
      </label>
      {error ? (
        <span className="ui-field__error" id={errorId} role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

/**
 * Field errors are already announced beside their controls, so the summary for
 * them is static guidance. A refused submission is dynamic and is announced as
 * an alert. Neither ever contains backend text.
 */
function FormFeedback({
  failure,
  invalid,
}: {
  failure: PublicSubmissionFailure | null;
  invalid: boolean;
}) {
  const { t } = useI18n();

  if (invalid) {
    return (
      <InlineMessage title={t('publicOpportunity.validation.summaryTitle')} tone="danger">
        {t('publicOpportunity.validation.summary')}
      </InlineMessage>
    );
  }
  if (failure) {
    return (
      <InlineMessage
        announce
        title={t(
          failure === 'unconfirmed'
            ? 'publicOpportunity.feedback.unconfirmedTitle'
            : 'publicOpportunity.feedback.failureTitle',
        )}
        tone="danger"
      >
        {t(failureLabelKey(failure))}
      </InlineMessage>
    );
  }
  return null;
}
