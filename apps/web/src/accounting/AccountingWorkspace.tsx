import { EmptyState, InlineMessage, PageHeader } from '../ui/index.js';
import type { AccountingAccess, AccountingArea } from './accounting-access.js';
import { useAccountingFormat } from './accounting-labels.js';
import type { AccountingLoaders, AccountingSession, PaymentPrefill } from './accounting-session.js';
import { BalancesArea } from './BalancesArea.js';
import { ExpensesArea } from './ExpensesArea.js';
import { PaymentsArea } from './PaymentsArea.js';
import { ProfitabilityArea } from './ProfitabilityArea.js';

export function AccountingWorkspace({
  access,
  area,
  areas,
  loaders,
  onArea,
  onPrefillConsumed,
  onRecordPayment,
  prefill,
  session,
}: {
  access: AccountingAccess;
  area: AccountingArea;
  areas: AccountingArea[];
  loaders: AccountingLoaders;
  onArea: (area: AccountingArea) => void;
  onPrefillConsumed: () => void;
  onRecordPayment: (prefill: Omit<PaymentPrefill, 'token'>) => void;
  prefill: PaymentPrefill | null;
  session: AccountingSession;
}) {
  const { t } = useAccountingFormat();
  const writesLocked = session.pending !== null;
  const props = { access, loaders, session };

  return (
    <section aria-label={t('accounting.region')} className="accounting">
      <PageHeader
        description={t('accounting.header.description')}
        eyebrow={t('accounting.header.eyebrow')}
        title={t('accounting.header.title')}
      />

      <ol aria-label={t('accounting.header.chainLabel')} className="accounting-chain-hint">
        <li>{t('accounting.header.chain.quotation')}</li>
        <li>{t('accounting.header.chain.purchaseOrder')}</li>
        <li>{t('accounting.header.chain.invoice')}</li>
        <li aria-current="step">{t('accounting.header.chain.payment')}</li>
      </ol>

      {areas.length > 0 && access.readOnly ? (
        <InlineMessage title={t('accounting.notices.readOnly.title')} tone="info">
          <p className="accounting-message__text">{t('accounting.notices.readOnly.body')}</p>
        </InlineMessage>
      ) : null}
      {areas.length > 0 && !access.amounts ? (
        <InlineMessage title={t('accounting.notices.amountsHidden.title')} tone="info">
          <p className="accounting-message__text">{t('accounting.notices.amountsHidden.body')}</p>
        </InlineMessage>
      ) : null}

      {areas.length === 0 ? (
        <EmptyState title={t('accounting.empty.noAccessTitle')}>
          {t('accounting.empty.noAccess')}
        </EmptyState>
      ) : (
        <>
          <div aria-label={t('accounting.areaTabs')} className="accounting-areas" role="group">
            {areas.map((option) => (
              <button
                aria-pressed={option === area}
                className="accounting-areas__option"
                disabled={writesLocked && option !== area}
                key={option}
                onClick={() => onArea(option)}
                type="button"
              >
                {t(`accounting.areas.${option}`)}
              </button>
            ))}
          </div>

          {area === 'payments' ? (
            <PaymentsArea {...props} onPrefillConsumed={onPrefillConsumed} prefill={prefill} />
          ) : null}
          {area === 'expenses' ? <ExpensesArea {...props} /> : null}
          {area === 'balances' ? (
            <BalancesArea {...props} onRecordPayment={onRecordPayment} />
          ) : null}
          {area === 'profitability' ? <ProfitabilityArea {...props} /> : null}
        </>
      )}
    </section>
  );
}
