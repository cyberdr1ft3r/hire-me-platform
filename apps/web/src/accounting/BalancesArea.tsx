import type {
  ClientReceivableSummary,
  OverdueReceivableListResponse,
  OverdueReceivableRow,
} from '@hire-me/contracts';
import { useEffect, useRef, useState } from 'react';

import { getClientReceivables, listOverdueReceivables } from '../api.js';
import { ListPagination } from '../clients/ListPagination.js';
import { CommercialOptionPicker } from '../commercial/CommercialOptionPicker.js';
import { Button, EmptyState, InlineMessage } from '../ui/index.js';
import { useAccountingFormat } from './accounting-labels.js';
import type { AreaProps, PaymentPrefill } from './accounting-session.js';
import { ACCOUNTING_PAGE_SIZE, type PickerOption } from './accounting-state.js';
import { DateText, ErrorBlock, LoadingBlock, Money } from './AccountingParts.js';

type Load<Value> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; value: Value };

export function BalancesArea({
  access,
  loaders,
  onRecordPayment,
  session,
}: AreaProps & { onRecordPayment: (prefill: Omit<PaymentPrefill, 'token'>) => void }) {
  const { formatDateTime, t } = useAccountingFormat();
  const mounted = useRef(true);
  const summaryRequest = useRef(0);
  const overdueRequest = useRef(0);
  const [client, setClient] = useState<PickerOption | null>(null);
  const [summary, setSummary] = useState<Load<ClientReceivableSummary>>({ status: 'idle' });
  const [overduePage, setOverduePage] = useState(1);
  const [overdue, setOverdue] = useState<Load<OverdueReceivableListResponse>>({
    status: access.balances ? 'loading' : 'idle',
  });

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      summaryRequest.current += 1;
      overdueRequest.current += 1;
    };
  }, []);

  useEffect(() => {
    if (!access.balances) return;
    void loadOverdue(client, overduePage);
  }, [access.balances, client?.id, overduePage]);

  function capture(): () => boolean {
    const sameSession = session.capture();
    return () => mounted.current && sameSession();
  }

  async function loadSummary(forClient: PickerOption): Promise<void> {
    const request = ++summaryRequest.current;
    const isCurrent = capture();
    setSummary({ status: 'loading' });
    try {
      const response = await getClientReceivables(session.token(), forClient.id);
      if (request !== summaryRequest.current || !isCurrent()) return;
      setSummary({ status: 'ready', value: response.receivables });
    } catch {
      if (request === summaryRequest.current && isCurrent()) setSummary({ status: 'error' });
    }
  }

  async function loadOverdue(forClient: PickerOption | null, page: number): Promise<void> {
    const request = ++overdueRequest.current;
    const isCurrent = capture();
    setOverdue({ status: 'loading' });
    try {
      const response = await listOverdueReceivables(session.token(), {
        ...(forClient ? { clientId: forClient.id } : {}),
        page,
        pageSize: ACCOUNTING_PAGE_SIZE,
      });
      if (request !== overdueRequest.current || !isCurrent()) return;
      setOverdue({ status: 'ready', value: response });
    } catch {
      if (request === overdueRequest.current && isCurrent()) setOverdue({ status: 'error' });
    }
  }

  function chooseClient(next: PickerOption | null): void {
    summaryRequest.current += 1;
    setClient(next);
    setOverduePage(1);
    if (next) void loadSummary(next);
    else setSummary({ status: 'idle' });
  }

  if (!access.balances) {
    return (
      <div className="accounting-area">
        <h2 className="accounting__pane-title">{t('accounting.balances.title')}</h2>
        <InlineMessage title={t('accounting.notices.balancesUnavailable.title')} tone="info">
          <p className="accounting-message__text">
            {t('accounting.notices.balancesUnavailable.body')}
          </p>
        </InlineMessage>
      </div>
    );
  }

  const canRecord = access.payments.record && access.areas.payments;

  return (
    <div className="accounting-area">
      <div className="accounting-area__header">
        <h2 className="accounting__pane-title" id="accounting-balances-title">
          {t('accounting.balances.title')}
        </h2>
      </div>
      <p className="accounting-muted">{t('accounting.balances.description')}</p>

      <section aria-labelledby="accounting-balances-title" className="accounting-balances">
        <div className="accounting-filters accounting-filters--single">
          <CommercialOptionPicker
            emptyLabel={t('accounting.balances.allClients')}
            hint={t('accounting.filters.clientHint')}
            label={t('accounting.form.client')}
            loadOptions={loaders.clients}
            onChange={chooseClient}
            sourceKey={`${session.key}:balances-clients`}
            value={client}
          />
        </div>

        {client ? (
          <section aria-labelledby="accounting-balance-summary" className="accounting-section">
            <h3 className="accounting-section__title" id="accounting-balance-summary">
              {t('accounting.balances.summaryTitle', { client: client.label })}
            </h3>
            {summary.status === 'loading' || summary.status === 'idle' ? (
              <LoadingBlock label={t('accounting.balances.loading')} />
            ) : summary.status === 'error' ? (
              <ErrorBlock
                body={t('accounting.balances.error')}
                onRetry={() => void loadSummary(client)}
                title={t('accounting.balances.errorTitle')}
              />
            ) : summary.value.totalsByCurrency.length === 0 ? (
              <EmptyState title={t('accounting.balances.emptyTitle')}>
                {t('accounting.balances.empty')}
              </EmptyState>
            ) : (
              <>
                <div className="accounting-list">
                  <table
                    aria-labelledby="accounting-balance-summary"
                    className="accounting-table accounting-table--figures"
                  >
                    <thead>
                      <tr>
                        <th scope="col">{t('accounting.common.currency')}</th>
                        <th className="accounting-table__amount" scope="col">
                          {t('accounting.balances.columns.invoiced')}
                        </th>
                        <th className="accounting-table__amount" scope="col">
                          {t('accounting.balances.columns.paid')}
                        </th>
                        <th className="accounting-table__amount" scope="col">
                          {t('accounting.balances.columns.outstanding')}
                        </th>
                        <th className="accounting-table__amount" scope="col">
                          {t('accounting.balances.columns.overdue')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.value.totalsByCurrency.map((row) => (
                        <tr key={row.currency}>
                          <th scope="row">{row.currency}</th>
                          <td
                            className="accounting-table__amount u-tabular"
                            data-label={t('accounting.balances.columns.invoiced')}
                          >
                            <Money cents={row.invoicedCents} currency={row.currency} />
                          </td>
                          <td
                            className="accounting-table__amount u-tabular"
                            data-label={t('accounting.balances.columns.paid')}
                          >
                            <Money cents={row.allocatedCents} currency={row.currency} />
                          </td>
                          <td
                            className="accounting-table__amount u-tabular"
                            data-label={t('accounting.balances.columns.outstanding')}
                          >
                            <Money cents={row.outstandingCents} currency={row.currency} strong />
                          </td>
                          <td
                            className="accounting-table__amount u-tabular"
                            data-label={t('accounting.balances.columns.overdue')}
                          >
                            <Money cents={row.overdueOutstandingCents} currency={row.currency} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="accounting-muted">
                  {t('accounting.balances.currencyNote')}{' '}
                  {t('accounting.common.asOf', { time: formatDateTime(summary.value.asOf) })}
                </p>
              </>
            )}
          </section>
        ) : null}

        <section aria-labelledby="accounting-overdue-title" className="accounting-section">
          <h3 className="accounting-section__title" id="accounting-overdue-title">
            {client
              ? t('accounting.balances.overdueTitleClient', { client: client.label })
              : t('accounting.balances.overdueTitle')}
          </h3>
          <OverdueList
            canRecord={canRecord}
            onPage={setOverduePage}
            onRecordPayment={(row) =>
              onRecordPayment({
                client: { detail: null, id: row.clientId, label: row.display.clientName },
                currency: row.amounts?.currency ?? 'MAD',
                invoice: { detail: null, id: row.invoiceId, label: row.reference },
                outstandingCents: row.amounts?.outstandingCents ?? null,
              })
            }
            onRetry={() => void loadOverdue(client, overduePage)}
            state={overdue}
            writesLocked={session.pending !== null}
          />
        </section>
      </section>
    </div>
  );
}

function OverdueList({
  canRecord,
  onPage,
  onRecordPayment,
  onRetry,
  state,
  writesLocked,
}: {
  canRecord: boolean;
  onPage: (page: number) => void;
  onRecordPayment: (row: OverdueReceivableRow) => void;
  onRetry: () => void;
  state: Load<OverdueReceivableListResponse>;
  writesLocked: boolean;
}) {
  const { formatDateTime, t } = useAccountingFormat();
  if (state.status === 'loading' || state.status === 'idle') {
    return <LoadingBlock label={t('accounting.balances.overdueLoading')} />;
  }
  if (state.status === 'error') {
    return (
      <ErrorBlock
        body={t('accounting.balances.overdueError')}
        onRetry={onRetry}
        title={t('accounting.balances.overdueErrorTitle')}
      />
    );
  }
  const { rows, pagination, asOf } = state.value;
  if (rows.length === 0) {
    return (
      <EmptyState title={t('accounting.balances.overdueEmptyTitle')}>
        {t('accounting.balances.overdueEmpty')}
      </EmptyState>
    );
  }
  return (
    <div className="accounting-list">
      <p aria-live="polite" className="accounting-list__count">
        {t('accounting.balances.overdueCount', { count: pagination.total })}
      </p>
      <table aria-labelledby="accounting-overdue-title" className="accounting-table">
        <thead>
          <tr>
            <th scope="col">{t('accounting.balances.columns.invoice')}</th>
            <th scope="col">{t('accounting.balances.columns.due')}</th>
            <th className="accounting-table__amount" scope="col">
              {t('accounting.balances.columns.total')}
            </th>
            <th className="accounting-table__amount" scope="col">
              {t('accounting.balances.columns.outstanding')}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.invoiceId}>
              <th scope="row">
                <span className="accounting-table__primary">{row.reference}</span>
                <span className="accounting-table__secondary">{row.display.clientName}</span>
                {canRecord && row.amounts ? (
                  <Button
                    aria-label={t('accounting.balances.recordPaymentFor', {
                      reference: row.reference,
                    })}
                    disabled={writesLocked}
                    onClick={() => onRecordPayment(row)}
                    size="compact"
                    variant="secondary"
                  >
                    {t('accounting.balances.recordPayment')}
                  </Button>
                ) : null}
              </th>
              <td className="u-tabular" data-label={t('accounting.balances.columns.due')}>
                <DateText value={row.dueDate} />
                <span className="accounting-table__secondary">
                  {t('accounting.balances.daysOverdue', { count: row.daysOverdue })}
                </span>
              </td>
              <td
                className="accounting-table__amount u-tabular"
                data-label={t('accounting.balances.columns.total')}
              >
                <Money cents={row.amounts?.totalCents} currency={row.amounts?.currency} />
              </td>
              <td
                className="accounting-table__amount u-tabular"
                data-label={t('accounting.balances.columns.outstanding')}
              >
                <Money
                  cents={row.amounts?.outstandingCents}
                  currency={row.amounts?.currency}
                  strong
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <ListPagination
        labels={{
          next: t('accounting.pagination.next'),
          page: (values) => t('accounting.pagination.page', values),
          previous: t('accounting.pagination.previous'),
          range: (values) => t('accounting.pagination.range', values),
          region: t('accounting.balances.paginationRegion'),
        }}
        onPage={onPage}
        page={pagination.page}
        pageSize={pagination.pageSize}
        total={pagination.total}
      />
      <p className="accounting-muted">
        {t('accounting.common.asOf', { time: formatDateTime(asOf) })}
      </p>
    </div>
  );
}
