import type { ProfitabilityContext, ProfitabilitySummary } from '@hire-me/contracts';
import { useEffect, useRef, useState } from 'react';

import { getProfitability } from '../api.js';
import { CommercialOptionPicker } from '../commercial/CommercialOptionPicker.js';
import { EmptyState, InlineMessage } from '../ui/index.js';
import { useAccountingFormat } from './accounting-labels.js';
import type { AreaProps } from './accounting-session.js';
import { accountingFailureKey, type PickerOption } from './accounting-state.js';
import { ErrorBlock, LoadingBlock, Money } from './AccountingParts.js';
import type { MessageKey } from '../i18n/index.js';

type Result =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; messageKey: MessageKey }
  | { status: 'ready'; summary: ProfitabilitySummary; label: string };

export function ProfitabilityArea({ access, loaders, session }: AreaProps) {
  const { context: contextLabel, formatDate, formatDateTime, message, t } = useAccountingFormat();
  const contexts = access.profitabilityContexts;
  const mounted = useRef(true);
  const request = useRef(0);
  const [context, setContext] = useState<ProfitabilityContext>(contexts[0] ?? 'CLIENT');
  const [target, setTarget] = useState<PickerOption | null>(null);
  const [mission, setMission] = useState<PickerOption | null>(null);
  const [result, setResult] = useState<Result>({ status: 'idle' });

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      request.current += 1;
    };
  }, []);

  async function load(forContext: ProfitabilityContext, option: PickerOption): Promise<void> {
    const current = ++request.current;
    const sameSession = session.capture();
    const isCurrent = () => mounted.current && sameSession() && current === request.current;
    setResult({ status: 'loading' });
    try {
      const response = await getProfitability(session.token(), forContext, option.id);
      if (!isCurrent()) return;
      setResult({ status: 'ready', summary: response.profitability, label: label(option) });
    } catch (error) {
      if (isCurrent()) setResult({ status: 'error', messageKey: accountingFailureKey(error) });
    }
  }

  function label(option: PickerOption): string {
    return option.placement
      ? t('accounting.expenses.placementLabel', {
          mission: option.label,
          start: formatDate(option.placement.integrationStartDate),
        })
      : option.label;
  }

  function chooseContext(next: ProfitabilityContext): void {
    if (next === context) return;
    request.current += 1;
    setContext(next);
    setTarget(null);
    setMission(null);
    setResult({ status: 'idle' });
  }

  function chooseTarget(option: PickerOption | null): void {
    request.current += 1;
    setTarget(option);
    if (option) void load(context, option);
    else setResult({ status: 'idle' });
  }

  if (!access.profitability || contexts.length === 0) {
    return (
      <div className="accounting-area">
        <h2 className="accounting__pane-title">{t('accounting.profitability.title')}</h2>
        <InlineMessage title={t('accounting.notices.profitabilityUnavailable.title')} tone="info">
          <p className="accounting-message__text">
            {t('accounting.notices.profitabilityUnavailable.body')}
          </p>
        </InlineMessage>
      </div>
    );
  }

  return (
    <div className="accounting-area">
      <div className="accounting-area__header">
        <h2 className="accounting__pane-title" id="accounting-profitability-title">
          {t('accounting.profitability.title')}
        </h2>
      </div>
      <p className="accounting-muted">{t('accounting.profitability.description')}</p>

      <section aria-labelledby="accounting-profitability-title" className="accounting-balances">
        {contexts.length > 1 ? (
          <div
            aria-label={t('accounting.profitability.contextLabel')}
            className="accounting-segments"
            role="group"
          >
            {contexts.map((option) => (
              <button
                aria-pressed={option === context}
                className="accounting-segments__option"
                key={option}
                onClick={() => chooseContext(option)}
                type="button"
              >
                {contextLabel(option)}
              </button>
            ))}
          </div>
        ) : null}

        <div className="accounting-filters accounting-filters--single">
          {context === 'CLIENT' ? (
            <CommercialOptionPicker
              hint={t('accounting.filters.clientHint')}
              label={t('accounting.form.client')}
              loadOptions={loaders.clients}
              onChange={chooseTarget}
              sourceKey={`${session.key}:profitability-clients`}
              value={target}
            />
          ) : null}
          {context === 'RECRUITMENT_MISSION' ? (
            <CommercialOptionPicker
              hint={t('accounting.expenses.form.missionHint')}
              label={t('accounting.expenses.form.mission')}
              loadOptions={loaders.missions(null)}
              onChange={chooseTarget}
              sourceKey={`${session.key}:profitability-missions`}
              value={target}
            />
          ) : null}
          {context === 'PLACEMENT' ? (
            <>
              <CommercialOptionPicker
                hint={t('accounting.expenses.form.missionHint')}
                label={t('accounting.expenses.form.mission')}
                loadOptions={loaders.missions(null)}
                onChange={(option) => {
                  setMission(option);
                  chooseTarget(null);
                }}
                sourceKey={`${session.key}:profitability-placement-missions`}
                value={mission}
              />
              {mission ? (
                <CommercialOptionPicker
                  formatOption={label}
                  hint={t('accounting.expenses.form.placementHint')}
                  label={t('accounting.expenses.form.placement')}
                  loadOptions={loaders.placements(mission.id)}
                  onChange={chooseTarget}
                  sourceKey={`${session.key}:profitability-placements:${mission.id}`}
                  value={target}
                />
              ) : null}
            </>
          ) : null}
        </div>

        <section aria-labelledby="accounting-profitability-result" className="accounting-section">
          <h3 className="accounting-section__title" id="accounting-profitability-result">
            {result.status === 'ready'
              ? t('accounting.profitability.resultTitle', { context: result.label })
              : t('accounting.profitability.resultEmptyTitle')}
          </h3>
          {result.status === 'idle' ? (
            <p className="accounting-muted">
              {t(
                `accounting.profitability.prompt.${context}` as 'accounting.profitability.prompt.CLIENT',
              )}
            </p>
          ) : null}
          {result.status === 'loading' ? (
            <LoadingBlock label={t('accounting.profitability.loading')} />
          ) : null}
          {result.status === 'error' ? (
            <ErrorBlock
              body={message(result.messageKey)}
              onRetry={() => {
                if (target) void load(context, target);
              }}
              title={t('accounting.profitability.errorTitle')}
            />
          ) : null}
          {result.status === 'ready' ? (
            result.summary.totalsByCurrency.length === 0 ? (
              <EmptyState title={t('accounting.profitability.emptyTitle')}>
                {t('accounting.profitability.empty')}
              </EmptyState>
            ) : (
              <>
                <div className="accounting-list">
                  <table
                    aria-labelledby="accounting-profitability-result"
                    className="accounting-table accounting-table--figures"
                  >
                    <thead>
                      <tr>
                        <th scope="col">{t('accounting.common.currency')}</th>
                        <th className="accounting-table__amount" scope="col">
                          {t('accounting.profitability.columns.revenue')}
                        </th>
                        <th className="accounting-table__amount" scope="col">
                          {t('accounting.profitability.columns.expenses')}
                        </th>
                        <th className="accounting-table__amount" scope="col">
                          {t('accounting.profitability.columns.margin')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.summary.totalsByCurrency.map((row) => (
                        <tr key={row.currency}>
                          <th scope="row">{row.currency}</th>
                          <td
                            className="accounting-table__amount u-tabular"
                            data-label={t('accounting.profitability.columns.revenue')}
                          >
                            <Money cents={row.revenueCents} currency={row.currency} />
                          </td>
                          <td
                            className="accounting-table__amount u-tabular"
                            data-label={t('accounting.profitability.columns.expenses')}
                          >
                            <Money cents={row.expenseCents} currency={row.currency} />
                          </td>
                          <td
                            className="accounting-table__amount u-tabular"
                            data-label={t('accounting.profitability.columns.margin')}
                          >
                            <Money cents={row.marginCents} currency={row.currency} strong />
                            {row.marginCents < 0 ? (
                              <span className="accounting-table__secondary">
                                {t('accounting.profitability.marginNegative')}
                              </span>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="accounting-muted">
                  {t('accounting.profitability.policy')}{' '}
                  {t('accounting.common.asOf', { time: formatDateTime(result.summary.asOf) })}
                </p>
              </>
            )
          ) : null}
        </section>
      </section>
    </div>
  );
}
