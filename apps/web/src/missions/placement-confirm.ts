import type { PlacementConfirmRequest } from '@hire-me/contracts';

import { businessDateToUtcIso, optionalText } from './mission-form.js';

export interface PlacementConfirmFormValues {
  integrationStartDate: string;
  operationalNote?: string;
}

export interface PlacementConfirmContext {
  missionId: string;
  offerVersionId: string;
  processId: string;
}

/** Server default for invoicing eligibility until an explicit set permission exists. */
export function buildPlacementConfirmRequest(input: {
  integrationStartDate: string;
  operationalNote?: string;
}): PlacementConfirmRequest | null {
  const integrationStartDate = businessDateToUtcIso(input.integrationStartDate);
  if (!integrationStartDate) {
    return null;
  }
  return {
    integrationStartDate,
    operationalNote: optionalText(input.operationalNote ?? ''),
    eligibleForInvoicing: false,
  };
}
