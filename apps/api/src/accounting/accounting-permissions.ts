export const ACCOUNTING_PERMISSIONS = {
  PAYMENTS_VIEW: 'payments:view',
  PAYMENTS_MANAGE: 'payments:manage',
  PAYMENTS_CORRECT: 'payments:correct',
  EXPENSES_VIEW: 'expenses:view',
  EXPENSES_MANAGE: 'expenses:manage',
  CLIENT_BALANCES_VIEW: 'client_balances:view',
  PROFITABILITY_VIEW: 'profitability:view',
} as const;

export type AccountingPermission =
  (typeof ACCOUNTING_PERMISSIONS)[keyof typeof ACCOUNTING_PERMISSIONS];
