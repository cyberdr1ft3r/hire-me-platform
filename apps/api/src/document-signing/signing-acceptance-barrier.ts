/** Test-only deterministic hook executed immediately before publication DB writes. */
let acceptanceBarrier: (() => Promise<void>) | null = null;

export function setSigningAcceptanceBarrierForTests(barrier: (() => Promise<void>) | null): void {
  acceptanceBarrier = barrier;
}

export async function runSigningAcceptanceBarrierIfConfigured(): Promise<void> {
  if (acceptanceBarrier) {
    await acceptanceBarrier();
  }
}
