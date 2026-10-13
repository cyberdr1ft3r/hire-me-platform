import type { CommercialKind } from './commercial-kinds.js';

/**
 * What this account may see and do in the Commercial workspace.
 *
 * Each flag mirrors the permission codes the API checks for that operation. The
 * UI uses it to leave out actions that would be refused; the server still
 * re-checks capability, client and mission record scope, lifecycle, and source
 * links on every request (D-079).
 */
export type CommercialAccess = {
  view: Record<CommercialKind, boolean>;
  /** `*:manage` plus `commercial_data:access`, as `assertCommercialWrite` requires. */
  manage: Record<CommercialKind, boolean>;
  /** Amounts, lines, terms, and history reasons arrive only with `commercial_data:access`. */
  amounts: boolean;
  /** `GET /v1/clients`; every Commercial read and write also needs `clients:view`. */
  pickClients: boolean;
  /** Mission picker visible (recruitment `/v1/missions` or D-086 financial-context missions). */
  pickMissions: boolean;
  /** Without `mission_candidates:transfer`, recruitment mission choices are assignment-scoped. */
  missionsAssignedOnly: boolean;
  /** Mission options from `GET /v1/commercial/financial-context/missions` (D-086). */
  financialMissionSource: boolean;
  /** Placement picker visible (D-079 placement-options or D-086 financial-context placements). */
  pickPlacements: boolean;
  /** Placement options from `GET /v1/commercial/financial-context/placements` (D-086). */
  financialPlacementSource: boolean;
  generate: Record<CommercialKind, boolean>;
  viewGeneratedVersions: boolean;
  downloadGeneratedVersions: boolean;
  readOnly: boolean;
};

export const COMMERCIAL_KINDS: readonly CommercialKind[] = [
  'quotation',
  'purchaseOrder',
  'invoice',
  'contract',
];

const VIEW_CODES: Record<CommercialKind, string> = {
  contract: 'contracts:view',
  invoice: 'invoices:view',
  purchaseOrder: 'purchase_orders:view',
  quotation: 'quotations:view',
};

const MANAGE_CODES: Record<CommercialKind, string> = {
  contract: 'contracts:manage',
  invoice: 'invoices:manage',
  purchaseOrder: 'purchase_orders:manage',
  quotation: 'quotations:manage',
};

function byKind(predicate: (kind: CommercialKind) => boolean): Record<CommercialKind, boolean> {
  return {
    contract: predicate('contract'),
    invoice: predicate('invoice'),
    purchaseOrder: predicate('purchaseOrder'),
    quotation: predicate('quotation'),
  };
}

export function resolveCommercialAccess(permissions: readonly string[]): CommercialAccess {
  const has = (code: string) => permissions.includes(code);
  const amounts = has('commercial_data:access');
  const view = byKind((kind) => has(VIEW_CODES[kind]));
  const manage = byKind((kind) => amounts && has(MANAGE_CODES[kind]));
  const missionsView = has('missions:view');
  const financialContext = has('recruitment_financial_context:view');
  const clientsView = has('clients:view');
  const placementsRecruitment =
    manage.invoice &&
    has('placements:view') &&
    has('placement_commercial_eligibility:view') &&
    missionsView &&
    clientsView;
  // D-086: the financial context selects the Finance source on its own, for
  // hybrid actors who also hold `missions:view` or generic placement grants too.
  const missionsFinancial = financialContext && clientsView && amounts;
  const placementsFinancial = financialContext && clientsView && manage.invoice;
  const access = {
    view,
    manage,
    amounts,
    pickClients: clientsView,
    pickMissions: missionsView || missionsFinancial,
    missionsAssignedOnly: !has('mission_candidates:transfer'),
    financialMissionSource: missionsFinancial,
    pickPlacements: placementsRecruitment || placementsFinancial,
    financialPlacementSource: placementsFinancial,
    // Generation also re-checks commercial data access and source readability.
    generate: byKind((kind) => amounts && has('documents:generate') && view[kind]),
    viewGeneratedVersions: has('documents:view'),
    downloadGeneratedVersions: has('documents:download'),
  };
  const readOnly = !COMMERCIAL_KINDS.some((kind) => manage[kind] || access.generate[kind]);
  return { ...access, readOnly };
}

export function visibleKinds(access: CommercialAccess): CommercialKind[] {
  return COMMERCIAL_KINDS.filter((kind) => access.view[kind]);
}
