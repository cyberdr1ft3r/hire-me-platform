import {
  CompanyBillingSettingsUpdateRequestSchema,
  InvoiceNumberBaselineRequestSchema,
  type InvoiceNumberBaselineRequest,
} from '@hire-me/contracts';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';

import { useI18n, type PlainMessageKey } from '../i18n/index.js';
import { Button, Checkbox, Drawer, InlineMessage, TextField } from '../ui/index.js';
import {
  billingWriteError,
  numberingOf,
  sameSeries,
  type BillingSettings,
  type Numbering,
} from './billing-settings-state.js';

export type NumberingChange =
  | { mode: 'numbering'; values: Numbering }
  | { mode: 'baseline'; values: InvoiceNumberBaselineRequest };

const fieldErrors = {
  invoicePrefix: 'admin.billing.prefixInvalid',
  invoiceDigits: 'admin.billing.digitsInvalid',
  invoiceNumberingEnabled: 'admin.billing.seriesRequired',
  year: 'admin.billing.yearInvalid',
  highestExternalNumber: 'admin.billing.highestInvalid',
} as const;

export function BillingNumberingDrawer({
  mode,
  onClose,
  onSave,
  settings,
}: {
  mode: NumberingChange['mode'];
  onClose: () => void;
  onSave: (change: NumberingChange) => Promise<void>;
  settings: BillingSettings;
}) {
  const { t } = useI18n();
  const formId = useId();
  const [prefix, setPrefix] = useState(settings.invoicePrefix ?? '');
  const [digits, setDigits] = useState(settings.invoiceDigits?.toString() ?? '');
  const [enabled, setEnabled] = useState(settings.invoiceNumberingEnabled);
  const [year, setYear] = useState('');
  const [highest, setHighest] = useState('');
  const [review, setReview] = useState<NumberingChange | null>(null);
  const [errors, setErrors] = useState<Partial<Record<string, PlainMessageKey>>>({});
  const [failure, setFailure] = useState<PlainMessageKey | null>(null);
  const [pending, setPending] = useState(false);
  const saving = useRef(false);
  const bodyHeading = useRef<HTMLHeadingElement>(null);
  const failureRef = useRef<HTMLDivElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const wentToReview = useRef(false);
  const baseline = mode === 'baseline';
  const currentYear = String(new Date().getUTCFullYear());
  const candidate = {
    invoicePrefix: prefix.trim() || null,
    invoiceDigits: digits === '' ? null : Number(digits),
    invoiceNumberingEnabled: enabled,
  };
  const dirty = baseline ? Boolean(year || highest) : !sameSeries(candidate, settings);

  useEffect(() => {
    if (review) {
      wentToReview.current = true;
      bodyHeading.current?.focus();
    } else if (wentToReview.current) {
      form.current?.querySelector('input')?.focus();
    }
  }, [review]);

  useEffect(() => {
    if (failure && !pending) failureRef.current?.focus();
  }, [failure, pending]);

  function showIssues(issues: ReadonlyArray<{ path: PropertyKey[] }>) {
    const next: Partial<Record<string, PlainMessageKey>> = {};
    for (const issue of issues) {
      const field = issue.path[0];
      if (typeof field === 'string' && Object.hasOwn(fieldErrors, field)) {
        next[field] = fieldErrors[field as keyof typeof fieldErrors];
      }
    }
    setErrors(next);
    const first = form.current?.elements.namedItem(Object.keys(next)[0] ?? '');
    if (first instanceof HTMLElement) first.focus();
  }

  function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || (!baseline && !dirty)) return;
    setFailure(null);
    setErrors({});
    if (baseline) {
      const input = InvoiceNumberBaselineRequestSchema.safeParse({
        year: year === '' ? NaN : Number(year),
        highestExternalNumber: highest === '' ? NaN : Number(highest),
        confirmed: true,
      });
      if (!input.success) {
        showIssues(input.error.issues);
        return;
      }
      if (
        settings.invoiceDigits &&
        input.data.highestExternalNumber >= 10 ** settings.invoiceDigits
      ) {
        setErrors({ highestExternalNumber: 'admin.billing.rangeExceeded' });
        const field = form.current?.elements.namedItem('highestExternalNumber');
        if (field instanceof HTMLElement) field.focus();
        return;
      }
      setReview({ mode: 'baseline', values: input.data });
    } else {
      const input = CompanyBillingSettingsUpdateRequestSchema.safeParse({
        ...settings,
        ...candidate,
      });
      if (!input.success) {
        showIssues(input.error.issues);
        return;
      }
      setReview({ mode: 'numbering', values: numberingOf(input.data) });
    }
  }

  async function confirm() {
    if (!review || saving.current) return;
    saving.current = true;
    setPending(true);
    setFailure(null);
    try {
      await onSave(review);
    } catch (error) {
      setFailure(billingWriteError(error));
    } finally {
      saving.current = false;
      setPending(false);
    }
  }

  function clearError(name: string) {
    setErrors((current) => ({ ...current, [name]: undefined }));
    setFailure(null);
  }

  function errorFor(name: string) {
    const key = errors[name];
    return key ? t(key) : undefined;
  }

  const displayedSeries = review?.mode === 'numbering' ? review.values : settings;
  const displayedYear = String(review?.mode === 'baseline' ? review.values.year : currentYear);
  const next = review?.mode === 'baseline' ? review.values.highestExternalNumber + 1 : null;
  const max = settings.invoiceDigits ? 10 ** settings.invoiceDigits - 1 : 0;
  const nextReference =
    next !== null && next <= max
      ? [
          settings.invoicePrefix,
          displayedYear,
          String(next).padStart(settings.invoiceDigits ?? 0, '0'),
        ].join('-')
      : null;

  return (
    <Drawer
      closeDisabled={pending}
      description={t(baseline ? 'admin.billing.baselineHelp' : 'admin.billing.numberingHelp')}
      dirty={dirty && !pending}
      footer={(requestClose) =>
        review ? (
          <>
            <Button
              disabled={pending}
              onClick={() => {
                setReview(null);
                setFailure(null);
              }}
              variant="secondary"
            >
              {t('admin.billing.backToEdit')}
            </Button>
            <Button
              loading={pending}
              loadingLabel={t('common.status.working')}
              onClick={() => void confirm()}
              variant="primary"
            >
              {t(
                review.mode === 'baseline'
                  ? 'admin.billing.confirmBaseline'
                  : 'admin.billing.confirmNumbering',
              )}
            </Button>
          </>
        ) : (
          <>
            <Button onClick={requestClose} variant="secondary">
              {t('common.actions.cancel')}
            </Button>
            <Button disabled={!baseline && !dirty} form={formId} type="submit">
              {t(baseline ? 'admin.billing.reviewBaseline' : 'admin.billing.reviewNumbering')}
            </Button>
          </>
        )
      }
      onClose={onClose}
      title={t(baseline ? 'admin.billing.baselineTitle' : 'admin.billing.editNumbering')}
    >
      {failure ? (
        <div ref={failureRef} tabIndex={-1}>
          <InlineMessage announce title={t(failure)} tone="danger">
            {null}
          </InlineMessage>
        </div>
      ) : null}
      {review ? (
        <div className="billing-settings__editor">
          <h3 ref={bodyHeading} tabIndex={-1}>
            {t('admin.billing.reviewTitle')}
          </h3>
          <dl className="billing-settings__values">
            <div>
              <dt>{t('admin.billing.invoicePrefix')}</dt>
              <dd>{displayedSeries.invoicePrefix ?? t('admin.billing.missing')}</dd>
            </div>
            <div>
              <dt>{t('admin.billing.invoiceDigits')}</dt>
              <dd>{displayedSeries.invoiceDigits ?? t('admin.billing.missing')}</dd>
            </div>
            {review.mode === 'baseline' ? (
              <>
                <div>
                  <dt>{t('admin.billing.year')}</dt>
                  <dd>{displayedYear}</dd>
                </div>
                <div>
                  <dt>{t('admin.billing.externalHighest')}</dt>
                  <dd>{review.values.highestExternalNumber}</dd>
                </div>
              </>
            ) : (
              <div>
                <dt>{t('admin.billing.state')}</dt>
                <dd>
                  {t(
                    review.values.invoiceNumberingEnabled
                      ? 'admin.billing.enabled'
                      : 'admin.billing.disabled',
                  )}
                </dd>
              </div>
            )}
          </dl>
          {review.mode === 'baseline' ? (
            <p>
              {nextReference
                ? t('admin.billing.nextReference', { reference: nextReference })
                : t('admin.billing.exhausted')}
            </p>
          ) : (
            <p>
              {review.values.invoiceNumberingEnabled
                ? t('admin.billing.enableConsequence', { year: currentYear })
                : t('admin.billing.disableConsequence')}
            </p>
          )}
        </div>
      ) : (
        <form
          className="billing-settings__editor"
          id={formId}
          noValidate
          ref={form}
          onSubmit={prepare}
        >
          {baseline ? (
            <>
              <p>
                {t('admin.billing.savedSeries', {
                  prefix: settings.invoicePrefix ?? '',
                  digits: settings.invoiceDigits ?? 0,
                })}
              </p>
              <TextField
                name="year"
                label={t('admin.billing.year')}
                type="number"
                min={2000}
                max={2200}
                required
                value={year}
                error={errorFor('year')}
                onChange={(event) => {
                  setYear(event.currentTarget.value);
                  clearError('year');
                }}
              />
              <TextField
                name="highestExternalNumber"
                label={t('admin.billing.externalHighest')}
                hint={t('admin.billing.highestHelp')}
                type="number"
                min={0}
                required
                value={highest}
                error={errorFor('highestExternalNumber')}
                onChange={(event) => {
                  setHighest(event.currentTarget.value);
                  clearError('highestExternalNumber');
                }}
              />
            </>
          ) : (
            <>
              <TextField
                name="invoicePrefix"
                label={t('admin.billing.invoicePrefix')}
                hint={t('admin.billing.prefixInvalid')}
                error={errorFor('invoicePrefix')}
                value={prefix}
                maxLength={10}
                required={enabled}
                onChange={(event) => {
                  setPrefix(event.currentTarget.value.toUpperCase());
                  clearError('invoicePrefix');
                }}
              />
              <TextField
                name="invoiceDigits"
                label={t('admin.billing.invoiceDigits')}
                hint={t('admin.billing.digitsInvalid')}
                error={errorFor('invoiceDigits')}
                type="number"
                min={3}
                max={8}
                value={digits}
                required={enabled}
                onChange={(event) => {
                  setDigits(event.currentTarget.value);
                  clearError('invoiceDigits');
                }}
              />
              <Checkbox
                name="invoiceNumberingEnabled"
                label={t('admin.billing.numberingEnabled')}
                hint={t('admin.billing.enableConsequence', { year: currentYear })}
                checked={enabled}
                aria-invalid={errors.invoiceNumberingEnabled ? true : undefined}
                onChange={(event) => {
                  setEnabled(event.currentTarget.checked);
                  clearError('invoiceNumberingEnabled');
                }}
              />
              {errors.invoiceNumberingEnabled ? (
                <InlineMessage announce tone="danger" title={t(errors.invoiceNumberingEnabled)}>
                  {null}
                </InlineMessage>
              ) : null}
            </>
          )}
        </form>
      )}
    </Drawer>
  );
}
