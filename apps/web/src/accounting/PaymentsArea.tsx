import type {
  PaymentDetail,
  PaymentMethod,
  PaymentRecordStatus,
  PaymentSummary,
} from '@hire-me/contracts';
import { useEffect, useRef, useState, type FormEvent } from 'react';

import {
  allocatePayment,
  archivePayment,
  correctPayment,
  createPayment,
  getPayment,
  listPayments,
  reversePaymentAllocation,
  updatePayment,
} from '../api.js';
import { ListPagination } from '../clients/ListPagination.js';
import { CommercialOptionPicker } from '../commercial/CommercialOptionPicker.js';
import type { MessageKey } from '../i18n/index.js';
import {
  Button,
  Checkbox,
  EmptyState,
  InlineMessage,
  Select,
  StatusBadge,
  TextArea,
  TextField,
} from '../ui/index.js';
import { recordStatusTone, useAccountingFormat } from './accounting-labels.js';
import type { AccountingWriteAction, AreaProps, PaymentPrefill } from './accounting-session.js';
import {
  accountingFailureKey,
  centsToInput,
  emptyPaymentForm,
  EMPTY_PAYMENT_FILTERS,
  hasPaymentFilters,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  pageCount,
  paymentListOptions,
  toPaymentCreateRequest,
  type AccountingFeedback,
  type DetailState,
  type FormErrors,
  type ListQuery,
  type ListState,
  type PaymentFilters,
  type PaymentFormValues,
  type PickerOption,
} from './accounting-state.js';
import { DateText, ErrorBlock, FeedbackMessage, LoadingBlock, Money } from './AccountingParts.js';
import { PaymentDetailView, type PaymentActions, type PendingAllocation } from './PaymentDetail.js';

type Scope = 'area' | 'record';

const FIRST_QUERY: ListQuery<PaymentFilters> = { page: 1, filters: EMPTY_PAYMENT_FILTERS };

type CreateDraft = {
  values: PaymentFormValues;
  focusToken: number;
  /** The invoice a Client balances hand-off asked to settle once the payment exists. */
  invoice: PendingAllocation | null;
};

export function PaymentsArea({
  access,
  loaders,
  onPrefillConsumed,
  prefill,
  session,
}: AreaProps & { prefill: PaymentPrefill | null; onPrefillConsumed: () => void }) {
  const { t } = useAccountingFormat();
  const canList = access.clients;
  const listRequest = useRef(0);
  const detailRequest = useRef(0);
  const recordGeneration = useRef(0);
  const selectedRef = useRef<string | null>(null);
  const queryRef = useRef(FIRST_QUERY);
  const mounted = useRef(true);

  const [filters, setFilters] = useState(EMPTY_PAYMENT_FILTERS);
  const [query, setQuery] = useState(FIRST_QUERY);
  const [list, setList] = useState<ListState<PaymentSummary>>({
    status: canList ? 'loading' : 'idle',
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailState<PaymentDetail>>({ status: 'idle' });
  const [focusToken, setFocusToken] = useState(0);
  const [draft, setDraft] = useState<CreateDraft | null>(null);
  const [allocationIntent, setAllocationIntent] = useState<PendingAllocation | null>(null);
  const [feedback, setFeedback] = useState<AccountingFeedback | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      listRequest.current += 1;
      detailRequest.current += 1;
    };
  }, []);

  useEffect(() => {
    if (!canList) return;
    void loadList(query);
    return () => {
      listRequest.current += 1;
    };
  }, [canList, query]);

  useEffect(() => {
    if (!prefill || !access.payments.record) return;
    setFeedback(null);
    setDraft((current) => ({
      focusToken: (current?.focusToken ?? 0) + 1,
      invoice: { invoice: prefill.invoice, outstandingCents: prefill.outstandingCents },
      values: emptyPaymentForm({
        amount: prefill.outstandingCents ? centsToInput(prefill.outstandingCents) : '',
        client: prefill.client,
        currency: prefill.currency,
      }),
    }));
    onPrefillConsumed();
  }, [prefill?.token]);

  function capture(scope: Scope): () => boolean {
    const sameSession = session.capture();
    const record = recordGeneration.current;
    return () =>
      mounted.current && sameSession() && (scope === 'area' || recordGeneration.current === record);
  }

  async function loadList(forQuery: ListQuery<PaymentFilters>, quiet = false): Promise<void> {
    const request = ++listRequest.current;
    const isCurrent = capture('area');
    if (!quiet) setList({ status: 'loading' });
    try {
      const response = await listPayments(session.token(), paymentListOptions(forQuery));
      if (request !== listRequest.current || !isCurrent()) return;
      const { page, pageSize, total } = response.pagination;
      if (response.payments.length === 0 && total > 0 && page > 1) {
        applyQuery({ ...forQuery, page: Math.min(page - 1, pageCount(total, pageSize)) });
        return;
      }
      setList({ status: 'ready', items: response.payments, page, pageSize, total });
    } catch {
      if (request === listRequest.current && isCurrent() && !quiet) setList({ status: 'error' });
    }
  }

  async function loadDetail(id: string, quiet = false): Promise<void> {
    const request = ++detailRequest.current;
    const isCurrent = capture('record');
    if (!quiet) setDetail({ status: 'loading' });
    try {
      const response = await getPayment(session.token(), id);
      if (request !== detailRequest.current || !isCurrent() || selectedRef.current !== id) return;
      setDetail({ status: 'ready', detail: response.payment });
    } catch (error) {
      if (request !== detailRequest.current || !isCurrent() || selectedRef.current !== id) return;
      if (!quiet) setDetail({ status: 'error', messageKey: accountingFailureKey(error) });
    }
  }

  function applyQuery(next: ListQuery<PaymentFilters>): void {
    queryRef.current = next;
    setQuery(next);
  }

  function clearSelection(): void {
    recordGeneration.current += 1;
    detailRequest.current += 1;
    selectedRef.current = null;
    setSelectedId(null);
    setDetail({ status: 'idle' });
    setAllocationIntent(null);
  }

  function select(id: string): void {
    clearSelection();
    selectedRef.current = id;
    setSelectedId(id);
    setFocusToken((token) => token + 1);
    setFeedback(null);
    void loadDetail(id);
  }

  function showRecord(payment: PaymentDetail): void {
    clearSelection();
    selectedRef.current = payment.id;
    setSelectedId(payment.id);
    setDetail({ status: 'ready', detail: payment });
    setFocusToken((token) => token + 1);
  }

  async function create(values: PaymentFormValues, intent: PendingAllocation | null) {
    const built = toPaymentCreateRequest(values);
    if (!built.ok) return built.errors;
    const owner = session.beginWrite('create');
    if (owner === null) return {};
    const isCurrent = capture('area');
    setFeedback(null);
    try {
      const response = await createPayment(session.token(), built.value);
      if (!isCurrent()) return null;
      setDraft(null);
      void loadList(queryRef.current, true);
      showRecord(response.payment);
      if (intent && access.payments.allocate) setAllocationIntent(intent);
      setFeedback({ tone: 'success', messageKey: 'accounting.feedback.paymentRecorded' });
      return null;
    } catch (error) {
      if (isCurrent()) setFeedback({ tone: 'danger', messageKey: accountingFailureKey(error) });
      return {};
    } finally {
      session.endWrite(owner);
    }
  }

  /** One owner-tagged write on the selected payment; a stale response never repaints it. */
  async function write(
    action: AccountingWriteAction,
    run: (token: string, id: string) => Promise<PaymentDetail>,
    success: MessageKey,
  ): Promise<boolean> {
    if (detail.status !== 'ready') return false;
    const id = detail.detail.id;
    const owner = session.beginWrite(action);
    if (owner === null) return false;
    const isCurrent = capture('record');
    const sameArea = capture('area');
    setFeedback(null);
    try {
      const next = await run(session.token(), id);
      if (sameArea()) void loadList(queryRef.current, true);
      if (!isCurrent() || selectedRef.current !== id) return false;
      setAllocationIntent(null);
      setDetail({ status: 'ready', detail: next });
      setFeedback({ tone: 'success', messageKey: success });
      return true;
    } catch (error) {
      if (!isCurrent() || selectedRef.current !== id) return false;
      setFeedback({ tone: 'danger', messageKey: accountingFailureKey(error) });
      // A conflict means the payment moved on; show its current state.
      void loadDetail(id, true);
      return false;
    } finally {
      session.endWrite(owner);
    }
  }

  const actions: PaymentActions = {
    allocate: (input) =>
      write(
        'allocate',
        async (token, id) => (await allocatePayment(token, id, input)).payment,
        'accounting.feedback.allocated',
      ),
    archive: () =>
      write(
        'archive',
        async (token, id) => (await archivePayment(token, id)).payment,
        'accounting.feedback.paymentArchived',
      ),
    correct: (input) =>
      write(
        'correct',
        async (token, id) => (await correctPayment(token, id, input)).payment,
        'accounting.feedback.paymentCorrected',
      ),
    reverse: (allocationId, reversalReason) =>
      write(
        'reverse',
        async (token, id) =>
          (await reversePaymentAllocation(token, id, allocationId, { reversalReason })).payment,
        'accounting.feedback.allocationReversed',
      ),
    update: (input) =>
      write(
        'update',
        async (token, id) => (await updatePayment(token, id, input)).payment,
        'accounting.feedback.paymentUpdated',
      ),
  };

  const writesLocked = session.pending !== null;

  return (
    <div className="accounting-area">
      <div className="accounting-area__header">
        <h2 className="accounting__pane-title" id="accounting-payments-title">
          {t('accounting.payments.title')}
        </h2>
        {access.payments.record && !draft ? (
          <Button
            disabled={writesLocked}
            onClick={() => {
              setFeedback(null);
              setDraft({ focusToken: 1, invoice: null, values: emptyPaymentForm() });
            }}
          >
            {t('accounting.payments.new')}
          </Button>
        ) : null}
      </div>
      <p className="accounting-muted">{t('accounting.payments.description')}</p>

      <FeedbackMessage feedback={feedback} />

      {draft ? (
        <PaymentCreateForm
          draft={draft}
          key={`${session.key}:${draft.focusToken}`}
          loadClients={loaders.clients}
          onCancel={() => setDraft(null)}
          onChange={(values) => setDraft((current) => (current ? { ...current, values } : current))}
          onSubmit={(values) => create(values, draft.invoice)}
          pending={session.pending}
          sessionKey={session.key}
        />
      ) : null}

      {!canList ? (
        <InlineMessage title={t('accounting.notices.clientScope.title')} tone="info">
          <p className="accounting-message__text">{t('accounting.notices.clientScope.body')}</p>
        </InlineMessage>
      ) : (
        <div className="accounting__workspace">
          <section aria-labelledby="accounting-payments-title" className="accounting__list-pane">
            <PaymentFiltersForm
              busy={list.status === 'loading'}
              loadClients={loaders.clients}
              onChange={setFilters}
              onReset={() => {
                clearSelection();
                setFilters(EMPTY_PAYMENT_FILTERS);
                applyQuery(FIRST_QUERY);
              }}
              onSubmit={() => {
                clearSelection();
                applyQuery({ filters, page: 1 });
              }}
              sessionKey={session.key}
              showReset={hasPaymentFilters(query.filters) || hasPaymentFilters(filters)}
              values={filters}
            />
            <PaymentList
              filtered={hasPaymentFilters(query.filters)}
              list={list}
              onPage={(page) => applyQuery({ ...queryRef.current, page })}
              onReset={() => {
                clearSelection();
                setFilters(EMPTY_PAYMENT_FILTERS);
                applyQuery(FIRST_QUERY);
              }}
              onRetry={() => void loadList(queryRef.current)}
              onSelect={select}
              selectedId={selectedId}
            />
          </section>
          <div className="accounting__detail-pane">
            <PaymentDetailView
              access={access}
              actions={actions}
              allocationIntent={allocationIntent}
              focusToken={focusToken}
              loaders={loaders}
              onRetry={() => {
                const id = selectedRef.current;
                if (id) void loadDetail(id);
              }}
              pending={session.pending}
              selectedId={selectedId}
              session={session}
              state={detail}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function PaymentFiltersForm({
  busy,
  loadClients,
  onChange,
  onReset,
  onSubmit,
  sessionKey,
  showReset,
  values,
}: {
  busy: boolean;
  loadClients: AreaProps['loaders']['clients'];
  onChange: (values: PaymentFilters) => void;
  onReset: () => void;
  onSubmit: () => void;
  sessionKey: number;
  showReset: boolean;
  values: PaymentFilters;
}) {
  const { recordStatus, t } = useAccountingFormat();

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onSubmit();
  }

  return (
    <form
      aria-label={t('accounting.payments.filtersLabel')}
      className="accounting-filters"
      noValidate
      onSubmit={submit}
      role="search"
    >
      <div className="accounting-filters__controls">
        <CommercialOptionPicker
          emptyLabel={t('accounting.filters.anyClient')}
          hint={t('accounting.filters.clientHint')}
          label={t('accounting.filters.client')}
          loadOptions={loadClients}
          onChange={(client) => onChange({ ...values, client })}
          sourceKey={`${sessionKey}:payment-filter-clients`}
          value={values.client}
        />
        <Select
          label={t('accounting.filters.status')}
          onChange={(event) =>
            onChange({ ...values, status: event.currentTarget.value as PaymentRecordStatus | '' })
          }
          value={values.status}
        >
          <option value="">{t('accounting.filters.anyStatus')}</option>
          {PAYMENT_STATUSES.map((status) => (
            <option key={status} value={status}>
              {recordStatus(status)}
            </option>
          ))}
        </Select>
        <Checkbox
          checked={values.includeArchived}
          label={t('accounting.payments.includeArchived')}
          onChange={(event) =>
            onChange({ ...values, includeArchived: event.currentTarget.checked })
          }
        />
      </div>
      <div className="accounting-actions">
        <Button
          loading={busy}
          loadingLabel={t('common.status.working')}
          size="compact"
          type="submit"
          variant="secondary"
        >
          {t('accounting.filters.apply')}
        </Button>
        {showReset ? (
          <Button onClick={onReset} size="compact" variant="quiet">
            {t('accounting.filters.reset')}
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function PaymentList({
  filtered,
  list,
  onPage,
  onReset,
  onRetry,
  onSelect,
  selectedId,
}: {
  filtered: boolean;
  list: ListState<PaymentSummary>;
  onPage: (page: number) => void;
  onReset: () => void;
  onRetry: () => void;
  onSelect: (id: string) => void;
  selectedId: string | null;
}) {
  const { method, recordStatus, t } = useAccountingFormat();

  if (list.status === 'loading' || list.status === 'idle') {
    return <LoadingBlock label={t('accounting.payments.states.loading')} />;
  }
  if (list.status === 'error') {
    return (
      <ErrorBlock
        body={t('accounting.payments.states.error')}
        onRetry={onRetry}
        title={t('accounting.payments.states.errorTitle')}
      />
    );
  }
  if (list.items.length === 0) {
    return filtered ? (
      <EmptyState
        action={
          <Button onClick={onReset} size="compact" variant="secondary">
            {t('accounting.filters.reset')}
          </Button>
        }
        title={t('accounting.list.noMatchesTitle')}
      >
        {t('accounting.list.noMatches')}
      </EmptyState>
    ) : (
      <EmptyState title={t('accounting.payments.empty.title')}>
        {t('accounting.payments.empty.body')}
      </EmptyState>
    );
  }

  return (
    <div className="accounting-list">
      <p aria-live="polite" className="accounting-list__count">
        {t('accounting.payments.count', { count: list.total })}
      </p>
      <table aria-label={t('accounting.payments.title')} className="accounting-table">
        <thead>
          <tr>
            <th scope="col">{t('accounting.payments.columns.reference')}</th>
            <th scope="col">{t('accounting.payments.columns.received')}</th>
            <th scope="col">{t('accounting.payments.columns.status')}</th>
            <th className="accounting-table__amount" scope="col">
              {t('accounting.payments.columns.amount')}
            </th>
            <th className="accounting-table__amount" scope="col">
              {t('accounting.payments.columns.unallocated')}
            </th>
          </tr>
        </thead>
        <tbody>
          {list.items.map((payment) => {
            const selected = payment.id === selectedId;
            return (
              <tr data-selected={selected ? 'true' : undefined} key={payment.id}>
                <th scope="row">
                  <button
                    aria-current={selected ? 'true' : undefined}
                    className="accounting-table__select"
                    onClick={() => onSelect(payment.id)}
                    type="button"
                  >
                    {payment.reference}
                  </button>
                  <span className="accounting-table__secondary">{payment.display.clientName}</span>
                  <span className="accounting-table__secondary">{method(payment.method)}</span>
                </th>
                <td className="u-tabular" data-label={t('accounting.payments.columns.received')}>
                  <DateText value={payment.receivedDate} />
                </td>
                <td data-label={t('accounting.payments.columns.status')}>
                  <StatusBadge tone={recordStatusTone(payment.status)}>
                    {recordStatus(payment.status)}
                  </StatusBadge>
                </td>
                <td
                  className="accounting-table__amount u-tabular"
                  data-label={t('accounting.payments.columns.amount')}
                >
                  <Money
                    cents={payment.amounts?.amountCents}
                    currency={payment.amounts?.currency}
                  />
                </td>
                <td
                  className="accounting-table__amount u-tabular"
                  data-label={t('accounting.payments.columns.unallocated')}
                >
                  <Money
                    cents={payment.amounts?.unallocatedCents}
                    currency={payment.amounts?.currency}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <ListPagination
        labels={{
          next: t('accounting.pagination.next'),
          page: (values) => t('accounting.pagination.page', values),
          previous: t('accounting.pagination.previous'),
          range: (values) => t('accounting.pagination.range', values),
          region: t('accounting.payments.paginationRegion'),
        }}
        onPage={onPage}
        page={list.page}
        pageSize={list.pageSize}
        total={list.total}
      />
    </div>
  );
}

function PaymentCreateForm({
  draft,
  loadClients,
  onCancel,
  onChange,
  onSubmit,
  pending,
  sessionKey,
}: {
  draft: CreateDraft;
  loadClients: AreaProps['loaders']['clients'];
  onCancel: () => void;
  onChange: (values: PaymentFormValues) => void;
  onSubmit: (values: PaymentFormValues) => Promise<FormErrors | null>;
  pending: AccountingWriteAction | null;
  sessionKey: number;
}) {
  const { method, message, t } = useAccountingFormat();
  const heading = useRef<HTMLHeadingElement>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const values = draft.values;
  const error = (field: string) => {
    const key = errors[field];
    return key ? message(key) : undefined;
  };

  useEffect(() => {
    heading.current?.focus();
  }, [draft.focusToken]);

  function set<Field extends keyof PaymentFormValues>(
    field: Field,
    value: PaymentFormValues[Field],
  ): void {
    setErrors((current) => ({ ...current, [field]: undefined }));
    onChange({ ...values, [field]: value });
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const result = await onSubmit(values);
    if (result) setErrors(result);
  }

  return (
    <section aria-labelledby="accounting-payment-create-title" className="accounting-create">
      <h2
        className="accounting__pane-title"
        id="accounting-payment-create-title"
        ref={heading}
        tabIndex={-1}
      >
        {t('accounting.payments.new')}
      </h2>
      {draft.invoice ? (
        <InlineMessage title={t('accounting.payments.form.handoffTitle')} tone="info">
          <p className="accounting-message__text">
            {t('accounting.payments.form.handoffBody', {
              reference: draft.invoice.invoice.label,
            })}
          </p>
        </InlineMessage>
      ) : null}
      <form
        aria-label={t('accounting.payments.new')}
        className="accounting-form"
        noValidate
        onSubmit={(event) => void submit(event)}
      >
        <div className="accounting-form__grid">
          <TextField
            autoComplete="off"
            error={error('reference')}
            hint={t('accounting.payments.form.referenceHint')}
            label={t('accounting.form.reference')}
            maxLength={80}
            onChange={(event) => set('reference', event.currentTarget.value)}
            required
            value={values.reference}
          />
          <CommercialOptionPicker
            error={error('client')}
            hint={t('accounting.filters.clientHint')}
            label={t('accounting.form.client')}
            loadOptions={loadClients}
            onChange={(client: PickerOption | null) => set('client', client)}
            required
            sourceKey={`${sessionKey}:payment-create-clients`}
            value={values.client}
          />
          <TextField
            error={error('receivedDate')}
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
            error={error('currency')}
            hint={t('accounting.form.currencyHint')}
            label={t('accounting.form.currency')}
            maxLength={3}
            onChange={(event) => set('currency', event.currentTarget.value.toUpperCase())}
            required
            value={values.currency}
          />
          <TextField
            autoComplete="off"
            error={error('amount')}
            hint={t('accounting.form.amountHint')}
            inputMode="decimal"
            label={t('accounting.payments.form.amount')}
            onChange={(event) => set('amount', event.currentTarget.value)}
            required
            value={values.amount}
          />
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
        <div className="accounting-actions">
          <Button
            disabled={pending !== null}
            loading={pending === 'create'}
            loadingLabel={t('common.status.working')}
            type="submit"
          >
            {t('accounting.payments.form.submit')}
          </Button>
          <Button onClick={onCancel} variant="quiet">
            {t('accounting.form.cancel')}
          </Button>
        </div>
      </form>
    </section>
  );
}
