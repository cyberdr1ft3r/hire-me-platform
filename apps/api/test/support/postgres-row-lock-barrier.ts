import type { PrismaClient } from '../../src/persistence/prisma/generated-client.js';

const DEFAULT_POLL_INTERVAL_MS = 15;
const DEFAULT_TIMEOUT_MS = 8_000;

export type RowLockBarrierTable = 'RecruitmentMission' | 'Candidate';

export interface RowLockWaiterSnapshot {
  pid: number;
  granted: boolean;
  mode: string;
  relname: string;
  waitEventType: string | null;
  waitEvent: string | null;
  blockingPids: number[];
}

export class RowLockBarrierTimeout extends Error {
  constructor(
    message: string,
    readonly relname: string,
    readonly expectedMinWaiters: number,
    readonly blockerPid: number | null,
    readonly snapshots: RowLockWaiterSnapshot[],
    readonly grantedHolderPids: number[],
  ) {
    super(message);
    this.name = 'RowLockBarrierTimeout';
  }
}

async function listGrantedRowLockHolderPids(
  prisma: PrismaClient,
  relname: RowLockBarrierTable,
  holderPids?: readonly number[],
): Promise<number[]> {
  const rows = await prisma.$queryRaw<Array<{ pid: number }>>`
    SELECT DISTINCT l.pid::int AS pid
    FROM pg_locks l
    INNER JOIN pg_class c ON c.oid = l.relation
    INNER JOIN pg_stat_activity act ON act.pid = l.pid
    WHERE c.relname = ${relname}
      AND l.granted = true
      AND act.datname = current_database()
      AND act.state IN ('active in transaction', 'idle in transaction')
      AND l.locktype IN ('relation', 'tuple')
  `;
  const pids = rows.map((row) => row.pid);
  if (!holderPids || holderPids.length === 0) {
    return pids;
  }
  const allowed = new Set(holderPids);
  return pids.filter((pid) => allowed.has(pid));
}

async function queryBackendsBlockedBy(
  prisma: PrismaClient,
  blockerPid: number,
): Promise<
  Array<{
    pid: number;
    waitEventType: string | null;
    waitEvent: string | null;
    blockingPids: number[];
  }>
> {
  return prisma.$queryRaw`
    SELECT
      act.pid::int AS pid,
      act.wait_event_type AS "waitEventType",
      act.wait_event AS "waitEvent",
      pg_blocking_pids(act.pid)::int[] AS "blockingPids"
    FROM pg_stat_activity act
    WHERE act.datname = current_database()
      AND act.pid <> pg_backend_pid()
      AND cardinality(pg_blocking_pids(act.pid)) > 0
      AND ${blockerPid} = ANY(pg_blocking_pids(act.pid))
  `;
}

async function queryRowLockWaitersBlockedBy(
  prisma: PrismaClient,
  blockerPid: number,
  relname: RowLockBarrierTable,
): Promise<RowLockWaiterSnapshot[]> {
  return prisma.$queryRaw<RowLockWaiterSnapshot[]>`
    SELECT DISTINCT
      blocked_activity.pid::int AS "pid",
      blocked_locks.granted AS "granted",
      blocked_locks.mode::text AS "mode",
      c.relname::text AS "relname",
      blocked_activity.wait_event_type AS "waitEventType",
      blocked_activity.wait_event AS "waitEvent",
      pg_blocking_pids(blocked_activity.pid)::int[] AS "blockingPids"
    FROM pg_catalog.pg_locks blocked_locks
    INNER JOIN pg_catalog.pg_locks blocking_locks
      ON blocking_locks.locktype = blocked_locks.locktype
      AND blocking_locks.database IS NOT DISTINCT FROM blocked_locks.database
      AND blocking_locks.relation IS NOT DISTINCT FROM blocked_locks.relation
      AND blocking_locks.page IS NOT DISTINCT FROM blocked_locks.page
      AND blocking_locks.tuple IS NOT DISTINCT FROM blocked_locks.tuple
      AND blocking_locks.virtualtransaction IS NOT DISTINCT FROM blocked_locks.virtualtransaction
      AND blocking_locks.transactionid IS NOT DISTINCT FROM blocked_locks.transactionid
      AND blocking_locks.classid IS NOT DISTINCT FROM blocked_locks.classid
      AND blocking_locks.objid IS NOT DISTINCT FROM blocked_locks.objid
      AND blocking_locks.objsubid IS NOT DISTINCT FROM blocked_locks.objsubid
    INNER JOIN pg_class c ON c.oid = blocked_locks.relation
    INNER JOIN pg_stat_activity blocked_activity ON blocked_activity.pid = blocked_locks.pid
    WHERE NOT blocked_locks.granted
      AND blocking_locks.granted
      AND blocking_locks.pid = ${blockerPid}
      AND c.relname = ${relname}
      AND blocked_activity.datname = current_database()
  `;
}

async function waitForBackendsBlockedBy(
  prisma: PrismaClient,
  blockerPid: number,
  minWaiters: number,
  timeoutMs: number,
  relname: RowLockBarrierTable,
): Promise<
  Array<{
    pid: number;
    waitEventType: string | null;
    waitEvent: string | null;
    blockingPids: number[];
  }>
> {
  const deadline = Date.now() + timeoutMs;
  let lastSnapshots: Array<{
    pid: number;
    waitEventType: string | null;
    waitEvent: string | null;
    blockingPids: number[];
  }> = [];

  while (Date.now() < deadline) {
    lastSnapshots = await queryBackendsBlockedBy(prisma, blockerPid);
    if (lastSnapshots.length >= minWaiters) {
      return lastSnapshots;
    }
    await new Promise((resolve) => setTimeout(resolve, DEFAULT_POLL_INTERVAL_MS));
  }

  const grantedHolderPids = await listGrantedRowLockHolderPids(prisma, relname);
  const lockSnapshots = await queryRowLockWaitersBlockedBy(prisma, blockerPid, relname);
  throw new RowLockBarrierTimeout(
    `Timed out after ${timeoutMs}ms waiting for ${minWaiters} backend(s) blocked by PID ${blockerPid}.`,
    relname,
    minWaiters,
    blockerPid,
    lockSnapshots,
    grantedHolderPids,
  );
}

async function querySecondaryRaceParticipant(
  prisma: PrismaClient,
  testHolderPid: number,
  primaryBackendPid: number,
  relname: RowLockBarrierTable,
): Promise<
  Array<{
    pid: number;
    waitEventType: string | null;
    waitEvent: string | null;
    blockingPids: number[];
  }>
> {
  const blockedByTest = await queryBackendsBlockedBy(prisma, testHolderPid);
  const secondaryOnTest = blockedByTest.filter((row) => row.pid !== primaryBackendPid);

  const blockedInGraph = await prisma.$queryRaw<
    Array<{
      pid: number;
      waitEventType: string | null;
      waitEvent: string | null;
      blockingPids: number[];
    }>
  >`
    SELECT
      act.pid::int AS pid,
      act.wait_event_type AS "waitEventType",
      act.wait_event AS "waitEvent",
      pg_blocking_pids(act.pid)::int[] AS "blockingPids"
    FROM pg_stat_activity act
    WHERE act.datname = current_database()
      AND act.pid <> pg_backend_pid()
      AND act.pid <> ${primaryBackendPid}
      AND cardinality(pg_blocking_pids(act.pid)) > 0
      AND (
        ${testHolderPid} = ANY(pg_blocking_pids(act.pid))
        OR ${primaryBackendPid} = ANY(pg_blocking_pids(act.pid))
      )
  `;

  const lockWaiters = await queryRowLockWaitersBlockedBy(prisma, testHolderPid, relname);
  const secondaryLockWaiters = lockWaiters.filter((row) => row.pid !== primaryBackendPid);

  const byPid = new Map<
    number,
    { pid: number; waitEventType: string | null; waitEvent: string | null; blockingPids: number[] }
  >();
  for (const row of [...secondaryOnTest, ...blockedInGraph, ...secondaryLockWaiters]) {
    byPid.set(row.pid, row);
  }
  return [...byPid.values()];
}

async function waitForSecondaryRaceParticipant(
  prisma: PrismaClient,
  testHolderPid: number,
  primaryBackendPid: number,
  relname: RowLockBarrierTable,
  timeoutMs: number,
): Promise<
  Array<{
    pid: number;
    waitEventType: string | null;
    waitEvent: string | null;
    blockingPids: number[];
  }>
> {
  const deadline = Date.now() + timeoutMs;
  let lastSnapshots: Array<{
    pid: number;
    waitEventType: string | null;
    waitEvent: string | null;
    blockingPids: number[];
  }> = [];

  while (Date.now() < deadline) {
    lastSnapshots = await querySecondaryRaceParticipant(
      prisma,
      testHolderPid,
      primaryBackendPid,
      relname,
    );
    if (lastSnapshots.length >= 1) {
      return lastSnapshots;
    }
    await new Promise((resolve) => setTimeout(resolve, DEFAULT_POLL_INTERVAL_MS));
  }

  const grantedHolderPids = await listGrantedRowLockHolderPids(prisma, relname);
  const lockSnapshots = await queryRowLockWaitersBlockedBy(prisma, testHolderPid, relname);
  throw new RowLockBarrierTimeout(
    `Timed out after ${timeoutMs}ms waiting for a secondary backend (distinct from PID ${primaryBackendPid}) blocked on "${relname}" by the test holder and/or the primary archive backend.`,
    relname,
    1,
    testHolderPid,
    lockSnapshots,
    grantedHolderPids,
  );
}

async function acquireRowForUpdate(
  transaction: Pick<PrismaClient, '$queryRaw'>,
  table: RowLockBarrierTable,
  rowId: string,
): Promise<void> {
  if (table === 'RecruitmentMission') {
    await transaction.$queryRaw`SELECT id FROM "RecruitmentMission" WHERE id = ${rowId}::uuid FOR UPDATE`;
    return;
  }
  await transaction.$queryRaw`SELECT id FROM "Candidate" WHERE id = ${rowId}::uuid FOR UPDATE`;
}

export interface RowLockRaceOptions<TPrimary, TSecondary> {
  prisma: PrismaClient;
  table: RowLockBarrierTable;
  rowId: string;
  primaryRequest: () => Promise<TPrimary>;
  secondaryRequest: () => Promise<TSecondary>;
  waiterTimeoutMs?: number;
}

/**
 * Deterministic race helper:
 * 1. A test transaction holds `FOR UPDATE` on the target row.
 * 2. The primary request starts and queues behind that lock.
 * 3. While the test lock remains held, the secondary request starts and must queue on the same row-lock graph.
 * 4. Only after both backends are observable in `pg_blocking_pids()` / `pg_locks`, the test lock releases.
 * 5. FIFO queue hands the row to the primary archive transaction; the secondary remains blocked until archival completes.
 */
export async function raceWhileHoldingRowLock<TPrimary, TSecondary>(
  options: RowLockRaceOptions<TPrimary, TSecondary>,
): Promise<[TPrimary, TSecondary]> {
  const {
    prisma,
    table,
    rowId,
    primaryRequest,
    secondaryRequest,
    waiterTimeoutMs = DEFAULT_TIMEOUT_MS,
  } = options;

  let releaseTestLock: (() => void) | undefined;
  let testLockReady: (() => void) | undefined;
  let testHolderPid = 0;
  let testLockReadySignaled = false;
  let rejectTestLockReady: ((error: unknown) => void) | undefined;

  const releasePromise = new Promise<void>((resolve) => {
    releaseTestLock = resolve;
  });
  const testLockReadyPromise = new Promise<void>((resolve, reject) => {
    rejectTestLockReady = reject;
    testLockReady = () => {
      testLockReadySignaled = true;
      resolve();
    };
  });

  const testLockPromise = prisma.$transaction(
    async (transaction) => {
      testHolderPid = (
        await transaction.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid()::int AS pid`
      )[0]!.pid;
      await acquireRowForUpdate(transaction, table, rowId);
      testLockReady?.();
      await releasePromise;
    },
    { timeout: 45_000 },
  );

  void testLockPromise.catch((error: unknown) => {
    if (!testLockReadySignaled) {
      rejectTestLockReady?.(error);
    }
  });

  let bodyError: unknown;
  let transactionError: unknown;
  let raceResult: [TPrimary, TSecondary] | undefined;

  try {
    await testLockReadyPromise;
    const primaryPromise = primaryRequest();
    const primaryBlocked = await waitForBackendsBlockedBy(
      prisma,
      testHolderPid,
      1,
      waiterTimeoutMs,
      table,
    );
    const primaryBackendPid = primaryBlocked[0]!.pid;

    const secondaryPromise = secondaryRequest();
    await waitForSecondaryRaceParticipant(
      prisma,
      testHolderPid,
      primaryBackendPid,
      table,
      waiterTimeoutMs,
    );

    releaseTestLock?.();

    raceResult = await Promise.all([primaryPromise, secondaryPromise]);
  } catch (error) {
    bodyError = error;
  } finally {
    releaseTestLock?.();
    try {
      await testLockPromise;
    } catch (error) {
      transactionError = error;
    }
  }

  if (bodyError !== undefined) {
    throw toThrownError(bodyError);
  }
  if (transactionError !== undefined) {
    throw toThrownError(transactionError);
  }

  return raceResult!;
}

function toThrownError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
