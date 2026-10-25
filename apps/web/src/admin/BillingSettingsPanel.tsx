import type { CompanyBillingSettingsUpdateRequest } from '@hire-me/contracts';
import { useEffect, useState, type FormEvent } from 'react';

import {
  confirmInvoiceNumberBaseline,
  getCompanyBillingSettings,
  updateCompanyBillingSettings,
} from '../api.js';
import { Button, PageHeader, TextField } from '../ui/index.js';
import { useI18n } from '../i18n/index.js';

const fields = [
  ['sellerLegalName', 'admin.billing.sellerLegalName'],
  ['sellerLegalForm', 'admin.billing.sellerLegalForm'],
  ['sellerCapital', 'admin.billing.sellerCapital'],
  ['sellerAddress', 'admin.billing.sellerAddress'],
  ['sellerRegistrationNumber', 'admin.billing.sellerRegistrationNumber'],
  ['sellerIce', 'admin.billing.sellerIce'],
  ['sellerTaxId', 'admin.billing.sellerTaxId'],
  ['sellerPatente', 'admin.billing.sellerPatente'],
  ['sellerPhone', 'admin.billing.sellerPhone'],
  ['sellerEmail', 'admin.billing.sellerEmail'],
  ['sellerWebsite', 'admin.billing.sellerWebsite'],
  ['paymentTerms', 'admin.billing.paymentTerms'],
  ['paymentMethod', 'admin.billing.paymentMethod'],
  ['bankDetails', 'admin.billing.bankDetails'],
] as const;

export function BillingSettingsPanel({
  accessToken,
  canManage,
}: {
  accessToken: string;
  canManage: boolean;
}) {
  const [settings, setSettings] = useState<CompanyBillingSettingsUpdateRequest | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const { t } = useI18n();

  useEffect(() => {
    let active = true;
    void getCompanyBillingSettings(accessToken)
      .then((response) => {
        if (!active) return;
        const { updatedAt, ...editable } = response.settings;
        void updatedAt;
        setSettings(editable);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [accessToken]);

  if (!settings) {
    return (
      <p role={error ? 'alert' : 'status'}>
        {t(error ? 'admin.billing.failed' : 'admin.billing.loading')}
      </p>
    );
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settings || !canManage || busy) return;
    setBusy(true);
    setError(false);
    try {
      const response = await updateCompanyBillingSettings(accessToken, settings);
      const { updatedAt, ...editable } = response.settings;
      void updatedAt;
      setSettings(editable);
      setMessage(t('admin.billing.saved'));
    } catch {
      setMessage(null);
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  async function confirmBaseline(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError(false);
    try {
      const response = await confirmInvoiceNumberBaseline(accessToken, {
        year: Number(data.get('year')),
        highestExternalNumber: Number(data.get('highestExternalNumber')),
        confirmed: true,
      });
      setMessage(
        t('admin.billing.baselineConfirmed', {
          prefix: response.sequence.prefix,
          year: String(response.sequence.year),
          number: response.sequence.lastNumber,
        }),
      );
    } catch {
      setMessage(null);
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="stack-lg" aria-labelledby="billing-settings-title">
      <PageHeader title={t('admin.billing.title')} description={t('admin.billing.description')} />
      <form className="form-grid" onSubmit={(event) => void save(event)}>
        {fields.map(([name, label]) => (
          <TextField
            key={name}
            label={t(label)}
            value={settings[name] ?? ''}
            disabled={!canManage}
            onChange={(event) => setSettings({ ...settings, [name]: event.target.value || null })}
          />
        ))}
        <TextField
          label={t('admin.billing.invoicePrefix')}
          value={settings.invoicePrefix ?? ''}
          disabled={!canManage}
          onChange={(event) =>
            setSettings({ ...settings, invoicePrefix: event.target.value.toUpperCase() || null })
          }
        />
        <TextField
          label={t('admin.billing.invoiceDigits')}
          type="number"
          min={3}
          max={8}
          value={settings.invoiceDigits ?? ''}
          disabled={!canManage}
          onChange={(event) =>
            setSettings({
              ...settings,
              invoiceDigits: event.target.value ? Number(event.target.value) : null,
            })
          }
        />
        <label>
          <input
            type="checkbox"
            checked={settings.invoiceNumberingEnabled}
            disabled={!canManage}
            onChange={(event) =>
              setSettings({ ...settings, invoiceNumberingEnabled: event.target.checked })
            }
          />{' '}
          {t('admin.billing.numberingEnabled')}
        </label>
        {canManage ? (
          <Button type="submit" disabled={busy}>
            {t('admin.billing.save')}
          </Button>
        ) : null}
      </form>
      {canManage ? (
        <form className="form-grid" onSubmit={(event) => void confirmBaseline(event)}>
          <h3>{t('admin.billing.baselineTitle')}</h3>
          <p>{t('admin.billing.baselineHelp')}</p>
          <TextField
            name="year"
            label={t('admin.billing.year')}
            type="number"
            min={2000}
            max={2200}
            required
          />
          <TextField
            name="highestExternalNumber"
            label={t('admin.billing.externalHighest')}
            type="number"
            min={0}
            required
          />
          <Button type="submit" disabled={busy}>
            {t('admin.billing.confirmBaseline')}
          </Button>
        </form>
      ) : null}
      {message ? <p role="status">{message}</p> : null}
      {error ? <p role="alert">{t('admin.billing.failed')}</p> : null}
    </section>
  );
}
