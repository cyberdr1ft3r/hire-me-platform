import type { AccountingAccess } from './accounting-access.js';
import type { LoadOptions, PickerOption } from './accounting-state.js';

export type AccountingWriteAction =
  'create' | 'update' | 'correct' | 'archive' | 'allocate' | 'reverse';

/**
 * What an Accounting area needs from the panel that owns the session.
 *
 * `capture()` returns a check that stays true only while the same token and
 * permission set are current, so a response from a replaced session is never
 * shown or completed. The write lock is owner-tagged and shared by every area,
 * so one finance write runs at a time.
 */
export type AccountingSession = {
  key: number;
  token: () => string;
  capture: () => () => boolean;
  beginWrite: (action: AccountingWriteAction) => number | null;
  endWrite: (owner: number) => void;
  pending: AccountingWriteAction | null;
};

export type AccountingLoaders = {
  clients: LoadOptions;
  missions: (clientId: string | null) => LoadOptions;
  placements: (recruitmentMissionId: string) => LoadOptions;
  trainingPrograms: (clientId: string | null) => LoadOptions;
  issuedInvoices: (clientId: string, currency: string) => LoadOptions;
};

/** An invoice → payment hand-off from Client balances (client, currency, and the invoice). */
export type PaymentPrefill = {
  client: PickerOption;
  currency: string;
  invoice: PickerOption;
  outstandingCents: number | null;
  token: number;
};

export type AreaProps = {
  access: AccountingAccess;
  loaders: AccountingLoaders;
  session: AccountingSession;
};
