import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as api from '../api.js';
import { I18nProvider } from '../i18n/index.js';
import { BillingSettingsPanel } from './BillingSettingsPanel.js';

vi.mock('../api.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api.js')>()),
  getCompanyBillingSettings: vi.fn(),
  updateCompanyBillingSettings: vi.fn(),
  confirmInvoiceNumberBaseline: vi.fn(),
}));

const initial = {
  sellerLegalName: 'Synthetic Company',
  sellerLegalForm: null,
  sellerCapital: null,
  sellerAddress: null,
  sellerIce: null,
  sellerTaxId: null,
  sellerRegistrationNumber: null,
  sellerPatente: null,
  sellerPhone: null,
  sellerEmail: null,
  sellerWebsite: null,
  paymentTerms: null,
  paymentMethod: null,
  bankDetails: null,
  invoicePrefix: 'DEMO',
  invoiceDigits: 4,
  invoiceNumberingEnabled: false,
  updatedAt: '2026-10-25T12:00:00.000Z',
};

function showBilling(canManage = true, locale: 'en' | 'fr' = 'en') {
  render(
    <I18nProvider initialLocale={locale}>
      <BillingSettingsPanel accessToken="synthetic-token" canManage={canManage} />
    </I18nProvider>,
  );
}

async function openEditor(name: string, advanced = false) {
  if (advanced) {
    const title = await screen.findByRole('heading', {
      name: 'Invoice numbering and annual baseline',
    });
    title.closest('details')?.setAttribute('open', '');
  }
  fireEvent.click(await screen.findByRole('button', { name }));
  return within(screen.getByRole('dialog'));
}

describe('BillingSettingsPanel', () => {
  afterEach(() => vi.resetAllMocks());

  it('opens only the company profile and preserves the latest numbering settings and untouched fields', async () => {
    vi.mocked(api.getCompanyBillingSettings)
      .mockResolvedValueOnce({ settings: initial })
      .mockResolvedValue({
        settings: {
          ...initial,
          sellerPhone: 'Synthetic new phone',
          invoicePrefix: 'OTHER',
          invoiceNumberingEnabled: true,
        },
      });
    vi.mocked(api.updateCompanyBillingSettings).mockImplementation((_token, settings) =>
      Promise.resolve({ settings: { ...settings, updatedAt: initial.updatedAt } }),
    );
    showBilling();
    const editor = await openEditor('Edit company profile');
    expect(editor.queryByLabelText('Invoice prefix')).not.toBeInTheDocument();
    fireEvent.change(editor.getByLabelText('Legal company name'), {
      target: { value: 'Synthetic Company Updated' },
    });
    fireEvent.click(editor.getByRole('button', { name: 'Save company profile' }));
    expect(await screen.findByText('Billing settings saved.')).toBeVisible();
    expect(api.updateCompanyBillingSettings).toHaveBeenCalledWith(
      'synthetic-token',
      expect.objectContaining({
        sellerLegalName: 'Synthetic Company Updated',
        sellerPhone: 'Synthetic new phone',
        invoicePrefix: 'OTHER',
        invoiceDigits: 4,
        invoiceNumberingEnabled: true,
      }),
    );
  });

  it('validates email and retains ordinary edits after a failed save', async () => {
    vi.mocked(api.getCompanyBillingSettings).mockResolvedValue({ settings: initial });
    vi.mocked(api.updateCompanyBillingSettings).mockRejectedValue(
      new Error('synthetic network failure'),
    );
    showBilling();
    const editor = await openEditor('Edit company profile');
    const email = editor.getByLabelText('Email');
    const save = editor.getByRole('button', { name: 'Save company profile' });
    fireEvent.change(email, { target: { value: 'not-email' } });
    fireEvent.click(save);
    expect(editor.getByText('Enter a valid email address.')).toBeVisible();
    expect(api.updateCompanyBillingSettings).not.toHaveBeenCalled();
    fireEvent.change(email, { target: { value: 'test@example.test' } });
    fireEvent.click(save);
    expect(await editor.findByText(/Your entries are still available/)).toBeVisible();
    expect(email).toHaveValue('test@example.test');
  });

  it('requires a deliberate baseline confirmation and never treats an empty number as zero', async () => {
    vi.mocked(api.getCompanyBillingSettings).mockResolvedValue({ settings: initial });
    vi.mocked(api.confirmInvoiceNumberBaseline).mockResolvedValue({
      sequence: {
        prefix: 'DEMO',
        year: 2026,
        digits: 4,
        lastNumber: 41,
        externalHighestNumber: 41,
        confirmedAt: '2026-10-25T12:02:00.000Z',
      },
    });
    showBilling();
    const editor = await openEditor('Set annual baseline', true);
    fireEvent.change(editor.getByLabelText(/^Year/), { target: { value: '2026' } });
    fireEvent.click(editor.getByRole('button', { name: 'Review baseline' }));
    expect(editor.getByText('Enter a non-negative whole number.')).toBeVisible();
    fireEvent.change(editor.getByLabelText(/^Highest externally issued number/), {
      target: { value: '41' },
    });
    fireEvent.click(editor.getByRole('button', { name: 'Review baseline' }));
    expect(editor.getByText(/DEMO-2026-0042/)).toBeVisible();
    expect(api.confirmInvoiceNumberBaseline).not.toHaveBeenCalled();
    fireEvent.click(editor.getByRole('button', { name: 'Confirm annual baseline' }));
    expect(await screen.findByText('Baseline confirmed for DEMO-2026 at 41.')).toBeVisible();
    expect(api.confirmInvoiceNumberBaseline).toHaveBeenCalledWith('synthetic-token', {
      year: 2026,
      highestExternalNumber: 41,
      confirmed: true,
    });
    expect(api.updateCompanyBillingSettings).not.toHaveBeenCalled();
  });

  it('refuses a baseline if the saved series changed during review', async () => {
    vi.mocked(api.getCompanyBillingSettings)
      .mockResolvedValueOnce({ settings: initial })
      .mockResolvedValue({ settings: { ...initial, invoicePrefix: 'NEW' } });
    showBilling();
    const editor = await openEditor('Set annual baseline', true);
    fireEvent.change(editor.getByLabelText(/^Year/), { target: { value: '2026' } });
    fireEvent.change(editor.getByLabelText(/^Highest externally issued number/), {
      target: { value: '0' },
    });
    fireEvent.click(editor.getByRole('button', { name: 'Review baseline' }));
    fireEvent.click(editor.getByRole('button', { name: 'Confirm annual baseline' }));
    expect(await editor.findByText(/The saved series changed/)).toBeVisible();
    expect(api.confirmInvoiceNumberBaseline).not.toHaveBeenCalled();
  });

  it('shows an actionable localized read failure and renders read-only values after retry', async () => {
    vi.mocked(api.getCompanyBillingSettings)
      .mockRejectedValueOnce(new Error('synthetic failure'))
      .mockResolvedValue({ settings: initial });
    showBilling(false, 'fr');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Impossible de charger les paramètres de facturation.',
    );
    const retry = screen.getByRole('button', { name: 'Réessayer' });
    fireEvent.click(retry);
    expect(await screen.findByText('Synthetic Company')).toBeVisible();
    expect(screen.getByText('Vous avez accès à ces paramètres en lecture seule.')).toBeVisible();
    expect(screen.queryByRole('button', { name: /modifier/i })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Définir la base annuelle' }),
    ).not.toBeInTheDocument();
  });
});
