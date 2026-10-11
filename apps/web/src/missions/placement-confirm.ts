import type { PlacementConfirmRequest } from '@hire-me/contracts';

import { businessDateToUtcIso, optionalText } from './mission-form.js';

export interface PlacementConfirmFormValues {
  integrationStartDate: string;
  operationalNote?: string;
  eligibleForInvoicing?: boolean;
}

export interface PlacementConfirmContext {
  missionId: string;
  offerVersionId: string;
  processId: string;
}

export function buildPlacementConfirmRequest(input: {
  integrationStartDate: string;
  operationalNote?: string;
  eligibleForInvoicing?: boolean;
  canSetCommercialEligibility: boolean;
}): PlacementConfirmRequest | null {
  const integrationStartDate = businessDateToUtcIso(input.integrationStartDate);
  if (!integrationStartDate) {
    return null;
  }
  return {
    integrationStartDate,
    operationalNote: optionalText(input.operationalNote ?? ''),
    eligibleForInvoicing: input.canSetCommercialEligibility
      ? Boolean(input.eligibleForInvoicing)
      : false,
  };
}
