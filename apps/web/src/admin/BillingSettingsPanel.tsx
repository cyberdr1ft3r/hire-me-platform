import type { CompanyBillingSettings, InvoiceNumberSequenceResponse } from '@hire-me/contracts';
import { useEffect, useState } from 'react';

import {
  confirmInvoiceNumberBaseline,
  getCompanyBillingSettings,
  updateCompanyBillingSettings,
} from '../api.js';
import { useI18n } from '../i18n/index.js';
import { Button, InlineMessage, PageState, StatusBadge } from '../ui/index.js';
import { BillingNumberingDrawer, type NumberingChange } from './BillingNumberingDrawer.js';
import { BillingProfileDrawer } from './BillingProfileDrawer.js';
import {
  billingGroups,
  BillingSeriesChangedError,
  sameSeries,
  type BillingField,
  type BillingSettings,
} from './billing-settings-state.js';
import './billing-settings.css';

type Editor = { mode: 'profile' | NumberingChange['mode']; initial: BillingSettings };
type Notice = 'saved' | InvoiceNumberSequenceResponse['sequence'];

const wideValues: readonly BillingField[] = [
  'sellerAddress',
  'sellerEmail',
  'sellerWebsite',
  'paymentTerms',
  'bankDetails',
];

function editable({ updatedAt, ...settings }: CompanyBillingSettings): BillingSettings {
  void updatedAt;
  return settings;
}

export function BillingSettingsPanel({
  accessToken,
  canManage,
}: {
  accessToken: string;
  canManage: boolean;
}) {
  const { t, formatDateTime } = useI18n();
  const [settings, setSettings] = useState<CompanyBillingSettings | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    setFailed(false);
    void getCompanyBillingSettings(accessToken).then(
      (response) => {
        if (active) setSettings(response.settings);
      },
      () => {
        if (active) setFailed(true);
      },
    );
    return () => {
      active = false;
    };
  }, [accessToken, retry]);

  function open(mode: Editor['mode']) {
    if (!settings || !canManage) return;
    setNotice(null);
    setEditor({ mode, initial: editable(settings) });
  }

  async function saveProfile(changes: Partial<Pick<BillingSettings, BillingField>>) {
    const latest = (await getCompanyBillingSettings(accessToken)).settings;
    const response = await updateCompanyBillingSettings(accessToken, {
      ...editable(latest),
      ...changes,
    });
    setSettings(response.settings);
    setNotice('saved');
    setEditor(null);
  }

  async function saveNumbering(change: NumberingChange) {
    if (!editor) return;
    const latest = (await getCompanyBillingSettings(accessToken)).settings;
    if (!sameSeries(latest, editor.initial)) {
      setSettings(latest);
      throw new BillingSeriesChangedError();
    }
    if (change.mode === 'numbering') {
      const response = await updateCompanyBillingSettings(accessToken, {
        ...editable(latest),
        ...change.values,
      });
      setSettings(response.settings);
      setNotice('saved');
    } else {
      const { sequence } = await confirmInvoiceNumberBaseline(accessToken, change.values);
      setSettings(latest);
      setNotice(sequence);
    }
    setEditor(null);
  }

  return (
    <section aria-labelledby="billing-settings-title" className="admin-section billing-settings">
      <div className="billing-settings__heading">
        <div className="admin-section__heading">
          <h2 id="billing-settings-title">{t('admin.sections.billing.title')}</h2>
          <p>{t('admin.billing.description')}</p>
        </div>
        {settings && canManage ? (
          <Button onClick={() => open('profile')}>{t('admin.billing.editProfile')}</Button>
        ) : null}
      </div>
      {failed ? (
        <PageState
          kind="error"
          title={t('admin.billing.loadFailed')}
          action={
            <Button variant="secondary" onClick={() => setRetry((value) => value + 1)}>
              {t('common.actions.retry')}
            </Button>
          }
        />
      ) : null}
      {!settings && !failed ? (
        <PageState kind="loading" title={t('admin.billing.loading')} />
      ) : null}
      {settings ? (
        <>
          {notice === 'saved' ? (
            <InlineMessage announce title={t('admin.billing.saved')} tone="success">
              {null}
            </InlineMessage>
          ) : null}
          {!canManage ? (
            <p className="billing-settings__muted">{t('admin.billing.readOnly')}</p>
          ) : null}
          {settings.updatedAt ? (
            <p className="billing-settings__muted">
              {t('admin.billing.lastSaved', { date: formatDateTime(settings.updatedAt) })}
            </p>
          ) : null}
          {billingGroups.map(({ title, fields }) => (
            <section className="billing-settings__group" key={title}>
              <h3>{t(title)}</h3>
              <dl className="billing-settings__values">
                {fields.map((field) => (
                  <div data-wide={wideValues.includes(field) || undefined} key={field}>
                    <dt>{t(('admin.billing.' + field) as PlainBillingFieldLabel)}</dt>
                    <dd>
                      {settings[field] ?? (
                        <span className="billing-settings__muted">
                          {t('admin.billing.missing')}
                        </span>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
          <details className="billing-settings__numbering">
            <summary>
              <h3>{t('admin.billing.numberingTitle')}</h3>
            </summary>
            <div className="billing-settings__numbering-body">
              <p>{t('admin.billing.numberingHelp')}</p>
              <dl className="billing-settings__values">
                <div>
                  <dt>{t('admin.billing.state')}</dt>
                  <dd>
                    <StatusBadge tone={settings.invoiceNumberingEnabled ? 'success' : 'neutral'}>
                      {t(
                        settings.invoiceNumberingEnabled
                          ? 'admin.billing.enabled'
                          : 'admin.billing.disabled',
                      )}
                    </StatusBadge>
                  </dd>
                </div>
                <div>
                  <dt>{t('admin.billing.invoicePrefix')}</dt>
                  <dd>{settings.invoicePrefix ?? t('admin.billing.missing')}</dd>
                </div>
                <div>
                  <dt>{t('admin.billing.invoiceDigits')}</dt>
                  <dd>{settings.invoiceDigits ?? t('admin.billing.missing')}</dd>
                </div>
              </dl>
              {notice && notice !== 'saved' ? (
                <InlineMessage
                  announce
                  title={t('admin.billing.baselineConfirmed', {
                    prefix: notice.prefix,
                    year: String(notice.year),
                    number: notice.lastNumber,
                  })}
                  tone="success"
                >
                  {null}
                </InlineMessage>
              ) : null}
              {canManage ? (
                <>
                  <p>{t('admin.billing.baselineHelp')}</p>
                  <div className="billing-settings__actions">
                    <Button onClick={() => open('numbering')} variant="secondary">
                      {t('admin.billing.editNumbering')}
                    </Button>
                    <Button
                      aria-describedby={
                        !settings.invoicePrefix || !settings.invoiceDigits
                          ? 'billing-series-required'
                          : undefined
                      }
                      disabled={!settings.invoicePrefix || !settings.invoiceDigits}
                      onClick={() => open('baseline')}
                      variant="secondary"
                    >
                      {t('admin.billing.openBaseline')}
                    </Button>
                  </div>
                  {!settings.invoicePrefix || !settings.invoiceDigits ? (
                    <p id="billing-series-required">{t('admin.billing.seriesRequired')}</p>
                  ) : null}
                </>
              ) : null}
            </div>
          </details>
        </>
      ) : null}
      {canManage && editor?.mode === 'profile' ? (
        <BillingProfileDrawer
          settings={editor.initial}
          onClose={() => setEditor(null)}
          onSave={saveProfile}
        />
      ) : null}
      {canManage && editor && editor.mode !== 'profile' ? (
        <BillingNumberingDrawer
          mode={editor.mode}
          settings={editor.initial}
          onClose={() => setEditor(null)}
          onSave={saveNumbering}
        />
      ) : null}
    </section>
  );
}

type PlainBillingFieldLabel = `admin.billing.${BillingField}`;
