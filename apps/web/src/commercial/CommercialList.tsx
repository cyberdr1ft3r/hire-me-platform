import type { CommercialContractSummary } from '@hire-me/contracts';
import type { FormEvent } from 'react';

import { ListPagination } from '../clients/ListPagination.js';
import {
  Button,
  Checkbox,
  EmptyState,
  InlineMessage,
  Select,
  Skeleton,
  StatusBadge,
  TextField,
} from '../ui/index.js';
import type { CommercialAccess } from './commercial-access.js';
import {
  primaryDate,
  statusTone,
  type CommercialKind,
  type CommercialStatus,
  type CommercialSummary,
} from './commercial-kinds.js';
import { useCommercialFormat } from './commercial-labels.js';
import {
  STATUS_FILTERS,
  type CommercialListFilters,
  type ListState,
  type LoadCommercialOptions,
} from './commercial-state.js';
import { CommercialOptionPicker } from './CommercialOptionPicker.js';

export function CommercialFilters({
  access,
  busy,
  kind,
  loadClients,
  onChange,
  onReset,
  onSubmit,
  sessionKey,
  showReset,
  values,
}: {
  access: CommercialAccess;
  busy: boolean;
  kind: CommercialKind;
  loadClients: LoadCommercialOptions;
  onChange: (values: CommercialListFilters) => void;
  onReset: () => void;
  onSubmit: () => void;
  sessionKey: number;
  showReset: boolean;
  values: CommercialListFilters;
}) {
  const { status, t } = useCommercialFormat();

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onSubmit();
  }

  return (
    <form
      aria-label={t('commercial.filters.label', { records: t(`commercial.kindsPlural.${kind}`) })}
      className="commercial-filters"
      noValidate
      onSubmit={submit}
      role="search"
    >
      <div className="commercial-filters__controls">
        <TextField
          autoComplete="off"
          hint={t('commercial.filters.referenceHint')}
          label={t('commercial.filters.reference')}
          maxLength={80}
          onChange={(event) => onChange({ ...values, reference: event.currentTarget.value })}
          type="search"
          value={values.reference}
        />
        <Select
          label={t('commercial.filters.status')}
          onChange={(event) =>
            onChange({ ...values, status: event.currentTarget.value as CommercialStatus | '' })
          }
          value={values.status}
        >
          <option value="">{t('commercial.filters.anyStatus')}</option>
          {STATUS_FILTERS[kind].map((option) => (
            <option key={option} value={option}>
              {status(kind, option)}
            </option>
          ))}
        </Select>
        {access.pickClients ? (
          <CommercialOptionPicker
            emptyLabel={t('commercial.filters.anyClient')}
            hint={t('commercial.filters.clientHint')}
            label={t('commercial.filters.client')}
            loadOptions={loadClients}
            onChange={(client) => onChange({ ...values, client })}
            sourceKey={`${sessionKey}:filter-clients`}
            value={values.client}
          />
        ) : null}
        <Checkbox
          checked={values.includeArchived}
          label={t('commercial.filters.includeArchived')}
          onChange={(event) =>
            onChange({ ...values, includeArchived: event.currentTarget.checked })
          }
        />
      </div>
      <div className="commercial-actions">
        <Button
          loading={busy}
          loadingLabel={t('common.status.working')}
          size="compact"
          type="submit"
          variant="secondary"
        >
          {t('commercial.filters.apply')}
        </Button>
        {showReset ? (
          <Button onClick={onReset} size="compact" variant="quiet">
            {t('commercial.filters.reset')}
          </Button>
        ) : null}
      </div>
    </form>
  );
}

export function CommercialList({
  filtered,
  kind,
  list,
  onPage,
  onReset,
  onRetry,
  onSelect,
  selectedId,
}: {
  filtered: boolean;
  kind: CommercialKind;
  list: ListState<CommercialSummary>;
  onPage: (page: number) => void;
  onReset: () => void;
  onRetry: () => void;
  onSelect: (summary: CommercialSummary) => void;
  selectedId: string | null;
}) {
  const { formatDate, money, status, t } = useCommercialFormat();

  if (list.status === 'loading' || list.status === 'idle') {
    return (
      <div aria-busy="true">
        <Skeleton label={t('commercial.list.states.loading')} />
      </div>
    );
  }

  if (list.status === 'error') {
    return (
      <InlineMessage announce title={t('commercial.list.states.errorTitle')} tone="danger">
        <p className="commercial-message__text">{t('commercial.list.states.error')}</p>
        <Button onClick={onRetry} size="compact" variant="secondary">
          {t('common.actions.retry')}
        </Button>
      </InlineMessage>
    );
  }

  if (list.items.length === 0) {
    return filtered ? (
      <EmptyState
        action={
          <Button onClick={onReset} size="compact" variant="secondary">
            {t('commercial.filters.reset')}
          </Button>
        }
        title={t('commercial.list.empty.noMatchesTitle')}
      >
        {t('commercial.list.empty.noMatches')}
      </EmptyState>
    ) : (
      <EmptyState title={t(`commercial.list.empty.noneTitle.${kind}`)}>
        {t('commercial.list.empty.none')}
      </EmptyState>
    );
  }

  return (
    <div className="commercial-list">
      <p aria-live="polite" className="commercial-list__count">
        {t('commercial.list.count', { count: list.total })}
      </p>
      <table aria-label={t(`commercial.kindsPlural.${kind}`)} className="commercial-table">
        <thead>
          <tr>
            <th scope="col">{t('commercial.list.columns.reference')}</th>
            <th scope="col">{t('commercial.list.columns.status')}</th>
            <th scope="col">{t(`commercial.list.columns.date.${kind}`)}</th>
            <th className="commercial-table__amount" scope="col">
              {t('commercial.list.columns.total')}
            </th>
          </tr>
        </thead>
        <tbody>
          {list.items.map((record) => {
            const selected = record.id === selectedId;
            const date = primaryDate(kind, record);
            return (
              <tr data-selected={selected ? 'true' : undefined} key={record.id}>
                <th scope="row">
                  <button
                    aria-current={selected ? 'true' : undefined}
                    className="commercial-table__select"
                    onClick={() => onSelect(record)}
                    type="button"
                  >
                    {record.reference}
                  </button>
                  <span className="commercial-table__secondary">{record.display.clientName}</span>
                  {kind === 'contract' ? (
                    <span className="commercial-table__secondary">
                      {t(
                        `commercial.businessType.${(record as CommercialContractSummary).businessType}`,
                      )}
                    </span>
                  ) : null}
                </th>
                <td data-label={t('commercial.list.columns.status')}>
                  <StatusBadge tone={statusTone(record.status)}>
                    {status(kind, record.status)}
                  </StatusBadge>
                </td>
                <td className="u-tabular" data-label={t(`commercial.list.columns.date.${kind}`)}>
                  {date ? (
                    <time dateTime={date}>{formatDate(date)}</time>
                  ) : (
                    <span className="commercial-muted">{t('commercial.common.notSet')}</span>
                  )}
                </td>
                <td
                  className="commercial-table__amount u-tabular"
                  data-label={t('commercial.list.columns.total')}
                >
                  {record.amounts ? (
                    <span className="commercial-money">
                      {money(record.amounts.totalCents, record.amounts.currency)}
                    </span>
                  ) : (
                    <span className="commercial-muted">{t('commercial.common.hidden')}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <ListPagination
        labels={{
          next: t('commercial.list.pagination.next'),
          page: (values) => t('commercial.list.pagination.page', values),
          previous: t('commercial.list.pagination.previous'),
          range: (values) => t('commercial.list.pagination.range', values),
          region: t('commercial.list.pagination.region'),
        }}
        onPage={onPage}
        page={list.page}
        pageSize={list.pageSize}
        total={list.total}
      />
    </div>
  );
}
