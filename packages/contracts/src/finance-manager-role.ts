/**
 * Issue #125 — FINANCE_MANAGER seeded permission matrix (shared contract).
 */
export const FINANCE_MANAGER_ROLE_DESCRIPTION =
  'Finance manager role for commercial documents and accounting operations within authorized client scope.';

export const FINANCE_MANAGER_PERMISSION_CODES = [
  'records:view',
  'clients:view',
  'commercial_data:access',
  'quotations:view',
  'quotations:manage',
  'contracts:view',
  'contracts:manage',
  'purchase_orders:view',
  'purchase_orders:manage',
  'invoices:view',
  'invoices:manage',
  'payments:view',
  'payments:manage',
  'payments:correct',
  'expenses:view',
  'expenses:manage',
  'client_balances:view',
  'profitability:view',
  'documents:view',
  'documents:download',
  'documents:generate',
  'financial_documents:approve_signing',
  'financial_documents:sign',
  'financial_documents:seal',
  'financial_documents:view_signature_audit',
] as const;

export type FinanceManagerPermissionCode = (typeof FINANCE_MANAGER_PERMISSION_CODES)[number];
