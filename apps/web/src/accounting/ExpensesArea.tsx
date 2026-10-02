import type {
  ExpenseCategory,
  ExpenseDetail,
  ExpenseSummary,
  ExpenseUpdateRequest,
} from '@hire-me/contracts';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';

import {
  archiveExpense,
  correctExpense,
  createExpense,
  getExpense,
  listExpenses,
  updateExpense,
} from '../api.js';
import { ListPagination } from '../clients/ListPagination.js';
import { CommercialOptionPicker } from '../commercial/CommercialOptionPicker.js';
import type { MessageKey } from '../i18n/index.js';
import {
  Button,
  Checkbox,
  EmptyState,
  Select,
  StatusBadge,
  TextArea,
  TextField,
} from '../ui/index.js';
import type { AccountingAccess } from './accounting-access.js';
import { recordStatusTone, useAccountingFormat } from './accounting-labels.js';
import type { AccountingLoaders, AccountingWriteAction, AreaProps } from './accounting-session.js';
import {
  accountingFailureKey,
  emptyExpenseForm,
  EMPTY_EXPENSE_FILTERS,
  EXPENSE_CATEGORIES,
  expenseEditValues,
  expenseListOptions,
  hasExpenseFilters,
  pageCount,
  toExpenseCreateRequest,
  toExpenseUpdateRequest,
  type AccountingFeedback,
  type DetailState,
  type ExpenseEditValues,
  type ExpenseFilters,
  type ExpenseFormValues,
  type FormErrors,
  type ListQuery,
  type ListState,
  type PickerOption,
} from './accounting-state.js';
import {
  DateText,
  ErrorBlock,
  Fact,
  FeedbackMessage,
  HistoryList,
  LoadingBlock,
  Money,
} from './AccountingParts.js';
import { ConfirmPanel, CorrectionForm } from './PaymentDetail.js';

type Scope = 'area' | 'record';

const FIRST_QUERY: ListQuery<ExpenseFilters> = { page: 1, filters: EMPTY_EXPENSE_FILTERS };

type ExpenseActions = {
  archive: () => Promise<boolean>;
  correct: (input: { amountCents: number; correctionReason: string }) => Promise<boolean>;
  update: (input: ExpenseUpdateRequest) => Promise<boolean>;
};

export function ExpensesArea({ access, loaders, session }: AreaProps) {
  const { t } = useAccountingFormat();
  const listRequest = useRef(0);
  const detailRequest = useRef(0);
  const recordGeneration = useRef(0);
  const selectedRef = useRef<string | null>(null);
  const queryRef = useRef(FIRST_QUERY);
  const mounted = useRef(true);

  const [filters, setFilters] = useState(EMPTY_EXPENSE_FILTERS);
  const [query, setQuery] = useState(FIRST_QUERY);
  const [list, setList] = useState<ListState<ExpenseSummary>>({ status: 'loading' });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailState<ExpenseDetail>>({ status: 'idle' });
  const [focusToken, setFocusToken] = useState(0);
  const [draft, setDraft] = useState<{ values: ExpenseFormValues; token: number } | null>(null);
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
    void loadList(query);
    return () => {
      listRequest.current += 1;
    };
  }, [query]);

  function capture(scope: Scope): () => boolean {
    const sameSession = session.capture();
    const record = recordGeneration.current;
    return () =>
      mounted.current && sameSession() && (scope === 'area' || recordGeneration.current === record);
  }

  async function loadList(forQuery: ListQuery<ExpenseFilters>, quiet = false): Promise<void> {
    const request = ++listRequest.current;
    const isCurrent = capture('area');
    if (!quiet) setList({ status: 'loading' });
    try {
      const response = await listExpenses(session.token(), expenseListOptions(forQuery));
      if (request !== listRequest.current || !isCurrent()) return;
      const { page, pageSize, total } = response.pagination;
      if (response.expenses.length === 0 && total > 0 && page > 1) {
        applyQuery({ ...forQuery, page: Math.min(page - 1, pageCount(total, pageSize)) });
        return;
      }
      setList({ status: 'ready', items: response.expenses, page, pageSize, total });
    } catch {
      if (request === listRequest.current && isCurrent() && !quiet) setList({ status: 'error' });
    }
  }

  async function loadDetail(id: string, quiet = false): Promise<void> {
    const request = ++detailRequest.current;
    const isCurrent = capture('record');
    if (!quiet) setDetail({ status: 'loading' });
    try {
      const response = await getExpense(session.token(), id);
      if (request !== detailRequest.current || !isCurrent() || selectedRef.current !== id) return;
      setDetail({ status: 'ready', detail: response.expense });
    } catch (error) {
      if (request !== detailRequest.current || !isCurrent() || selectedRef.current !== id) return;
      if (!quiet) setDetail({ status: 'error', messageKey: accountingFailureKey(error) });
    }
  }

  function applyQuery(next: ListQuery<ExpenseFilters>): void {
    queryRef.current = next;
    setQuery(next);
  }

  function clearSelection(): void {
    recordGeneration.current += 1;
    detailRequest.current += 1;
    selectedRef.current = null;
    setSelectedId(null);
    setDetail({ status: 'idle' });
  }

  function select(id: string): void {
    clearSelection();
    selectedRef.current = id;
    setSelectedId(id);
    setFocusToken((token) => token + 1);
    setFeedback(null);
    void loadDetail(id);
  }

  async function create(values: ExpenseFormValues): Promise<FormErrors | null> {
    const built = toExpenseCreateRequest(values);
    if (!built.ok) return built.errors;
    const owner = session.beginWrite('create');
    if (owner === null) return {};
    const isCurrent = capture('area');
    setFeedback(null);
    try {
      const response = await createExpense(session.token(), built.value);
      if (!isCurrent()) return null;
      setDraft(null);
      void loadList(queryRef.current, true);
      clearSelection();
      selectedRef.current = response.expense.id;
      setSelectedId(response.expense.id);
      setDetail({ status: 'ready', detail: response.expense });
      setFocusToken((token) => token + 1);
      setFeedback({ tone: 'success', messageKey: 'accounting.feedback.expenseRecorded' });
      return null;
    } catch (error) {
      if (isCurrent()) setFeedback({ tone: 'danger', messageKey: accountingFailureKey(error) });
      return {};
    } finally {
      session.endWrite(owner);
    }
  }

  async function write(
    action: AccountingWriteAction,
    run: (token: string, id: string) => Promise<ExpenseDetail>,
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
      setDetail({ status: 'ready', detail: next });
      setFeedback({ tone: 'success', messageKey: success });
      return true;
    } catch (error) {
      if (!isCurrent() || selectedRef.current !== id) return false;
      setFeedback({ tone: 'danger', messageKey: accountingFailureKey(error) });
      void loadDetail(id, true);
      return false;
    } finally {
      session.endWrite(owner);
    }
  }

  const actions: ExpenseActions = {
    archive: () =>
      write(
        'archive',
        async (token, id) => (await archiveExpense(token, id)).expense,
        'accounting.feedback.expenseArchived',
      ),
    correct: (input) =>
      write(
        'correct',
        async (token, id) => (await correctExpense(token, id, input)).expense,
        'accounting.feedback.expenseCorrected',
      ),
    update: (input) =>
      write(
        'update',
        async (token, id) => (await updateExpense(token, id, input)).expense,
        'accounting.feedback.expenseUpdated',
      ),
  };

  const writesLocked = session.pending !== null;
  const reset = () => {
    clearSelection();
    setFilters(EMPTY_EXPENSE_FILTERS);
    applyQuery(FIRST_QUERY);
  };

  return (
    <div className="accounting-area">
      <div className="accounting-area__header">
        <h2 className="accounting__pane-title" id="accounting-expenses-title">
          {t('accounting.expenses.title')}
        </h2>
        {access.expenses.record && !draft ? (
          <Button
            disabled={writesLocked}
            onClick={() => {
              setFeedback(null);
              setDraft({ token: 1, values: emptyExpenseForm() });
            }}
          >
            {t('accounting.expenses.new')}
          </Button>
        ) : null}
      </div>
      <p className="accounting-muted">{t('accounting.expenses.description')}</p>

      <FeedbackMessage feedback={feedback} />

      {draft ? (
        <ExpenseCreateForm
          access={access}
          key={`${session.key}:${draft.token}`}
          loaders={loaders}
          onCancel={() => setDraft(null)}
          onChange={(values) => setDraft((current) => (current ? { ...current, values } : current))}
          onSubmit={create}
          pending={session.pending}
          sessionKey={session.key}
          values={draft.values}
        />
      ) : null}

      <div className="accounting__workspace">
        <section aria-labelledby="accounting-expenses-title" className="accounting__list-pane">
          <ExpenseFiltersForm
            access={access}
            busy={list.status === 'loading'}
            loadClients={loaders.clients}
            onChange={setFilters}
            onReset={reset}
            onSubmit={() => {
              clearSelection();
              applyQuery({ filters, page: 1 });
            }}
            sessionKey={session.key}
            showReset={hasExpenseFilters(query.filters) || hasExpenseFilters(filters)}
            values={filters}
          />
          <ExpenseList
            filtered={hasExpenseFilters(query.filters)}
            list={list}
            onPage={(page) => applyQuery({ ...queryRef.current, page })}
            onReset={reset}
            onRetry={() => void loadList(queryRef.current)}
            onSelect={select}
            selectedId={selectedId}
          />
        </section>
        <div className="accounting__detail-pane">
          <ExpenseDetailView
            access={access}
            actions={actions}
            focusToken={focusToken}
            onRetry={() => {
              const id = selectedRef.current;
              if (id) void loadDetail(id);
            }}
            pending={session.pending}
            selectedId={selectedId}
            state={detail}
          />
        </div>
      </div>
    </div>
  );
}

/** The expense's linked context as human labels only; a placement never names a candidate. */
function contextLabel(expense: ExpenseSummary, format: ReturnType<typeof useAccountingFormat>) {
  const { display } = expense;
  if (display.placement) {
    return format.t('accounting.expenses.placementLabel', {
      mission: display.placement.missionTitle,
      start: format.formatDate(display.placement.integrationStartDate),
    });
  }
  return display.missionTitle ?? display.trainingProgramName ?? display.clientName ?? null;
}

function ExpenseFiltersForm({
  access,
  busy,
  loadClients,
  onChange,
  onReset,
  onSubmit,
  sessionKey,
  showReset,
  values,
}: {
  access: AccountingAccess;
  busy: boolean;
  loadClients: AccountingLoaders['clients'];
  onChange: (values: ExpenseFilters) => void;
  onReset: () => void;
  onSubmit: () => void;
  sessionKey: number;
  showReset: boolean;
  values: ExpenseFilters;
}) {
  const { category, t } = useAccountingFormat();

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onSubmit();
  }

  return (
    <form
      aria-label={t('accounting.expenses.filtersLabel')}
      className="accounting-filters"
      noValidate
      onSubmit={submit}
      role="search"
    >
      <div className="accounting-filters__controls">
        {access.clients ? (
          <CommercialOptionPicker
            emptyLabel={t('accounting.filters.anyClient')}
            hint={t('accounting.filters.clientHint')}
            label={t('accounting.filters.client')}
            loadOptions={loadClients}
            onChange={(client) => onChange({ ...values, client })}
            sourceKey={`${sessionKey}:expense-filter-clients`}
            value={values.client}
          />
        ) : null}
        <Select
          label={t('accounting.expenses.form.category')}
          onChange={(event) =>
            onChange({ ...values, category: event.currentTarget.value as ExpenseCategory | '' })
          }
          value={values.category}
        >
          <option value="">{t('accounting.filters.anyCategory')}</option>
          {EXPENSE_CATEGORIES.map((option) => (
            <option key={option} value={option}>
              {category(option)}
            </option>
          ))}
        </Select>
        <Checkbox
          checked={values.includeArchived}
          label={t('accounting.expenses.includeArchived')}
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

function ExpenseList({
  filtered,
  list,
  onPage,
  onReset,
  onRetry,
  onSelect,
  selectedId,
}: {
  filtered: boolean;
  list: ListState<ExpenseSummary>;
  onPage: (page: number) => void;
  onReset: () => void;
  onRetry: () => void;
  onSelect: (id: string) => void;
  selectedId: string | null;
}) {
  const format = useAccountingFormat();
  const { category, recordStatus, t } = format;

  if (list.status === 'loading' || list.status === 'idle') {
    return <LoadingBlock label={t('accounting.expenses.states.loading')} />;
  }
  if (list.status === 'error') {
    return (
      <ErrorBlock
        body={t('accounting.expenses.states.error')}
        onRetry={onRetry}
        title={t('accounting.expenses.states.errorTitle')}
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
      <EmptyState title={t('accounting.expenses.empty.title')}>
        {t('accounting.expenses.empty.body')}
      </EmptyState>
    );
  }

  return (
    <div className="accounting-list">
      <p aria-live="polite" className="accounting-list__count">
        {t('accounting.expenses.count', { count: list.total })}
      </p>
      <table aria-label={t('accounting.expenses.title')} className="accounting-table">
        <thead>
          <tr>
            <th scope="col">{t('accounting.expenses.columns.reference')}</th>
            <th scope="col">{t('accounting.expenses.columns.date')}</th>
            <th scope="col">{t('accounting.expenses.columns.status')}</th>
            <th className="accounting-table__amount" scope="col">
              {t('accounting.expenses.columns.amount')}
            </th>
          </tr>
        </thead>
        <tbody>
          {list.items.map((expense) => {
            const selected = expense.id === selectedId;
            const context = contextLabel(expense, format);
            return (
              <tr data-selected={selected ? 'true' : undefined} key={expense.id}>
                <th scope="row">
                  <button
                    aria-current={selected ? 'true' : undefined}
                    className="accounting-table__select"
                    onClick={() => onSelect(expense.id)}
                    type="button"
                  >
                    {expense.reference}
                  </button>
                  <span className="accounting-table__secondary">{category(expense.category)}</span>
                  <span className="accounting-table__secondary">
                    {context ?? t('accounting.expenses.noContext')}
                  </span>
                </th>
                <td className="u-tabular" data-label={t('accounting.expenses.columns.date')}>
                  <DateText value={expense.expenseDate} />
                </td>
                <td data-label={t('accounting.expenses.columns.status')}>
                  <StatusBadge tone={recordStatusTone(expense.status)}>
                    {recordStatus(expense.status)}
                  </StatusBadge>
                </td>
                <td
                  className="accounting-table__amount u-tabular"
                  data-label={t('accounting.expenses.columns.amount')}
                >
                  <Money
                    cents={expense.amounts?.amountCents}
                    currency={expense.amounts?.currency}
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
          region: t('accounting.expenses.paginationRegion'),
        }}
        onPage={onPage}
        page={list.page}
        pageSize={list.pageSize}
        total={list.total}
      />
    </div>
  );
}

function ExpenseCreateForm({
  access,
  loaders,
  onCancel,
  onChange,
  onSubmit,
  pending,
  sessionKey,
  values,
}: {
  access: AccountingAccess;
  loaders: AccountingLoaders;
  onCancel: () => void;
  onChange: (values: ExpenseFormValues) => void;
  onSubmit: (values: ExpenseFormValues) => Promise<FormErrors | null>;
  pending: AccountingWriteAction | null;
  sessionKey: number;
  values: ExpenseFormValues;
}) {
  const { category, formatDate, message, t } = useAccountingFormat();
  const heading = useRef<HTMLHeadingElement>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const error = (field: string) => (errors[field] ? message(errors[field]) : undefined);
  const clientId = values.client?.id ?? null;

  useEffect(() => {
    heading.current?.focus();
  }, []);

  function set<Field extends keyof ExpenseFormValues>(
    field: Field,
    value: ExpenseFormValues[Field],
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
    <section aria-labelledby="accounting-expense-create-title" className="accounting-create">
      <h2
        className="accounting__pane-title"
        id="accounting-expense-create-title"
        ref={heading}
        tabIndex={-1}
      >
        {t('accounting.expenses.new')}
      </h2>
      <form
        aria-label={t('accounting.expenses.new')}
        className="accounting-form"
        noValidate
        onSubmit={(event) => void submit(event)}
      >
        <div className="accounting-form__grid">
          <TextField
            autoComplete="off"
            error={error('reference')}
            hint={t('accounting.expenses.form.referenceHint')}
            label={t('accounting.form.reference')}
            maxLength={80}
            onChange={(event) => set('reference', event.currentTarget.value)}
            required
            value={values.reference}
          />
          <TextField
            error={error('expenseDate')}
            label={t('accounting.expenses.form.date')}
            onChange={(event) => set('expenseDate', event.currentTarget.value)}
            required
            type="date"
            value={values.expenseDate}
          />
          <Select
            label={t('accounting.expenses.form.category')}
            onChange={(event) => set('category', event.currentTarget.value as ExpenseCategory)}
            value={values.category}
          >
            {EXPENSE_CATEGORIES.map((option) => (
              <option key={option} value={option}>
                {category(option)}
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
            label={t('accounting.expenses.form.amount')}
            onChange={(event) => set('amount', event.currentTarget.value)}
            required
            value={values.amount}
          />
          <TextField
            autoComplete="off"
            label={t('accounting.expenses.form.vendor')}
            maxLength={160}
            onChange={(event) => set('vendorLabel', event.currentTarget.value)}
            value={values.vendorLabel}
          />
        </div>

        <fieldset className="accounting-fieldset">
          <legend>{t('accounting.expenses.form.contextLegend')}</legend>
          <p className="accounting-muted">{t('accounting.expenses.form.contextHint')}</p>
          <div className="accounting-form__grid">
            {access.clients ? (
              <CommercialOptionPicker
                emptyLabel={t('accounting.expenses.form.noClient')}
                hint={t('accounting.filters.clientHint')}
                label={t('accounting.form.client')}
                loadOptions={loaders.clients}
                onChange={(client) =>
                  onChange({
                    ...values,
                    client,
                    mission: null,
                    placement: null,
                    trainingProgram: null,
                  })
                }
                sourceKey={`${sessionKey}:expense-create-clients`}
                value={values.client}
              />
            ) : null}
            {access.pickMissions ? (
              <CommercialOptionPicker
                emptyLabel={t('accounting.expenses.form.noMission')}
                hint={t('accounting.expenses.form.missionHint')}
                label={t('accounting.expenses.form.mission')}
                loadOptions={loaders.missions(clientId)}
                onChange={(mission) => onChange({ ...values, mission, placement: null })}
                sourceKey={`${sessionKey}:expense-create-missions:${clientId ?? 'any'}`}
                value={values.mission}
              />
            ) : null}
            {access.pickPlacements && values.mission ? (
              <CommercialOptionPicker
                emptyLabel={t('accounting.expenses.form.noPlacement')}
                formatOption={(option: PickerOption) =>
                  option.placement
                    ? t('accounting.expenses.placementLabel', {
                        mission: option.label,
                        start: formatDate(option.placement.integrationStartDate),
                      })
                    : option.label
                }
                hint={t('accounting.expenses.form.placementHint')}
                label={t('accounting.expenses.form.placement')}
                loadOptions={loaders.placements(values.mission.id)}
                onChange={(placement) => set('placement', placement)}
                sourceKey={`${sessionKey}:expense-create-placements:${values.mission.id}`}
                value={values.placement}
              />
            ) : null}
            {access.pickTrainingPrograms ? (
              <CommercialOptionPicker
                emptyLabel={t('accounting.expenses.form.noTraining')}
                hint={t('accounting.expenses.form.trainingHint')}
                label={t('accounting.expenses.form.training')}
                loadOptions={loaders.trainingPrograms(clientId)}
                onChange={(trainingProgram) => set('trainingProgram', trainingProgram)}
                sourceKey={`${sessionKey}:expense-create-training:${clientId ?? 'any'}`}
                value={values.trainingProgram}
              />
            ) : null}
          </div>
        </fieldset>

        <TextArea
          label={t('accounting.expenses.form.description')}
          maxLength={2000}
          onChange={(event) => set('description', event.currentTarget.value)}
          rows={3}
          value={values.description}
        />
        <div className="accounting-actions">
          <Button
            disabled={pending !== null}
            loading={pending === 'create'}
            loadingLabel={t('common.status.working')}
            type="submit"
          >
            {t('accounting.expenses.form.submit')}
          </Button>
          <Button onClick={onCancel} variant="quiet">
            {t('accounting.form.cancel')}
          </Button>
        </div>
      </form>
    </section>
  );
}

type Mode = 'none' | 'edit' | 'correct' | 'archive';

function ExpenseDetailView({
  access,
  actions,
  focusToken,
  onRetry,
  pending,
  selectedId,
  state,
}: {
  access: AccountingAccess;
  actions: ExpenseActions;
  focusToken: number;
  onRetry: () => void;
  pending: AccountingWriteAction | null;
  selectedId: string | null;
  state: DetailState<ExpenseDetail>;
}) {
  const { message, t } = useAccountingFormat();
  if (!selectedId || state.status === 'idle') {
    return (
      <p className="accounting-muted accounting-detail__prompt">
        {t('accounting.expenses.detail.selectPrompt')}
      </p>
    );
  }
  if (state.status === 'loading') {
    return <LoadingBlock label={t('accounting.expenses.detail.loading')} />;
  }
  if (state.status === 'error') {
    return (
      <ErrorBlock
        body={message(state.messageKey)}
        onRetry={onRetry}
        title={t('accounting.expenses.detail.errorTitle')}
      />
    );
  }
  const expense = state.detail;
  return (
    <ExpenseRecord
      access={access}
      actions={actions}
      expense={expense}
      focusToken={focusToken}
      key={`${expense.id}:${expense.status}:${expense.updatedAt}`}
      pending={pending}
    />
  );
}

function ExpenseRecord({
  access,
  actions,
  expense,
  focusToken,
  pending,
}: {
  access: AccountingAccess;
  actions: ExpenseActions;
  expense: ExpenseDetail;
  focusToken: number;
  pending: AccountingWriteAction | null;
}) {
  const { category, formatDate, formatDateTime, recordStatus, t } = useAccountingFormat();
  const heading = useRef<HTMLHeadingElement>(null);
  const [mode, setMode] = useState<Mode>('none');
  const archived = expense.status === 'ARCHIVED' || expense.archivedAt !== null;
  const canManage = access.expenses.manage && !archived;
  const writesLocked = pending !== null;
  const { context, display } = expense;

  useEffect(() => {
    if (focusToken > 0) heading.current?.focus();
  }, [focusToken]);

  const restricted = <span className="accounting-muted">{t('accounting.common.restricted')}</span>;
  const contextFacts: { label: string; value: ReactNode }[] = [];
  if (context.clientId) {
    contextFacts.push({
      label: t('accounting.form.client'),
      value: display.clientName ?? restricted,
    });
  }
  if (context.recruitmentMissionId) {
    contextFacts.push({
      label: t('accounting.expenses.form.mission'),
      value: display.missionTitle ?? restricted,
    });
  }
  if (context.missionPlacementId) {
    contextFacts.push({
      label: t('accounting.expenses.form.placement'),
      value: display.placement
        ? t('accounting.expenses.placementDates', {
            confirmed: formatDate(display.placement.confirmedAt),
            mission: display.placement.missionTitle,
            start: formatDate(display.placement.integrationStartDate),
          })
        : restricted,
    });
  }
  if (context.trainingProgramId) {
    contextFacts.push({
      label: t('accounting.expenses.form.training'),
      value: display.trainingProgramName ?? restricted,
    });
  }

  return (
    <article aria-labelledby="accounting-expense-title" className="accounting-detail">
      <header className="accounting-detail__heading">
        <p className="accounting-detail__kind">{t('accounting.expenses.detail.kind')}</p>
        <h2
          className="accounting-detail__title"
          id="accounting-expense-title"
          ref={heading}
          tabIndex={-1}
        >
          {expense.reference}
        </h2>
        <StatusBadge tone={recordStatusTone(expense.status)}>
          {recordStatus(expense.status)}
        </StatusBadge>
      </header>

      <dl className="accounting-facts">
        <Fact label={t('accounting.expenses.form.date')}>
          <DateText value={expense.expenseDate} />
        </Fact>
        <Fact label={t('accounting.expenses.form.category')}>{category(expense.category)}</Fact>
        <Fact label={t('accounting.expenses.form.vendor')}>
          {expense.vendorLabel ? (
            <span className="accounting-break">{expense.vendorLabel}</span>
          ) : (
            <span className="accounting-muted">
              {access.amounts ? t('accounting.common.notSet') : t('accounting.common.hidden')}
            </span>
          )}
        </Fact>
        <Fact label={t('accounting.expenses.detail.amount')}>
          <Money cents={expense.amounts?.amountCents} currency={expense.amounts?.currency} strong />
        </Fact>
      </dl>

      <section aria-labelledby="accounting-expense-context" className="accounting-section">
        <h3 className="accounting-section__title" id="accounting-expense-context">
          {t('accounting.expenses.form.contextLegend')}
        </h3>
        {contextFacts.length === 0 ? (
          <p className="accounting-muted">{t('accounting.expenses.noContext')}</p>
        ) : (
          <dl className="accounting-facts">
            {contextFacts.map((fact) => (
              <Fact key={fact.label} label={fact.label}>
                {fact.value}
              </Fact>
            ))}
          </dl>
        )}
      </section>

      {expense.description ? (
        <div className="accounting-note">
          <h3 className="accounting-section__subtitle">
            {t('accounting.expenses.form.description')}
          </h3>
          <p>{expense.description}</p>
        </div>
      ) : null}
      {expense.correctedAt ? (
        <p className="accounting-muted">
          {t('accounting.payments.detail.correctedOn', { date: formatDate(expense.correctedAt) })}
          {expense.correctionReason ? (
            <>
              {' '}
              <span className="accounting-break">{expense.correctionReason}</span>
            </>
          ) : null}
        </p>
      ) : null}

      {canManage ? (
        <section aria-labelledby="accounting-expense-actions" className="accounting-section">
          <h3 className="accounting-section__title" id="accounting-expense-actions">
            {t('accounting.expenses.detail.actionsTitle')}
          </h3>
          {mode === 'none' ? (
            <div
              aria-label={t('accounting.expenses.detail.actionsLabel')}
              className="accounting-actions"
              role="group"
            >
              <Button disabled={writesLocked} onClick={() => setMode('edit')} size="compact">
                {t('accounting.expenses.actions.edit')}
              </Button>
              {expense.amounts ? (
                <Button
                  disabled={writesLocked}
                  onClick={() => setMode('correct')}
                  size="compact"
                  variant="secondary"
                >
                  {t('accounting.expenses.actions.correct')}
                </Button>
              ) : null}
              <Button
                disabled={writesLocked}
                onClick={() => setMode('archive')}
                size="compact"
                variant="quiet"
              >
                {t('accounting.expenses.actions.archive')}
              </Button>
            </div>
          ) : null}
          {mode === 'edit' ? (
            <ExpenseEditForm
              expense={expense}
              onCancel={() => setMode('none')}
              onSubmit={actions.update}
              pending={pending}
            />
          ) : null}
          {mode === 'correct' && expense.amounts ? (
            <CorrectionForm
              currency={expense.amounts.currency}
              initialCents={expense.amounts.amountCents}
              onCancel={() => setMode('none')}
              onSubmit={actions.correct}
              pending={pending}
            />
          ) : null}
          {mode === 'archive' ? (
            <ConfirmPanel
              body={t('accounting.expenses.confirmArchive', { reference: expense.reference })}
              label={t('accounting.expenses.actions.archive')}
              onCancel={() => setMode('none')}
              onConfirm={actions.archive}
              pending={pending === 'archive'}
              writesLocked={writesLocked}
            />
          ) : null}
        </section>
      ) : null}

      <HistoryList events={expense.history} id="accounting-expense-history" />
      <p className="accounting-muted">
        {t('accounting.common.updated')}{' '}
        <time dateTime={expense.updatedAt}>{formatDateTime(expense.updatedAt)}</time>
      </p>
    </article>
  );
}

function ExpenseEditForm({
  expense,
  onCancel,
  onSubmit,
  pending,
}: {
  expense: ExpenseDetail;
  onCancel: () => void;
  onSubmit: (input: ExpenseUpdateRequest) => Promise<boolean>;
  pending: AccountingWriteAction | null;
}) {
  const { category, message, t } = useAccountingFormat();
  const [values, setValues] = useState<ExpenseEditValues>(() => expenseEditValues(expense));
  const [errors, setErrors] = useState<FormErrors>({});

  function set<Field extends keyof ExpenseEditValues>(
    field: Field,
    value: ExpenseEditValues[Field],
  ): void {
    setErrors({});
    setValues({ ...values, [field]: value });
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const built = toExpenseUpdateRequest(expense, values);
    if (!built.ok) {
      setErrors(built.errors);
      return;
    }
    void onSubmit(built.value);
  }

  return (
    <form
      aria-label={t('accounting.expenses.actions.edit')}
      className="accounting-form accounting-form--panel"
      noValidate
      onSubmit={submit}
    >
      <div className="accounting-form__grid">
        <TextField
          error={errors.expenseDate ? message(errors.expenseDate) : undefined}
          label={t('accounting.expenses.form.date')}
          onChange={(event) => set('expenseDate', event.currentTarget.value)}
          required
          type="date"
          value={values.expenseDate}
        />
        <Select
          label={t('accounting.expenses.form.category')}
          onChange={(event) => set('category', event.currentTarget.value as ExpenseCategory)}
          value={values.category}
        >
          {EXPENSE_CATEGORIES.map((option) => (
            <option key={option} value={option}>
              {category(option)}
            </option>
          ))}
        </Select>
        <TextField
          autoComplete="off"
          label={t('accounting.expenses.form.vendor')}
          maxLength={160}
          onChange={(event) => set('vendorLabel', event.currentTarget.value)}
          value={values.vendorLabel}
        />
      </div>
      <TextArea
        label={t('accounting.expenses.form.description')}
        maxLength={2000}
        onChange={(event) => set('description', event.currentTarget.value)}
        rows={3}
        value={values.description}
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
