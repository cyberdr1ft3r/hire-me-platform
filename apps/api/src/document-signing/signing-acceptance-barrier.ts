/** Test-only hook before row lock / pre-authority staleness checks. */
let preAcceptanceBarrier: (() => Promise<void>) | null = null;

/** Test-only hook after bound-authority checks, before publication writes (TOCTOU window). */
let postAuthorityAcceptanceBarrier: (() => Promise<void>) | null = null;

export function setSigningAcceptanceBarrierForTests(barrier: (() => Promise<void>) | null): void {
  preAcceptanceBarrier = barrier;
}

export function setSigningPostAuthorityBarrierForTests(
  barrier: (() => Promise<void>) | null,
): void {
  postAuthorityAcceptanceBarrier = barrier;
}

export async function runSigningAcceptanceBarrierIfConfigured(): Promise<void> {
  if (preAcceptanceBarrier) {
    await preAcceptanceBarrier();
  }
}

export async function runSigningPostAuthorityBarrierIfConfigured(): Promise<void> {
  if (postAuthorityAcceptanceBarrier) {
    await postAuthorityAcceptanceBarrier();
  }
}
