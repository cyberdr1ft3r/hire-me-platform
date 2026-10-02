import type {
  InvoiceSettlement,
  PaymentAllocationCreateRequest,
  PaymentCorrectRequest,
  PaymentDetail,
  PaymentMethod,
  PaymentUpdateRequest,
} from '@hire-me/contracts';
import { useEffect, useRef, useState, type FormEvent } from 'react';

import { getInvoiceSettlement } from '../api.js';
import { CommercialOptionPicker } from '../commercial/CommercialOptionPicker.js';
import { Button, InlineMessage, Select, StatusBadge, TextArea, TextField } from '../ui/index.js';
import type { AccountingAccess } from './accounting-access.js';
import { recordStatusTone, settlementTone, useAccountingFormat } from './accounting-labels.js';
import type {
  AccountingLoaders,
  AccountingSession,
  AccountingWriteAction,
} from './accounting-session.js';
import {
  allocationIdempotencyKey,
  centsToInput,
  PAYMENT_METHODS,
  paymentEditValues,
  toAllocation,
  toCorrection,
  toPaymentUpdateRequest,
  type CorrectionValues,
  type DetailState,
  type FormErrors,
  type PaymentEditValues,
  type PickerOption,
} from './accounting-state.js';
import { DateText, ErrorBlock, Fact, HistoryList, LoadingBlock, Money } from './AccountingParts.js';

export type PaymentActions = {
  allocate: (input: PaymentAllocationCreateRequest) => Promise<boolean>;
  archive: () => Promise<boolean>;
  correct: (input: PaymentCorrectRequest) => Promise<boolean>;
  reverse: (allocationId: string, reason: string) => Promise<boolean>;
  update: (input: PaymentUpdateRequest) => Promise<boolean>;
};

/** An invoice the operator intends to settle with the selected payment. */
export type PendingAllocation = { invoice: PickerOption; outstandingCents: number | null };

type Mode =
  | { kind: 'none' }
  | { kind: 'edit' }
  | { kind: 'correct' }
  | { kind: 'archive' }
  | { kind: 'allocate' }
  | { kind: 'reverse'; allocationId: string };

export function PaymentDetailView({
  access,
  actions,
  allocationIntent,
  focusToken,
  loaders,
  onRetry,
  pending,
  selectedId,
  session,
  state,
}: {
  access: AccountingAccess;
  actions: PaymentActions;
  allocationIntent: PendingAllocation | null;
  focusToken: number;
  loaders: AccountingLoaders;
  onRetry: () => void;
  pending: AccountingWriteAction | null;
  selectedId: string | null;
  session: AccountingSession;
  state: DetailState<PaymentDetail>;
}) {
  const { message, t } = useAccountingFormat();

  if (!selectedId || state.status === 'idle') {
    return (
      <p className="accounting-muted accounting-detail__prompt">
        {t('accounting.payments.detail.selectPrompt')}
      </p>
    );
  }
  if (state.status === 'loading') {
    return <LoadingBlock label={t('accounting.payments.detail.loading')} />;
  }
  if (state.status === 'error') {
    return (
      <ErrorBlock
        body={message(state.messageKey)}
        onRetry={onRetry}
        title={t('accounting.payments.detail.errorTitle')}
      />
    );
  }
  const payment = state.detail;
  return (
    <PaymentRecord
      access={access}
      actions={actions}
      allocationIntent={allocationIntent}
      focusToken={focusToken}
      key={`${payment.id}:${payment.status}:${payment.updatedAt}`}
      loaders={loaders}
      payment={payment}
      pending={pending}
      session={session}
    />
  );
}

function PaymentRecord({
  access,
  actions,
  allocationIntent,
  focusToken,
  loaders,
  payment,
  pending,
  session,
}: {
  access: AccountingAccess;
  actions: PaymentActions;
  allocationIntent: PendingAllocation | null;
  focusToken: number;
  loaders: AccountingLoaders;
  payment: PaymentDetail;
  pending: AccountingWriteAction | null;
  session: AccountingSession;
}) {
  const format = useAccountingFormat();
  const { formatDate, formatDateTime, method, recordStatus, t } = format;
  const heading = useRef<HTMLHeadingElement>(null);
  const archived = payment.status === 'ARCHIVED' || payment.archivedAt !== null;
  const amounts = payment.amounts;
  const canAllocate =
    access.payments.allocate && !archived && amounts !== null && amounts.unallocatedCents > 0;
  const [mode, setMode] = useState<Mode>(
    allocationIntent && canAllocate ? { kind: 'allocate' } : { kind: 'none' },
  );
  const writesLocked = pending !== null;
  const activeAllocations = payment.allocations.filter(
    (allocation) => allocation.status === 'ACTIVE',
  );

  useEffect(() => {
    if (focusToken > 0) heading.current?.focus();
  }, [focusToken]);

  const available = !archived
    ? {
        edit: access.payments.edit,
        correct: access.payments.correct && amounts !== null,
        archive: access.payments.archive,
      }
    : { edit: false, correct: false, archive: false };
  const hasActions = available.edit || available.correct || available.archive || canAllocate;

  return (
    <article aria-labelledby="accounting-payment-title" className="accounting-detail">
      <header className="accounting-detail__heading">
        <p className="accounting-detail__kind">{t('accounting.payments.detail.kind')}</p>
        <h2
          className="accounting-detail__title"
          id="accounting-payment-title"
          ref={heading}
          tabIndex={-1}
        >
          {payment.reference}
        </h2>
        <StatusBadge tone={recordStatusTone(payment.status)}>
          {recordStatus(payment.status)}
        </StatusBadge>
      </header>

      <dl className="accounting-facts">
        <Fact label={t('accounting.form.client')}>{payment.display.clientName}</Fact>
        <Fact label={t('accounting.payments.form.receivedDate')}>
          <DateText value={payment.receivedDate} />
        </Fact>
        <Fact label={t('accounting.payments.form.method')}>{method(payment.method)}</Fact>
        <Fact label={t('accounting.payments.form.externalReference')}>
          {payment.externalReference ? (
            <span className="accounting-break">{payment.externalReference}</span>
          ) : (
            <span className="accounting-muted">{t('accounting.common.notSet')}</span>
          )}
        </Fact>
      </dl>
      {payment.note ? (
        <div className="accounting-note">
          <h3 className="accounting-section__subtitle">{t('accounting.payments.form.note')}</h3>
          <p>{payment.note}</p>
        </div>
      ) : null}

      <section aria-labelledby="accounting-payment-amounts" className="accounting-section">
        <h3 className="accounting-section__title" id="accounting-payment-amounts">
          {t('accounting.payments.detail.amountsTitle')}
        </h3>
        {amounts ? (
          <dl className="accounting-amounts">
            <Fact label={t('accounting.payments.detail.received')}>
              <Money cents={amounts.amountCents} currency={amounts.currency} strong />
            </Fact>
            <Fact label={t('accounting.payments.detail.allocated')}>
              <Money cents={amounts.allocatedCents} currency={amounts.currency} />
            </Fact>
            <Fact label={t('accounting.payments.detail.unallocated')}>
              <Money cents={amounts.unallocatedCents} currency={amounts.currency} />
            </Fact>
          </dl>
        ) : (
          <p className="accounting-muted">{t('accounting.notices.amountsHidden.body')}</p>
        )}
        {payment.correctedAt ? (
          <p className="accounting-muted">
            {t('accounting.payments.detail.correctedOn', {
              date: formatDate(payment.correctedAt),
            })}
            {payment.correctionReason ? (
              <>
                {' '}
                <span className="accounting-break">{payment.correctionReason}</span>
              </>
            ) : null}
          </p>
        ) : null}
      </section>

      {hasActions ? (
        <section aria-labelledby="accounting-payment-actions" className="accounting-section">
          <h3 className="accounting-section__title" id="accounting-payment-actions">
            {t('accounting.payments.detail.actionsTitle')}
          </h3>
          {mode.kind === 'none' || mode.kind === 'reverse' ? (
            <div
              aria-label={t('accounting.payments.detail.actionsLabel')}
              className="accounting-actions"
              role="group"
            >
              {canAllocate ? (
                <Button
                  disabled={writesLocked}
                  onClick={() => setMode({ kind: 'allocate' })}
                  size="compact"
                >
                  {t('accounting.payments.actions.allocate')}
                </Button>
              ) : null}
              {available.edit ? (
                <Button
                  disabled={writesLocked}
                  onClick={() => setMode({ kind: 'edit' })}
                  size="compact"
                  variant="secondary"
                >
                  {t('accounting.payments.actions.edit')}
                </Button>
              ) : null}
              {available.correct ? (
                <Button
                  disabled={writesLocked}
                  onClick={() => setMode({ kind: 'correct' })}
                  size="compact"
                  variant="secondary"
                >
                  {t('accounting.payments.actions.correct')}
                </Button>
              ) : null}
              {available.archive ? (
                <Button
                  disabled={writesLocked || activeAllocations.length > 0}
                  onClick={() => setMode({ kind: 'archive' })}
                  size="compact"
                  variant="quiet"
                >
                  {t('accounting.payments.actions.archive')}
                </Button>
              ) : null}
            </div>
          ) : null}
          {available.archive && activeAllocations.length > 0 && mode.kind === 'none' ? (
            <p className="accounting-muted">{t('accounting.payments.detail.archiveBlocked')}</p>
          ) : null}
          {mode.kind === 'allocate' && amounts ? (
            <AllocationForm
              initial={allocationIntent}
              loadInvoices={loaders.issuedInvoices(payment.clientId, amounts.currency)}
              onCancel={() => setMode({ kind: 'none' })}
              onSubmit={actions.allocate}
              payment={payment}
              pending={pending}
              session={session}
              unallocatedCents={amounts.unallocatedCents}
            />
          ) : null}
          {mode.kind === 'edit' ? (
            <PaymentEditForm
              onCancel={() => setMode({ kind: 'none' })}
              onSubmit={actions.update}
              payment={payment}
              pending={pending}
            />
          ) : null}
          {mode.kind === 'correct' && amounts ? (
            <CorrectionForm
              allocatedCents={amounts.allocatedCents}
              currency={amounts.currency}
              initialCents={amounts.amountCents}
              onCancel={() => setMode({ kind: 'none' })}
              onSubmit={actions.correct}
              pending={pending}
            />
          ) : null}
          {mode.kind === 'archive' ? (
            <ConfirmPanel
              body={t('accounting.payments.confirmArchive', { reference: payment.reference })}
              label={t('accounting.payments.actions.archive')}
              onCancel={() => setMode({ kind: 'none' })}
              onConfirm={actions.archive}
              pending={pending === 'archive'}
              writesLocked={writesLocked}
            />
          ) : null}
        </section>
      ) : null}

      <section aria-labelledby="accounting-payment-allocations" className="accounting-section">
        <h3 className="accounting-section__title" id="accounting-payment-allocations">
          {t('accounting.payments.allocations.title')}
        </h3>
        {payment.allocations.length === 0 ? (
          <p className="accounting-muted">{t('accounting.payments.allocations.empty')}</p>
        ) : (
          <div className="accounting-list">
            <table
              aria-labelledby="accounting-payment-allocations"
              className="accounting-table accounting-table--compact"
            >
              <thead>
                <tr>
                  <th scope="col">{t('accounting.payments.allocations.invoice')}</th>
                  <th scope="col">{t('accounting.payments.allocations.status')}</th>
                  <th className="accounting-table__amount" scope="col">
                    {t('accounting.payments.allocations.amount')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {payment.allocations.map((allocation) => (
                  <tr key={allocation.id}>
                    <th scope="row">
                      {allocation.display.invoiceReference ?? (
                        <span className="accounting-muted">
                          {t('accounting.payments.allocations.restricted')}
                        </span>
                      )}
                      <span className="accounting-table__secondary">
                        <time dateTime={allocation.createdAt}>
                          {formatDateTime(allocation.createdAt)}
                        </time>
                      </span>
                      {allocation.reversalReason ? (
                        <span className="accounting-table__secondary accounting-break">
                          {allocation.reversalReason}
                        </span>
                      ) : null}
                      {allocation.status === 'ACTIVE' && access.payments.reverse && !archived ? (
                        mode.kind === 'reverse' && mode.allocationId === allocation.id ? (
                          <ReverseForm
                            onCancel={() => setMode({ kind: 'none' })}
                            onSubmit={(reason) => actions.reverse(allocation.id, reason)}
                            pending={pending}
                            reference={allocation.display.invoiceReference}
                          />
                        ) : (
                          <Button
                            disabled={writesLocked}
                            onClick={() =>
                              setMode({ allocationId: allocation.id, kind: 'reverse' })
                            }
                            size="compact"
                            variant="quiet"
                          >
                            {t('accounting.payments.actions.reverse')}
                          </Button>
                        )
                      ) : null}
                    </th>
                    <td data-label={t('accounting.payments.allocations.status')}>
                      <StatusBadge tone={allocation.status === 'ACTIVE' ? 'success' : 'neutral'}>
                        {format.allocationStatus(allocation.status)}
                      </StatusBadge>
                    </td>
                    <td
                      className="accounting-table__amount u-tabular"
                      data-label={t('accounting.payments.allocations.amount')}
                    >
                      <Money cents={allocation.amountCents} currency={amounts?.currency} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <HistoryList events={payment.history} id="accounting-payment-history" />
      <p className="accounting-muted">
        {t('accounting.common.updated')}{' '}
        <time dateTime={payment.updatedAt}>{formatDateTime(payment.updatedAt)}</time>
      </p>
    </article>
  );
}

export function ConfirmPanel({
  body,
  label,
  onCancel,
  onConfirm,
  pending,
  writesLocked,
}: {
  body: string;
  label: string;
  onCancel: () => void;
  onConfirm: () => Promise<boolean>;
  pending: boolean;
  writesLocked: boolean;
}) {
  const { t } = useAccountingFormat();
  return (
    <div aria-label={label} className="accounting-form accounting-form--panel" role="group">
      <p className="accounting-message__text">{body}</p>
      <div className="accounting-actions">
        <Button
          disabled={writesLocked}
          loading={pending}
          loadingLabel={t('common.status.working')}
          onClick={() => void onConfirm()}
          size="compact"
          variant="danger"
        >
          {label}
        </Button>
        <Button onClick={onCancel} size="compact" variant="quiet">
          {t('accounting.form.back')}
        </Button>
      </div>
    </div>
  );
}

export function CorrectionForm({
  allocatedCents,
  currency,
  initialCents,
  onCancel,
  onSubmit,
  pending,
}: {
  allocatedCents?: number;
  currency: string;
  initialCents: number;
  onCancel: () => void;
  onSubmit: (input: { amountCents: number; correctionReason: string }) => Promise<boolean>;
  pending: AccountingWriteAction | null;
}) {
  const { message, money, t } = useAccountingFormat();
  const [values, setValues] = useState<CorrectionValues>({
    amount: centsToInput(initialCents),
    reason: '',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const error = (field: string) => (errors[field] ? message(errors[field]) : undefined);

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const built = toCorrection(values);
    if (!built.ok) {
      setErrors(built.errors);
      return;
    }
    void onSubmit(built.value);
  }

  return (
    <form
      aria-label={t('accounting.correction.title')}
      className="accounting-form accounting-form--panel"
      noValidate
      onSubmit={submit}
    >
      <p className="accounting-message__text">{t('accounting.correction.body')}</p>
      <div className="accounting-form__grid">
        <TextField
          autoComplete="off"
          error={error('amount')}
          hint={
            allocatedCents && allocatedCents > 0
              ? t('accounting.correction.allocatedHint', {
                  amount: money(allocatedCents, currency),
                })
              : t('accounting.form.amountHint')
          }
          inputMode="decimal"
          label={t('accounting.correction.amount', { currency })}
          onChange={(event) => {
            setErrors((current) => ({ ...current, amount: undefined }));
            setValues({ ...values, amount: event.currentTarget.value });
          }}
          required
          value={values.amount}
        />
      </div>
      <TextArea
        error={error('reason')}
        hint={t('accounting.correction.reasonHint')}
        label={t('accounting.correction.reason')}
        maxLength={500}
        onChange={(event) => {
          setErrors((current) => ({ ...current, reason: undefined }));
          setValues({ ...values, reason: event.currentTarget.value });
        }}
        required
        rows={3}
        value={values.reason}
      />
      <div className="accounting-actions">
        <Button
          disabled={pending !== null}
          loading={pending === 'correct'}
          loadingLabel={t('common.status.working')}
          size="compact"
          type="submit"
        >
          {t('accounting.correction.submit')}
        </Button>
        <Button onClick={onCancel} size="compact" variant="quiet">
          {t('accounting.form.back')}
        </Button>
      </div>
    </form>
  );
}

function PaymentEditForm({
  onCancel,
  onSubmit,
  payment,
  pending,
}: {
  onCancel: () => void;
  onSubmit: (input: PaymentUpdateRequest) => Promise<boolean>;
  payment: PaymentDetail;
  pending: AccountingWriteAction | null;
}) {
  const { message, method, t } = useAccountingFormat();
  const [values, setValues] = useState<PaymentEditValues>(() => paymentEditValues(payment));
  const [errors, setErrors] = useState<FormErrors>({});

  function set<Field extends keyof PaymentEditValues>(
    field: Field,
    value: PaymentEditValues[Field],
  ): void {
    setErrors({});
    setValues({ ...values, [field]: value });
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const built = toPaymentUpdateRequest(payment, values);
    if (!built.ok) {
      setErrors(built.errors);
      return;
    }
    void onSubmit(built.value);
  }

  return (
    <form
      aria-label={t('accounting.payments.actions.edit')}
      className="accounting-form accounting-form--panel"
      noValidate
      onSubmit={submit}
    >
      <div className="accounting-form__grid">
        <TextField
          error={errors.receivedDate ? message(errors.receivedDate) : undefined}
          label={t('accounting.payments.form.receivedDate')}
          onChange={(event) => set('receivedDate', event.currentTarget.value)}
          required
          type="date"
          value={values.receivedDate}
        />
        <Select
          label={t('accounting.payments.form.method')}
          onChange={(event) => set('method', event.currentTarget.value as PaymentMethod)}
          value={values.method}
        >
          {PAYMENT_METHODS.map((option) => (
            <option key={option} value={option}>
              {method(option)}
            </option>
          ))}
        </Select>
        <TextField
          autoComplete="off"
          hint={t('accounting.payments.form.externalReferenceHint')}
          label={t('accounting.payments.form.externalReference')}
          maxLength={140}
          onChange={(event) => set('externalReference', event.currentTarget.value)}
          value={values.externalReference}
        />
      </div>
      <TextArea
        label={t('accounting.payments.form.note')}
        maxLength={2000}
        onChange={(event) => set('note', event.currentTarget.value)}
        rows={3}
        value={values.note}
      />
      {errors.form ? (
        <p className="ui-field__error" role="alert">
          {message(errors.form)}
        </p>
      ) : null}
      <div className="accounting-actions">
        <Button
          disabled={pending !== null}
          loading={pending === 'update'}
          loadingLabel={t('common.status.working')}
          size="compact"
          type="submit"
        >
          {t('accounting.form.save')}
        </Button>
        <Button onClick={onCancel} size="compact" variant="quiet">
          {t('accounting.form.back')}
        </Button>
      </div>
    </form>
  );
}

type SettlementState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; settlement: InvoiceSettlement };

/**
 * Allocate the payment to one ISSUED invoice of the same client and currency,
 * chosen by reference. The invoice's remaining balance comes from the server's
 * settlement endpoint; the browser never derives it.
 */
function AllocationForm({
  initial,
  loadInvoices,
  onCancel,
  onSubmit,
  payment,
  pending,
  session,
  unallocatedCents,
}: {
  initial: PendingAllocation | null;
  loadInvoices: ReturnType<AccountingLoaders['issuedInvoices']>;
  onCancel: () => void;
  onSubmit: (input: PaymentAllocationCreateRequest) => Promise<boolean>;
  payment: PaymentDetail;
  pending: AccountingWriteAction | null;
  session: AccountingSession;
  unallocatedCents: number;
}) {
  const { message, money, settlement: settlementLabel, t } = useAccountingFormat();
  const currency = payment.amounts?.currency ?? '';
  const [invoice, setInvoice] = useState<PickerOption | null>(initial?.invoice ?? null);
  const [amount, setAmount] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [settlement, setSettlement] = useState<SettlementState>({ status: 'idle' });
  const settlementRequest = useRef(0);
  const attempt = useRef<{ signature: string; key: string } | null>(null);

  useEffect(() => {
    if (initial?.invoice) void chooseInvoice(initial.invoice);
    return () => {
      settlementRequest.current += 1;
    };
  }, []);

  async function chooseInvoice(next: PickerOption | null): Promise<void> {
    setInvoice(next);
    setErrors({});
    const request = ++settlementRequest.current;
    if (!next) {
      setSettlement({ status: 'idle' });
      return;
    }
    const isCurrent = session.capture();
    setSettlement({ status: 'loading' });
    try {
      const response = await getInvoiceSettlement(session.token(), next.id);
      if (request !== settlementRequest.current || !isCurrent()) return;
      setSettlement({ status: 'ready', settlement: response.settlement });
      const outstanding = response.settlement.amounts?.outstandingCents ?? null;
      if (outstanding !== null) {
        setAmount(centsToInput(Math.max(0, Math.min(outstanding, unallocatedCents))));
      }
    } catch {
      if (request === settlementRequest.current && isCurrent()) setSettlement({ status: 'error' });
    }
  }

  const outstanding =
    settlement.status === 'ready' ? (settlement.settlement.amounts?.outstandingCents ?? null) : null;
  const settled = outstanding !== null && outstanding <= 0;

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const built = toAllocation({ amount, invoice });
    if (!built.ok) {
      setErrors(built.errors);
      return;
    }
    const signature = `${built.value.invoiceId}:${built.value.amountCents}`;
    if (attempt.current?.signature !== signature) {
      attempt.current = { key: allocationIdempotencyKey(), signature };
    }
    void onSubmit({ ...built.value, idempotencyKey: attempt.current.key });
  }

  return (
    <form
      aria-label={t('accounting.allocation.title')}
      className="accounting-form accounting-form--panel"
      noValidate
      onSubmit={submit}
    >
      <p className="accounting-message__text">
        {t('accounting.allocation.body', {
          amount: money(unallocatedCents, currency),
          client: payment.display.clientName,
        })}
      </p>
      <CommercialOptionPicker
        error={errors.invoice ? message(errors.invoice) : undefined}
        hint={t('accounting.allocation.invoiceHint', { currency })}
        label={t('accounting.allocation.invoice')}
        loadOptions={loadInvoices}
        onChange={(option) => void chooseInvoice(option)}
        required
        sourceKey={`${session.key}:${payment.id}:invoices`}
        value={invoice}
      />
      {settlement.status === 'loading' ? (
        <p aria-live="polite" className="accounting-muted">
          {t('accounting.allocation.settlementLoading')}
        </p>
      ) : null}
      {settlement.status === 'error' ? (
        <p className="ui-field__error">{t('accounting.allocation.settlementError')}</p>
      ) : null}
      {settlement.status === 'ready' ? (
        <dl aria-live="polite" className="accounting-amounts">
          <Fact label={t('accounting.allocation.invoiceState')}>
            <StatusBadge tone={settlementTone(settlement.settlement.settlementState)}>
              {settlementLabel(settlement.settlement.settlementState)}
            </StatusBadge>
          </Fact>
          <Fact label={t('accounting.allocation.invoiceTotal')}>
            <Money
              cents={settlement.settlement.amounts?.totalCents}
              currency={settlement.settlement.amounts?.currency}
            />
          </Fact>
          <Fact label={t('accounting.allocation.invoiceOutstanding')}>
            <Money cents={outstanding} currency={settlement.settlement.amounts?.currency} strong />
          </Fact>
        </dl>
      ) : null}
      {settled ? (
        <InlineMessage title={t('accounting.allocation.settledTitle')} tone="info">
          <p className="accounting-message__text">{t('accounting.allocation.settledBody')}</p>
        </InlineMessage>
      ) : null}
      <div className="accounting-form__grid">
        <TextField
          autoComplete="off"
          error={errors.amount ? message(errors.amount) : undefined}
          hint={t('accounting.allocation.amountHint')}
          inputMode="decimal"
          label={t('accounting.allocation.amount', { currency })}
          onChange={(event) => {
            setErrors((current) => ({ ...current, amount: undefined }));
            setAmount(event.currentTarget.value);
          }}
          required
          value={amount}
        />
      </div>
      <div className="accounting-actions">
        <Button
          disabled={pending !== null || settled}
          loading={pending === 'allocate'}
          loadingLabel={t('common.status.working')}
          size="compact"
          type="submit"
        >
          {t('accounting.allocation.submit')}
        </Button>
        <Button onClick={onCancel} size="compact" variant="quiet">
          {t('accounting.form.back')}
        </Button>
      </div>
    </form>
  );
}

function ReverseForm({
  onCancel,
  onSubmit,
  pending,
  reference,
}: {
  onCancel: () => void;
  onSubmit: (reason: string) => Promise<boolean>;
  pending: AccountingWriteAction | null;
  reference: string | null;
}) {
  const { t } = useAccountingFormat();
  const [reason, setReason] = useState('');
  const [missing, setMissing] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const trimmed = reason.trim();
    if (!trimmed) {
      setMissing(true);
      return;
    }
    void onSubmit(trimmed.slice(0, 500));
  }

  return (
    <form
      aria-label={t('accounting.payments.actions.reverse')}
      className="accounting-form accounting-form--panel"
      noValidate
      onSubmit={submit}
    >
      <p className="accounting-message__text">
        {reference
          ? t('accounting.reverse.body', { reference })
          : t('accounting.reverse.bodyRestricted')}
      </p>
      <TextArea
        error={missing ? t('accounting.form.errors.reason') : undefined}
        hint={t('accounting.correction.reasonHint')}
        label={t('accounting.reverse.reason')}
        maxLength={500}
        onChange={(event) => {
          setMissing(false);
          setReason(event.currentTarget.value);
        }}
        required
        rows={2}
        value={reason}
      />
      <div className="accounting-actions">
        <Button
          disabled={pending !== null}
          loading={pending === 'reverse'}
          loadingLabel={t('common.status.working')}
          size="compact"
          type="submit"
          variant="danger"
        >
          {t('accounting.reverse.submit')}
        </Button>
        <Button onClick={onCancel} size="compact" variant="quiet">
          {t('accounting.form.back')}
        </Button>
      </div>
    </form>
  );
}