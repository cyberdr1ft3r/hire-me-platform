/**
 * Issue #141 — electronic signing permission codes (shared contract).
 */
export const SIGNING_PERMISSION_CODES = [
  'financial_documents:approve_signing',
  'financial_documents:sign',
  'financial_documents:seal',
  'financial_documents:view_signature_audit',
  'signing_credentials:manage',
] as const;

export type SigningPermissionCode = (typeof SIGNING_PERMISSION_CODES)[number];

/** FINANCE_MANAGER may use signing capabilities but not administer credentials (Issue #141). */
export const FINANCE_MANAGER_SIGNING_PERMISSION_CODES = [
  'financial_documents:approve_signing',
  'financial_documents:sign',
  'financial_documents:seal',
  'financial_documents:view_signature_audit',
] as const;
