import { useLayoutEffect, useRef, useState } from 'react';

import {
  listAccountingPlacementOptions,
  listClients,
  listInvoices,
  listMissions,
  listTrainingPrograms,
} from '../api.js';
import { resolveAccountingAccess, visibleAreas, type AccountingArea } from './accounting-access.js';
import type {
  AccountingLoaders,
  AccountingSession,
  AccountingWriteAction,
  PaymentPrefill,
} from './accounting-session.js';
import { OPTION_LIMIT, type LoadOptions } from './accounting-state.js';
import { AccountingWorkspace } from './AccountingWorkspace.js';

export function AccountingPanel({
  accessToken,
  actorUserId,
  permissions,
}: {
  accessToken: string;
  actorUserId: string;
  permissions: string[];
}) {
  const access = resolveAccountingAccess(permissions);
  const areas = visibleAreas(access);
  const defaultArea = areas[0] ?? 'payments';

  const writeOwner = useRef<number | null>(null);
  const writeSequence = useRef(0);
  // A different token or permission set is a different session: nothing from
  // the previous one may be shown, reused, or completed into this one.
  const principal = `${actorUserId} ${permissions.join(' ')}`;
  const sessionToken = useRef(accessToken);
  const sessionIdentity = useRef(`${accessToken}\n${principal}`);

  useLayoutEffect(() => {
    sessionToken.current = accessToken;
    sessionIdentity.current = `${accessToken}\n${principal}`;
  }, [accessToken, principal]);

  const [session, setSession] = useState({ key: 0, principal, token: accessToken });
  const [area, setArea] = useState<AccountingArea>(defaultArea);
  const [pending, setPending] = useState<AccountingWriteAction | null>(null);
  const [prefill, setPrefill] = useState<PaymentPrefill | null>(null);

  if (session.token !== accessToken || session.principal !== principal) {
    writeOwner.current = null;
    setSession({ key: session.key + 1, principal, token: accessToken });
    setArea(defaultArea);
    setPending(null);
    setPrefill(null);
  }

  const accountingSession: AccountingSession = {
    key: session.key,
    token: () => sessionToken.current,
    capture: () => {
      const startedIdentity = sessionIdentity.current;
      return () => sessionIdentity.current === startedIdentity;
    },
    beginWrite: (action) => {
      if (writeOwner.current !== null) return null;
      const owner = ++writeSequence.current;
      writeOwner.current = owner;
      setPending(action);
      return owner;
    },
    endWrite: (owner) => {
      // A write from a replaced session no longer owns the lock and must not release it.
      if (writeOwner.current !== owner) return;
      writeOwner.current = null;
      setPending(null);
    },
    pending,
  };

  // ---------------------------------------------------------------------------
  // Option sources (D-079, D-081; IDs never leave the picker)
  // ---------------------------------------------------------------------------

  const clients: LoadOptions = async (search) => {
    const response = await listClients({
      accessToken: sessionToken.current,
      pageSize: OPTION_LIMIT,
      search: search || undefined,
    });
    return response.clients
      .filter((client) => client.status !== 'ARCHIVED' && client.archivedAt === null)
      .map((client) => ({ id: client.id, label: client.name, detail: client.city }));
  };

  const missions =
    (clientId: string | null): LoadOptions =>
    async (search) => {
      const response = await listMissions({
        accessToken: sessionToken.current,
        // Without transfer the Accounting mission scope is the actor's own active assignments.
        assigneeUserId: access.missionsAssignedOnly ? actorUserId : undefined,
        clientId: clientId ?? undefined,
        pageSize: OPTION_LIMIT,
        search: search || undefined,
      });
      return response.missions
        .filter((mission) => mission.archivedAt === null)
        .map((mission) => ({
          id: mission.id,
          label: mission.title,
          detail: clientId ? null : mission.clientName,
        }));
    };

  const placements =
    (recruitmentMissionId: string): LoadOptions =>
    async () => {
      const response = await listAccountingPlacementOptions(sessionToken.current, {
        recruitmentMissionId,
      });
      return response.options.map((option) => ({
        id: option.id,
        label: option.missionTitle,
        detail: null,
        placement: {
          confirmedAt: option.confirmedAt,
          integrationStartDate: option.integrationStartDate,
        },
      }));
    };

  const trainingPrograms =
    (clientId: string | null): LoadOptions =>
    async (search) => {
      const response = await listTrainingPrograms({
        accessToken: sessionToken.current,
        pageSize: OPTION_LIMIT,
        search: search || undefined,
      });
      // A program without a client fits any expense; one with a client must match it.
      return response.programs
        .filter(
          (program) =>
            program.archivedAt === null &&
            (clientId === null || program.clientId === null || program.clientId === clientId),
        )
        .map((program) => ({ id: program.id, label: program.name, detail: program.reference }));
    };

  const issuedInvoices =
    (clientId: string, currency: string): LoadOptions =>
    async (search) => {
      const response = await listInvoices(sessionToken.current, {
        clientId,
        pageSize: OPTION_LIMIT,
        status: 'ISSUED',
        ...(search ? { reference: search.slice(0, 80) } : {}),
      });
      return response.invoices
        .filter((invoice) => invoice.archivedAt === null && invoice.amounts?.currency !== undefined)
        .filter((invoice) => invoice.amounts?.currency === currency)
        .map((invoice) => ({
          id: invoice.id,
          label: invoice.reference,
          detail: invoice.display.missionTitle,
        }));
    };

  const loaders: AccountingLoaders = {
    clients,
    issuedInvoices,
    missions,
    placements,
    trainingPrograms,
  };

  function selectArea(next: AccountingArea): void {
    if (next === area || !access.areas[next] || pending !== null) return;
    setArea(next);
  }

  return (
    <AccountingWorkspace
      access={access}
      area={area}
      areas={areas}
      key={session.key}
      loaders={loaders}
      onArea={selectArea}
      onPrefillConsumed={() => setPrefill(null)}
      onRecordPayment={(next) => {
        if (!access.payments.record || pending !== null) return;
        setPrefill({ ...next, token: (prefill?.token ?? 0) + 1 });
        setArea('payments');
      }}
      prefill={prefill}
      session={accountingSession}
    />
  );
}
