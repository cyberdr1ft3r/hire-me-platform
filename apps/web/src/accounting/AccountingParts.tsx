import type { ReactNode } from 'react';

import { Button, InlineMessage, Skeleton } from '../ui/index.js';
import { historyActionKey, useAccountingFormat } from './accounting-labels.js';
import type { AccountingFeedback } from './accounting-state.js';

type HistoryEvent = { id: string; action: string; reason: string | null; createdAt: string };

export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** An amount, or a muted "hidden" marker when the account cannot read amounts. */
export function Money({
  cents,
  currency,
  strong,
}: {
  cents: number | null | undefined;
  currency: string | null | undefined;
  strong?: boolean;
}) {
  const { money, t } = useAccountingFormat();
  if (cents === null || cents === undefined || !currency) {
    return <span className="accounting-muted">{t('accounting.common.hidden')}</span>;
  }
  const Tag = strong ? 'strong' : 'span';
  return <Tag className="accounting-money">{money(cents, currency)}</Tag>;
}

export function DateText({ value }: { value: string | null | undefined }) {
  const { formatDate, t } = useAccountingFormat();
  return value ? (
    <time dateTime={value}>{formatDate(value)}</time>
  ) : (
    <span className="accounting-muted">{t('accounting.common.notSet')}</span>
  );
}

export function FeedbackMessage({ feedback }: { feedback: AccountingFeedback | null }) {
  const { message, t } = useAccountingFormat();
  if (!feedback) return null;
  return (
    <InlineMessage
      announce
      title={
        feedback.tone === 'success'
          ? t('accounting.feedback.successTitle')
          : t('accounting.feedback.errorTitle')
      }
      tone={feedback.tone === 'success' ? 'success' : 'danger'}
    >
      <p className="accounting-message__text">{message(feedback.messageKey)}</p>
    </InlineMessage>
  );
}

export function LoadingBlock({ label }: { label: string }) {
  return (
    <div aria-busy="true">
      <Skeleton label={label} />
    </div>
  );
}

export function ErrorBlock({
  body,
  onRetry,
  title,
}: {
  body: string;
  onRetry: () => void;
  title: string;
}) {
  const { t } = useAccountingFormat();
  return (
    <InlineMessage announce title={title} tone="danger">
      <p className="accounting-message__text">{body}</p>
      <Button onClick={onRetry} size="compact" variant="secondary">
        {t('common.actions.retry')}
      </Button>
    </InlineMessage>
  );
}

/**
 * Localized action, date, and the business reason when one was recorded. The
 * server's English summary is never shown, and actors are not named (no
 * accounting-bounded user directory exists; see the Issue #131 audit).
 */
export function HistoryList({ events, id }: { events: HistoryEvent[]; id: string }) {
  const { formatDateTime, message, t } = useAccountingFormat();
  return (
    <section aria-labelledby={id} className="accounting-section">
      <h3 className="accounting-section__title" id={id}>
        {t('accounting.history.title')}
      </h3>
      {events.length === 0 ? (
        <p className="accounting-muted">{t('accounting.history.empty')}</p>
      ) : (
        <ol className="accounting-history">
          {[...events]
            .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
            .map((event) => (
              <li key={event.id}>
                <span className="accounting-history__action">
                  {message(historyActionKey(event.action))}
                </span>
                {event.reason ? (
                  <span className="accounting-history__reason accounting-break">
                    {event.reason}
                  </span>
                ) : null}
                <time className="accounting-muted" dateTime={event.createdAt}>
                  {formatDateTime(event.createdAt)}
                </time>
              </li>
            ))}
        </ol>
      )}
    </section>
  );
}
