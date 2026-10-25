import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as api from '../api.js';
import { I18nProvider } from '../i18n/index.js';
import { BillingSettingsPanel } from './BillingSettingsPanel.js';

vi.mock('../api.js', () => ({
  getCompanyBillingSettings: vi.fn(),
  updateCompanyBillingSettings: vi.fn(),
  confirmInvoiceNumberBaseline: vi.fn(),
}));

const emptySettings = {
  sellerLegalName: null,
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
  invoicePrefix: null,
  invoiceDigits: null,
  invoiceNumberingEnabled: false,
  updatedAt: '2026-10-25T12:00:00.000Z',
};

describe('BillingSettingsPanel', () => {
  afterEach(() => vi.clearAllMocks());

  it('saves synthetic company settings and confirms an explicit annual baseline', async () => {
    vi.mocked(api.getCompanyBillingSettings).mockResolvedValue({ settings: emptySettings });
    vi.mocked(api.updateCompanyBillingSettings).mockImplementation((_token, settings) =>
      Promise.resolve({
        settings: { ...settings, updatedAt: '2026-10-25T12:01:00.000Z' },
      }),
    );
    vi.mocked(api.confirmInvoiceNumberBaseline).mockResolvedValue({
      sequence: {
        prefix: 'HMTEST',
        year: 2026,
        digits: 3,
        lastNumber: 41,
        externalHighestNumber: 41,
        confirmedAt: '2026-10-25T12:02:00.000Z',
      },
    });

    render(
      <I18nProvider initialLocale="en">
        <BillingSettingsPanel accessToken="synthetic-token" canManage />
      </I18nProvider>,
    );

    fireEvent.change(await screen.findByLabelText('Legal company name'), {
      target: { value: 'Synthetic HireMe SARL' },
    });
    fireEvent.change(screen.getByLabelText('Invoice prefix'), {
      target: { value: 'hmtest' },
    });
    fireEvent.change(screen.getByLabelText('Number width'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save billing settings' }));
    expect(await screen.findByText('Billing settings saved.')).toBeVisible();
    expect(api.updateCompanyBillingSettings).toHaveBeenCalledWith(
      'synthetic-token',
      expect.objectContaining({
        sellerLegalName: 'Synthetic HireMe SARL',
        invoicePrefix: 'HMTEST',
        invoiceDigits: 3,
        invoiceNumberingEnabled: false,
      }),
    );

    fireEvent.change(screen.getByLabelText(/^Year/), { target: { value: '2026' } });
    fireEvent.change(screen.getByLabelText(/^Highest external number/), {
      target: { value: '41' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm baseline' }));
    expect(await screen.findByText(/Baseline confirmed for HMTEST-2026/)).toBeVisible();
    await waitFor(() =>
      expect(api.confirmInvoiceNumberBaseline).toHaveBeenCalledWith('synthetic-token', {
        year: 2026,
        highestExternalNumber: 41,
        confirmed: true,
      }),
    );
  });

  it('shows a safe localized error when the settings request fails', async () => {
    vi.mocked(api.getCompanyBillingSettings).mockRejectedValue(new Error('synthetic failure'));
    render(
      <I18nProvider initialLocale="fr">
        <BillingSettingsPanel accessToken="synthetic-token" canManage={false} />
      </I18nProvider>,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Les paramètres de facturation n’ont pas pu être chargés ou enregistrés.',
    );
  });
});
