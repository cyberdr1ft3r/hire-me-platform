import type { QuotationDetail } from '@hire-me/contracts';

type CommercialHistoryEvent = QuotationDetail['history'][number];
type CommercialLine = NonNullable<QuotationDetail['lines']>[number];
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';

import { Button, InlineMessage, Skeleton, StatusBadge, TextArea, TextField } from '../ui/index.js';
import type { CommercialAccess } from './commercial-access.js';
import {
  actionAcceptsReason,
  actionNeedsConfirmation,
  actionRequiresReason,
  commercialChain,
  followUpKinds,
  lifecycleActions,
  statusTone,
  type CommercialDetail,
  type CommercialKind,
  type CommercialStatus,
  type LifecycleAction,
} from './commercial-kinds.js';
import {
  actionKey,
  historyActionKey,
  useCommercialFormat,
  type CommercialFormat,
} from './commercial-labels.js';
import { CommercialGeneration } from './CommercialGeneration.js';
import type { CommercialWriteAction } from './CommercialPanel.js';
import type { DetailPane } from './CommercialWorkspace.js';

const DESTRUCTIVE: ReadonlySet<LifecycleAction> = new Set([
  'archive',
  'cancel',
  'expire',
  'reject',
]);

export function CommercialDetailView({
  access,
  detail,
  kind,
  onFollowUp,
  pending,
  selectedId,
}: {
  access: CommercialAccess;
  detail: DetailPane;
  kind: CommercialKind;
  onFollowUp: (target: CommercialKind, from: CommercialDetail) => void;
  pending: CommercialWriteAction | null;
  selectedId: string | null;
}) {
  const { message, t } = useCommercialFormat();
  const state = detail.state;

  if (!selectedId || state.status === 'idle') {
    return (
      <p className="commercial-muted commercial-detail__prompt">
        {t(`commercial.detail.selectPrompt.${kind}`)}
      </p>
    );
  }
  if (state.status === 'loading') {
    return (
      <div aria-busy="true">
        <Skeleton label={t('commercial.detail.loading')} />
      </div>
    );
  }
  if (state.status === 'error') {
    return (
      <InlineMessage announce title={t('commercial.detail.errorTitle')} tone="danger">
        <p className="commercial-message__text">{message(state.messageKey)}</p>
        <Button onClick={detail.onRetry} size="compact" variant="secondary">
          {t('common.actions.retry')}
        </Button>
      </InlineMessage>
    );
  }
  const record = state.detail.record;
  return (
    <RecordDetail
      access={access}
      detail={state.detail}
      focusToken={detail.focusToken}
      generation={detail.generation}
      key={`${record.id}:${record.status}:${record.updatedAt}`}
      onAction={detail.onAction}
      onFollowUp={onFollowUp}
      pending={pending}
    />
  );
}

type Confirming = { action: LifecycleAction; reason: string; issueDate: string; dueDate: string };

function RecordDetail({
  access,
  detail,
  focusToken,
  generation,
  onAction,
  onFollowUp,
  pending,
}: {
  access: CommercialAccess;
  detail: CommercialDetail;
  focusToken: number;
  generation: DetailPane['generation'];
  onAction: DetailPane['onAction'];
  onFollowUp: (target: CommercialKind, from: CommercialDetail) => void;
  pending: CommercialWriteAction | null;
}) {
  const format = useCommercialFormat();
  const { formatDateTime, t } = format;
  const heading = useRef<HTMLHeadingElement>(null);
  const [confirming, setConfirming] = useState<Confirming | null>(null);
  const [reasonError, setReasonError] = useState(false);
  const { kind, record } = detail;
  const writesLocked = pending !== null;
  const archived = record.archivedAt !== null || record.status === 'ARCHIVED';

  useEffect(() => {
    if (focusToken > 0) heading.current?.focus();
  }, [focusToken]);

  const actions = access.manage[kind]
    ? lifecycleActions(kind, record.status, archived)
    : { primary: null, secondary: [] };
  const followUps = archived
    ? []
    : followUpKinds(kind, record.status).filter((target) => access.manage[target]);
  const chain = commercialChain(detail);

  function start(action: LifecycleAction): void {
    if (actionNeedsConfirmation(kind, action)) {
      setReasonError(false);
      setConfirming({ action, dueDate: '', issueDate: '', reason: '' });
      return;
    }
    void onAction(action, {});
  }

  function confirm(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!confirming) return;
    if (actionRequiresReason(kind, confirming.action) && !confirming.reason.trim()) {
      setReasonError(true);
      return;
    }
    void onAction(confirming.action, {
      dueDate: confirming.dueDate || undefined,
      issueDate: confirming.issueDate || undefined,
      reason: confirming.reason,
    });
  }

  return (
    <article aria-labelledby="commercial-record-title" className="commercial-detail">
      <header className="commercial-detail__heading">
        <p className="commercial-detail__kind">{t(`commercial.kinds.${kind}`)}</p>
        <h2
          className="commercial-detail__title"
          id="commercial-record-title"
          ref={heading}
          tabIndex={-1}
        >
          {record.reference}
        </h2>
        <div className="commercial-detail__badges">
          <StatusBadge tone={statusTone(record.status)}>
            {format.status(kind, record.status)}
          </StatusBadge>
          {detail.kind === 'contract' ? (
            <StatusBadge>{t(`commercial.businessType.${detail.record.businessType}`)}</StatusBadge>
          ) : null}
        </div>
      </header>

      <RecordFacts detail={detail} format={format} />

      {chain.length > 1 ? (
        <section aria-labelledby="commercial-chain-title" className="commercial-section">
          <h3 className="commercial-section__title" id="commercial-chain-title">
            {t('commercial.detail.chain.title')}
          </h3>
          <ol className="commercial-chain">
            {chain.map((link) => (
              <li
                aria-current={link.current ? 'step' : undefined}
                data-linked={link.linked ? 'true' : 'false'}
                key={link.kind}
              >
                <span className="commercial-chain__kind">{t(`commercial.kinds.${link.kind}`)}</span>
                <span className="commercial-chain__reference">
                  {link.reference ??
                    (link.linked
                      ? t('commercial.detail.chain.restricted')
                      : t('commercial.detail.chain.notLinked'))}
                </span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {actions.primary || actions.secondary.length > 0 ? (
        <section aria-labelledby="commercial-lifecycle-title" className="commercial-section">
          <h3 className="commercial-section__title" id="commercial-lifecycle-title">
            {t('commercial.detail.lifecycleTitle')}
          </h3>
          {confirming ? (
            <form
              aria-label={t(`commercial.detail.confirm.title.${confirming.action}`)}
              className="commercial-form commercial-form--panel"
              noValidate
              onSubmit={confirm}
            >
              <p className="commercial-message__text">
                {t(`commercial.detail.confirm.body.${confirming.action}`, {
                  reference: record.reference,
                })}
              </p>
              {kind === 'invoice' && confirming.action === 'issue' ? (
                <div className="commercial-form__grid">
                  <TextField
                    hint={t('commercial.detail.confirm.issueDateHint')}
                    label={t('commercial.detail.facts.issueDate')}
                    onChange={(event) =>
                      setConfirming({ ...confirming, issueDate: event.currentTarget.value })
                    }
                    type="date"
                    value={confirming.issueDate}
                  />
                  <TextField
                    hint={t('commercial.detail.confirm.dueDateHint')}
                    label={t('commercial.detail.facts.dueDate')}
                    onChange={(event) =>
                      setConfirming({ ...confirming, dueDate: event.currentTarget.value })
                    }
                    type="date"
                    value={confirming.dueDate}
                  />
                </div>
              ) : null}
              {actionAcceptsReason(kind, confirming.action) ? (
                <TextArea
                  error={reasonError ? t('commercial.detail.confirm.reasonRequired') : undefined}
                  hint={
                    actionRequiresReason(kind, confirming.action)
                      ? t('commercial.detail.confirm.reasonRequiredHint')
                      : t('commercial.detail.confirm.reasonHint')
                  }
                  label={t('commercial.detail.confirm.reason')}
                  maxLength={500}
                  onChange={(event) => {
                    setReasonError(false);
                    setConfirming({ ...confirming, reason: event.currentTarget.value });
                  }}
                  required={actionRequiresReason(kind, confirming.action)}
                  rows={3}
                  value={confirming.reason}
                />
              ) : null}
              <div className="commercial-actions">
                <Button
                  loading={pending === 'lifecycle'}
                  loadingLabel={t('common.status.working')}
                  disabled={writesLocked}
                  size="compact"
                  type="submit"
                  variant={DESTRUCTIVE.has(confirming.action) ? 'danger' : 'primary'}
                >
                  {t(`commercial.detail.confirm.submit.${confirming.action}`)}
                </Button>
                <Button onClick={() => setConfirming(null)} size="compact" variant="quiet">
                  {t('commercial.detail.confirm.back')}
                </Button>
              </div>
            </form>
          ) : (
            <div
              aria-label={t('commercial.detail.actionsLabel')}
              className="commercial-actions"
              role="group"
            >
              {actions.primary ? (
                <Button
                  disabled={writesLocked}
                  loading={pending === 'lifecycle'}
                  loadingLabel={t('common.status.working')}
                  onClick={() => start(actions.primary as LifecycleAction)}
                  size="compact"
                >
                  {format.message(actionKey(actions.primary))}
                </Button>
              ) : null}
              {actions.secondary.map((action) => (
                <Button
                  disabled={writesLocked}
                  key={action}
                  onClick={() => start(action)}
                  size="compact"
                  variant={DESTRUCTIVE.has(action) ? 'quiet' : 'secondary'}
                >
                  {format.message(actionKey(action))}
                </Button>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {followUps.length > 0 ? (
        <section aria-labelledby="commercial-followups-title" className="commercial-section">
          <h3 className="commercial-section__title" id="commercial-followups-title">
            {t('commercial.detail.followUps.title')}
          </h3>
          <div className="commercial-actions">
            {followUps.map((target) => (
              <Button
                disabled={writesLocked}
                key={target}
                onClick={() => onFollowUp(target, detail)}
                size="compact"
                variant="secondary"
              >
                {t(`commercial.detail.followUps.create.${target}`)}
              </Button>
            ))}
          </div>
        </section>
      ) : null}

      <CommercialGeneration
        access={access}
        actions={generation}
        detail={detail}
        writesLocked={writesLocked}
      />

      {'lines' in record && record.lines ? (
        <LinesTable
          format={format}
          lines={record.lines}
          currency={record.amounts?.currency ?? null}
        />
      ) : null}

      <section aria-labelledby="commercial-history-title" className="commercial-section">
        <h3 className="commercial-section__title" id="commercial-history-title">
          {t('commercial.detail.history.title')}
        </h3>
        {record.history.length === 0 ? (
          <p className="commercial-muted">{t('commercial.detail.history.empty')}</p>
        ) : (
          <ol className="commercial-history">
            {[...record.history]
              .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
              .map((event) => (
                <HistoryItem event={event} format={format} key={event.id} kind={kind} />
              ))}
          </ol>
        )}
        <p className="commercial-muted">
          {t('commercial.detail.facts.updated')}{' '}
          <time dateTime={record.updatedAt}>{formatDateTime(record.updatedAt)}</time>
        </p>
      </section>
    </article>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function RecordFacts({ detail, format }: { detail: CommercialDetail; format: CommercialFormat }) {
  const { formatDate, money, t } = format;
  const { record } = detail;
  const { display } = record;
  const date = (value: string | null) =>
    value ? (
      <time dateTime={value}>{formatDate(value)}</time>
    ) : (
      <span className="commercial-muted">{t('commercial.common.notSet')}</span>
    );

  return (
    <>
      <dl className="commercial-facts">
        <Fact label={t('commercial.detail.facts.client')}>{display.clientName}</Fact>
        <Fact label={t('commercial.detail.facts.mission')}>
          {record.recruitmentMissionId === null ? (
            <span className="commercial-muted">{t('commercial.detail.facts.noMission')}</span>
          ) : (
            (display.missionTitle ?? (
              <span className="commercial-muted">{t('commercial.detail.chain.restricted')}</span>
            ))
          )}
        </Fact>
        {detail.kind === 'quotation' ? (
          <>
            <Fact label={t('commercial.detail.facts.issueDate')}>
              {date(detail.record.issueDate)}
            </Fact>
            <Fact label={t('commercial.detail.facts.validUntil')}>
              {date(detail.record.validUntil)}
            </Fact>
          </>
        ) : null}
        {detail.kind === 'contract' ? (
          <>
            <Fact label={t('commercial.detail.facts.effectiveDate')}>
              {date(detail.record.effectiveDate)}
            </Fact>
            <Fact label={t('commercial.detail.facts.startDate')}>
              {date(detail.record.startDate)}
            </Fact>
            <Fact label={t('commercial.detail.facts.endDate')}>{date(detail.record.endDate)}</Fact>
          </>
        ) : null}
        {detail.kind === 'purchaseOrder' ? (
          <>
            <Fact label={t('commercial.detail.facts.issueDate')}>
              {date(detail.record.issueDate)}
            </Fact>
            <Fact label={t('commercial.detail.facts.receivedDate')}>
              {date(detail.record.receivedDate)}
            </Fact>
          </>
        ) : null}
        {detail.kind === 'invoice' ? (
          <>
            <Fact label={t('commercial.detail.facts.issueDate')}>
              {date(detail.record.issueDate)}
            </Fact>
            <Fact label={t('commercial.detail.facts.dueDate')}>{date(detail.record.dueDate)}</Fact>
            {detail.record.missionPlacementId ? (
              <Fact label={t('commercial.detail.facts.placement')}>
                {display.placement ? (
                  t('commercial.detail.facts.placementDates', {
                    confirmed: formatDate(display.placement.confirmedAt),
                    start: formatDate(display.placement.integrationStartDate),
                  })
                ) : (
                  <span className="commercial-muted">
                    {t('commercial.detail.chain.restricted')}
                  </span>
                )}
              </Fact>
            ) : null}
            {detail.record.correctionOfInvoiceId ? (
              <Fact label={t('commercial.detail.facts.correctionOf')}>
                {display.correctionOfInvoiceReference ?? (
                  <span className="commercial-muted">
                    {t('commercial.detail.chain.restricted')}
                  </span>
                )}
              </Fact>
            ) : null}
          </>
        ) : null}
        <Fact label={t('commercial.detail.facts.created')}>{date(record.createdAt)}</Fact>
      </dl>

      <section aria-labelledby="commercial-amounts-title" className="commercial-section">
        <h3 className="commercial-section__title" id="commercial-amounts-title">
          {t('commercial.detail.amounts.title')}
        </h3>
        {record.amounts ? (
          <dl className="commercial-amounts">
            <Fact label={t('commercial.detail.amounts.subtotal')}>
              <span className="commercial-money">
                {money(record.amounts.subtotalCents, record.amounts.currency)}
              </span>
            </Fact>
            <Fact label={t('commercial.detail.amounts.tax')}>
              <span className="commercial-money">
                {money(record.amounts.taxCents, record.amounts.currency)}
              </span>
            </Fact>
            <Fact label={t('commercial.detail.amounts.total')}>
              <strong className="commercial-money">
                {money(record.amounts.totalCents, record.amounts.currency)}
              </strong>
            </Fact>
          </dl>
        ) : (
          <p className="commercial-muted">{t('commercial.detail.amounts.hidden')}</p>
        )}
        {detail.kind === 'contract' && detail.record.termsSummary ? (
          <div className="commercial-terms">
            <h4 className="commercial-section__subtitle">{t('commercial.detail.terms')}</h4>
            <p>{detail.record.termsSummary}</p>
          </div>
        ) : null}
      </section>
    </>
  );
}

function LinesTable({
  currency,
  format,
  lines,
}: {
  currency: string | null;
  format: CommercialFormat;
  lines: CommercialLine[];
}) {
  const { formatNumber, money, t, taxRate } = format;
  const amount = (cents: number) =>
    currency ? <span className="commercial-money">{money(cents, currency)}</span> : null;
  return (
    <section aria-labelledby="commercial-lines-title" className="commercial-section">
      <h3 className="commercial-section__title" id="commercial-lines-title">
        {t('commercial.detail.lines.title')}
      </h3>
      <div className="commercial-list">
        <table
          aria-labelledby="commercial-lines-title"
          className="commercial-table commercial-table--lines"
        >
          <thead>
            <tr>
              <th scope="col">{t('commercial.detail.lines.description')}</th>
              <th className="commercial-table__amount" scope="col">
                {t('commercial.detail.lines.quantity')}
              </th>
              <th className="commercial-table__amount" scope="col">
                {t('commercial.detail.lines.unitPrice')}
              </th>
              <th className="commercial-table__amount" scope="col">
                {t('commercial.detail.lines.taxRate')}
              </th>
              <th className="commercial-table__amount" scope="col">
                {t('commercial.detail.lines.total')}
              </th>
            </tr>
          </thead>
          <tbody>
            {[...lines]
              .sort((left, right) => left.sortOrder - right.sortOrder)
              .map((line) => (
                <tr key={line.id}>
                  <th className="commercial-break" scope="row">
                    {line.description}
                  </th>
                  <td
                    className="commercial-table__amount u-tabular"
                    data-label={t('commercial.detail.lines.quantity')}
                  >
                    {formatNumber(line.quantity)}
                  </td>
                  <td
                    className="commercial-table__amount u-tabular"
                    data-label={t('commercial.detail.lines.unitPrice')}
                  >
                    {amount(line.unitPriceCents)}
                  </td>
                  <td
                    className="commercial-table__amount u-tabular"
                    data-label={t('commercial.detail.lines.taxRate')}
                  >
                    {taxRate(line.taxRateBps)}
                  </td>
                  <td
                    className="commercial-table__amount u-tabular"
                    data-label={t('commercial.detail.lines.total')}
                  >
                    {amount(line.lineTotalCents)}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function HistoryItem({
  event,
  format,
  kind,
}: {
  event: CommercialHistoryEvent;
  format: CommercialFormat;
  kind: CommercialKind;
}) {
  const { formatDateTime, message, t } = format;
  const label = (status: string | null) =>
    status ? format.status(kind, status as CommercialStatus) : null;
  const from = label(event.previousStatus);
  const to = label(event.nextStatus);
  return (
    <li>
      <span className="commercial-history__action">{message(historyActionKey(event.action))}</span>
      {from && to && from !== to ? (
        <span className="commercial-history__transition">
          {t('commercial.detail.history.transition', { from, to })}
        </span>
      ) : null}
      {event.reason ? (
        <span className="commercial-history__reason commercial-break">{event.reason}</span>
      ) : null}
      <time className="commercial-muted" dateTime={event.createdAt}>
        {formatDateTime(event.createdAt)}
      </time>
    </li>
  );
}
