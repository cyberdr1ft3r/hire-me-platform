import type { ProfitabilityContext } from '@hire-me/contracts';

export type AccountingArea = 'payments' | 'expenses' | 'balances' | 'profitability';

/**
 * What this account may see and do in the Accounting workspace.
 *
 * Each flag mirrors the permission codes the API checks for that operation, so
 * the UI leaves out actions the server would refuse. The server still re-checks
 * capability, `commercial_data:access`, client, mission, placement, and training
 * scope, and record state on every request (D-053, D-081).
 */
export type AccountingAccess = {
  areas: Record<AccountingArea, boolean>;
  /** Amounts, reasons, vendor, and description arrive only with `commercial_data:access`. */
  amounts: boolean;
  /** Every payment read and write, and every client choice, needs `clients:view`. */
  clients: boolean;
  payments: {
    record: boolean;
    edit: boolean;
    correct: boolean;
    archive: boolean;
    /** Allocation also needs `invoices:view` for the invoice source and the server check. */
    allocate: boolean;
    reverse: boolean;
  };
  expenses: { record: boolean; manage: boolean };
  /** Receivables need `client_balances:view`, commercial data access, and client scope. */
  balances: boolean;
  profitability: boolean;
  profitabilityContexts: ProfitabilityContext[];
  /** `GET /v1/missions`, scoped like the Accounting mission rule. */
  pickMissions: boolean;
  /** Without `mission_candidates:transfer`, mission choices are the actor's own assignments. */
  missionsAssignedOnly: boolean;
  /** `GET /v1/accounting/placement-options` (D-081). */
  pickPlacements: boolean;
  /** `GET /v1/training/programs`, which applies the Accounting training mirror. */
  pickTrainingPrograms: boolean;
  readOnly: boolean;
};

export const ACCOUNTING_AREAS: readonly AccountingArea[] = [
  'payments',
  'expenses',
  'balances',
  'profitability',
];

const AREA_CODES: Record<AccountingArea, string> = {
  balances: 'client_balances:view',
  expenses: 'expenses:view',
  payments: 'payments:view',
  profitability: 'profitability:view',
};

export function resolveAccountingAccess(permissions: readonly string[]): AccountingAccess {
  const has = (code: string) => permissions.includes(code);
  const amounts = has('commercial_data:access');
  const clients = has('clients:view');
  const paymentsManage = amounts && has('payments:manage');
  const expensesManage = amounts && has('expenses:manage');
  const profitability = amounts && has('profitability:view');
  const pickMissions = clients && has('missions:view');
  const pickPlacements =
    pickMissions && has('placements:view') && (profitability || expensesManage);

  const profitabilityContexts: ProfitabilityContext[] = [];
  if (clients) profitabilityContexts.push('CLIENT');
  if (pickMissions) profitabilityContexts.push('RECRUITMENT_MISSION');
  if (pickPlacements) profitabilityContexts.push('PLACEMENT');

  const access = {
    areas: {
      balances: has(AREA_CODES.balances),
      expenses: has(AREA_CODES.expenses),
      payments: has(AREA_CODES.payments),
      profitability: has(AREA_CODES.profitability),
    },
    amounts,
    clients,
    payments: {
      record: paymentsManage && clients,
      edit: paymentsManage,
      correct: amounts && has('payments:correct'),
      archive: paymentsManage,
      allocate: paymentsManage && has('invoices:view'),
      reverse: paymentsManage,
    },
    expenses: { record: expensesManage, manage: expensesManage },
    balances: amounts && clients && has('client_balances:view'),
    profitability,
    profitabilityContexts,
    pickMissions,
    missionsAssignedOnly: !has('mission_candidates:transfer'),
    pickPlacements,
    pickTrainingPrograms: has('training_programs:view'),
  };
  const readOnly = !(
    access.payments.record ||
    access.payments.edit ||
    access.payments.correct ||
    access.expenses.record
  );
  return { ...access, readOnly };
}

export function visibleAreas(access: AccountingAccess): AccountingArea[] {
  return ACCOUNTING_AREAS.filter((area) => access.areas[area]);
}
