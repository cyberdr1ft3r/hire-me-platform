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
