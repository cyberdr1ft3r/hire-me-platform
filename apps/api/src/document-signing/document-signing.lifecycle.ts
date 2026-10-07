import { SigningRequestState, type Prisma } from '../persistence/prisma/generated-client.js';

type SigningRequestRow = Prisma.SigningRequestGetPayload<Record<string, never>>;

export const ACTIVE_SIGNING_REQUEST_STATES: SigningRequestState[] = [
  SigningRequestState.PREPARED,
  SigningRequestState.APPROVED,
  SigningRequestState.AWAITING_RESULT,
];

export async function lockSigningRequest(
  transaction: Prisma.TransactionClient,
  requestId: string,
): Promise<void> {
  await transaction.$executeRaw`
    SELECT "id" FROM "SigningRequest" WHERE "id" = ${requestId}::uuid FOR UPDATE
  `;
}

/** Serialize publication against concurrent document version / lineage mutations. */
export async function lockDocumentRow(
  transaction: Prisma.TransactionClient,
  documentId: string,
): Promise<void> {
  await transaction.$executeRaw`
    SELECT "id" FROM "Document" WHERE "id" = ${documentId}::uuid FOR UPDATE
  `;
}

/** Serialize acceptance against concurrent credential disable or fingerprint changes. */
export async function lockSigningCredentialRow(
  transaction: Prisma.TransactionClient,
  credentialId: string,
): Promise<void> {
  await transaction.$executeRaw`
    SELECT "id" FROM "SigningCredential" WHERE "id" = ${credentialId}::uuid FOR UPDATE
  `;
}

/** Serialize acceptance against concurrent permission grant/revoke on the bound user. */
export async function lockBoundUserRolePermissions(
  transaction: Prisma.TransactionClient,
  userId: string,
): Promise<void> {
  await transaction.$executeRaw`
    SELECT ur."id"
    FROM "UserRole" ur
    WHERE ur."userId" = ${userId}::uuid
      AND ur."archivedAt" IS NULL
    FOR UPDATE
  `;
  await transaction.$executeRaw`
    SELECT rp."roleId", rp."permissionId"
    FROM "RolePermission" rp
    INNER JOIN "UserRole" ur ON ur."roleId" = rp."roleId"
    WHERE ur."userId" = ${userId}::uuid
      AND ur."archivedAt" IS NULL
      AND rp."archivedAt" IS NULL
    FOR UPDATE
  `;
}

/** Serialize organization seal acceptance against concurrent mandate revocation. */
export async function lockActiveSealGrants(
  transaction: Prisma.TransactionClient,
  credentialId: string,
  userId: string,
): Promise<void> {
  await transaction.$executeRaw`
    SELECT "id"
    FROM "SigningCredentialGrant"
    WHERE "credentialId" = ${credentialId}::uuid
      AND "userId" = ${userId}::uuid
      AND "revokedAt" IS NULL
    FOR UPDATE
  `;
}

/** Serialize acceptance against concurrent authoritative business-source edits. */
export async function lockAuthoritativeFinancialSourceRow(
  transaction: Prisma.TransactionClient,
  documentId: string,
): Promise<void> {
  const document = await transaction.document.findUnique({
    where: { id: documentId },
    select: {
      commercialQuotationId: true,
      purchaseOrderId: true,
      commercialContractId: true,
      invoiceId: true,
    },
  });
  if (!document) {
    return;
  }
  if (document.commercialQuotationId) {
    await transaction.$executeRaw`
      SELECT "id" FROM "CommercialQuotation" WHERE "id" = ${document.commercialQuotationId}::uuid FOR UPDATE
    `;
    return;
  }
  if (document.purchaseOrderId) {
    await transaction.$executeRaw`
      SELECT "id" FROM "PurchaseOrder" WHERE "id" = ${document.purchaseOrderId}::uuid FOR UPDATE
    `;
    return;
  }
  if (document.commercialContractId) {
    await transaction.$executeRaw`
      SELECT "id" FROM "CommercialContract" WHERE "id" = ${document.commercialContractId}::uuid FOR UPDATE
    `;
    return;
  }
  if (document.invoiceId) {
    await transaction.$executeRaw`
      SELECT "id" FROM "Invoice" WHERE "id" = ${document.invoiceId}::uuid FOR UPDATE
    `;
  }
}

export async function nextSigningEventSequence(
  transaction: Prisma.TransactionClient,
  signingRequestId: string,
): Promise<number> {
  const latest = await transaction.signingEvent.findFirst({
    where: { signingRequestId },
    orderBy: { sequence: 'desc' },
    select: { sequence: true },
  });
  return (latest?.sequence ?? -1) + 1;
}

export async function appendSigningEventInTransaction(
  transaction: Prisma.TransactionClient,
  input: {
    signingRequestId: string;
    action: string;
    actorUserId: string | null;
    metadataSummary: string;
    reasonCode?: string;
  },
): Promise<void> {
  const sequence = await nextSigningEventSequence(transaction, input.signingRequestId);
  await transaction.signingEvent.create({
    data: {
      signingRequestId: input.signingRequestId,
      sequence,
      action: input.action,
      actorUserId: input.actorUserId,
      metadataSummary: input.metadataSummary.slice(0, 500),
      reasonCode: input.reasonCode?.slice(0, 120),
    },
  });
}

export async function transitionSigningRequestTerminal(
  transaction: Prisma.TransactionClient,
  request: SigningRequestRow,
  nextState: SigningRequestState,
  terminalReason: string,
  eventAction: string,
  actorUserId: string | null,
  metadataSummary: string,
): Promise<SigningRequestRow> {
  if (!ACTIVE_SIGNING_REQUEST_STATES.includes(request.state)) {
    return request;
  }
  const updated = await transaction.signingRequest.update({
    where: { id: request.id },
    data: { state: nextState, terminalReason },
  });
  await appendSigningEventInTransaction(transaction, {
    signingRequestId: request.id,
    action: eventAction,
    actorUserId,
    metadataSummary,
    reasonCode: terminalReason,
  });
  return updated;
}
