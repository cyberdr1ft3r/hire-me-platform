import {
  ClientPortalPreviewSchema,
  ClientPortalStaffDemandSchema,
  ClientPortalStaffOrganizationSchema,
  type ClientPortalPreview,
  ClientPublicationSchema,
  clientPortalPermissions,
  type CandidateListResponse,
  type ClientDemandDecision,
  type ClientPortalStaffOrganization,
  type ClientPublicationRequest,
} from '@hire-me/contracts';
import { useEffect, useState, type FormEvent } from 'react';

import { listCandidates, listClientContacts } from '../api.js';
import { useI18n } from '../i18n/index.js';
import { Button, Checkbox, Select, TextField } from '../ui/index.js';
import {
  clientConfig,
  clientPortal,
  ClientPortalError,
  noResponse,
  type PortalSchema,
} from './api.js';
import { clientCopy, type ClientCopy } from './copy.js';
import './client-portal.css';

type StaffRequest = {
  <T>(route: string, schema: PortalSchema<T>, body?: object): Promise<T>;
};
type StaffDemand = ClientPortalStaffOrganization['demands'][number];
type Feedback = 'saved' | 'error' | 'invalid' | 'denied' | 'changed';

export function ClientPortalStaff({
  clientId,
  accessToken,
  permissions,
  onNavigatePath,
}: {
  clientId: string;
  accessToken: string;
  permissions: readonly string[];
  onNavigatePath?: (path: string) => void;
}) {
  const { locale } = useI18n();
  const copy = clientCopy[locale];
  const [data, setData] = useState<ClientPortalStaffOrganization>();
  const [disabled, setDisabled] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>();
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const can = (need: readonly string[]) =>
    need.every((permission) => permissions.includes(permission));

  function request<T>(route: string, schema: PortalSchema<T>, body?: object) {
    return clientPortal('organizations/' + clientId + route, schema, {
      body,
      staffToken: accessToken,
    });
  }

  useEffect(() => {
    let active = true;
    void clientConfig()
      .then(async ({ enabled }) => {
        if (!active) return;
        setDisabled(!enabled);
        if (enabled) {
          const value = await clientPortal(
            'organizations/' + clientId,
            ClientPortalStaffOrganizationSchema,
            { staffToken: accessToken },
          );
          if (active) setData(value);
        }
      })
      .catch((error: unknown) => {
        if (active) setFeedback(message(error));
      });
    return () => {
      active = false;
    };
  }, [clientId, accessToken, attempt]);

  async function mutate(work: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setFeedback(undefined);
    try {
      await work();
      setData(await request('', ClientPortalStaffOrganizationSchema));
      setFeedback('saved');
    } catch (error) {
      setFeedback(message(error));
    } finally {
      setBusy(false);
    }
  }

  if (disabled) return <p role="status">{copy.disabled}</p>;
  if (!data)
    return feedback ? (
      <>
        <p role="alert">{copy[feedback]}</p>
        <Button
          onClick={() => {
            setFeedback(undefined);
            setAttempt(attempt + 1);
          }}
        >
          {copy.retry}
        </Button>
      </>
    ) : (
      <p role="status">{copy.waiting}</p>
    );

  return (
    <div className="client-portal">
      {feedback ? <p role={feedback === 'saved' ? 'status' : 'alert'}>{copy[feedback]}</p> : null}
      <Button
        variant="secondary"
        disabled={busy}
        onClick={() => {
          setFeedback(undefined);
          setAttempt(attempt + 1);
        }}
      >
        {copy.refresh}
      </Button>
      {can(clientPortalPermissions.access) ? (
        <AccessManager
          data={data}
          request={request}
          copy={copy}
          mutate={mutate}
          busy={busy}
          clientId={clientId}
          accessToken={accessToken}
        />
      ) : null}

      <section className="client-portal__section">
        <h2>{copy.demands}</h2>
        {data.demands.length ? (
          data.demands.map((row) => (
            <DemandReview
              key={row.id}
              row={row}
              copy={copy}
              busy={busy}
              canConvert={can(clientPortalPermissions.convert)}
              onNavigatePath={onNavigatePath}
              mutate={(decision) =>
                mutate(() =>
                  request(
                    '/demands/' + row.id + '/decision',
                    ClientPortalStaffDemandSchema,
                    decision,
                  ),
                )
              }
            />
          ))
        ) : (
          <p>{copy.noDemands}</p>
        )}
      </section>

      {can(clientPortalPermissions.publish) ? (
        <PublicationManager
          data={data}
          request={request}
          copy={copy}
          mutate={mutate}
          busy={busy}
          accessToken={accessToken}
          canShortlist={can(clientPortalPermissions.shortlist)}
        />
      ) : null}
    </div>
  );
}

function message(error: unknown): Feedback {
  if (error instanceof ClientPortalError) {
    if (error.status === 403) return 'denied';
    if (error.status === 409) return 'changed';
    if (error.status === 400 || error.status === 404) return 'invalid';
  }
  return 'error';
}

type ManagerProps = {
  data: ClientPortalStaffOrganization;
  request: StaffRequest;
  copy: ClientCopy;
  mutate: (work: () => Promise<unknown>) => Promise<void>;
  busy: boolean;
  accessToken: string;
};

function AccessManager({
  data,
  request,
  copy,
  mutate,
  busy,
  clientId,
  accessToken,
}: ManagerProps & { clientId: string }) {
  const [contacts, setContacts] = useState<Awaited<ReturnType<typeof listClientContacts>>>();
  const [page, setPage] = useState(1);
  const [contactId, setContactId] = useState('');
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void listClientContacts({ clientId, accessToken, status: 'ACTIVE', page }).then(
      (value) => {
        if (active) setContacts(value);
      },
      () => {
        if (active) setFailed(true);
      },
    );
    return () => {
      active = false;
    };
  }, [clientId, accessToken, page, attempt]);
  const invite = (id: string) =>
    mutate(() => request('/invitations', noResponse, { contactId: id }));

  return (
    <section className="client-portal__section">
      <h2>{copy.access}</h2>
      {failed ? (
        <>
          <p role="alert">{copy.error}</p>
          <Button
            onClick={() => {
              setFailed(false);
              setAttempt(attempt + 1);
            }}
          >
            {copy.retry}
          </Button>
        </>
      ) : !contacts ? (
        <p role="status">{copy.waiting}</p>
      ) : contacts.contacts.length ? (
        <form
          className="client-portal__form"
          onSubmit={(event) => {
            event.preventDefault();
            if (contactId) void invite(contactId);
          }}
        >
          <Select
            label={copy.contact}
            value={contactId}
            onChange={(event) => setContactId(event.target.value)}
            required
          >
            <option value="">{copy.choose}</option>
            {contacts.contacts
              .filter(
                (contact) =>
                  !data.members.some(
                    (member) => member.contactId === contact.id && member.state === 'ACTIVE',
                  ),
              )
              .map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {contact.displayName} · {contact.email}
                </option>
              ))}
          </Select>
          <div className="client-portal__actions">
            <Button type="submit" disabled={busy}>
              {copy.invite}
            </Button>
            {page > 1 ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setContactId('');
                  setPage(page - 1);
                }}
              >
                {copy.contactPrevious}
              </Button>
            ) : null}
            {page * contacts.pagination.pageSize < contacts.pagination.total ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setContactId('');
                  setPage(page + 1);
                }}
              >
                {copy.moreContacts}
              </Button>
            ) : null}
          </div>
        </form>
      ) : (
        <p>{copy.noContacts}</p>
      )}
      {data.members.length ? (
        <>
          <h3>{copy.members}</h3>
          <ul className="client-portal__list">
            {data.members.map((member) => (
              <li key={member.id}>
                <p>
                  <strong>{member.name}</strong> · {member.email} · {copy[member.state]}
                </p>
                <div className="client-portal__actions">
                  {member.state !== 'ACTIVE' ? (
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() => void invite(member.contactId)}
                    >
                      {copy.resend}
                    </Button>
                  ) : null}
                  {member.state !== 'REVOKED' ? (
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() => {
                        if (window.confirm(copy.revokeConfirm))
                          void mutate(() =>
                            request('/members/' + member.id + '/revoke', noResponse, {}),
                          );
                      }}
                    >
                      {copy.revokeAccess}
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}

function DemandReview({
  row,
  copy,
  busy,
  mutate,
  canConvert,
  onNavigatePath,
}: {
  row: StaffDemand;
  copy: ClientCopy;
  busy: boolean;
  canConvert: boolean;
  mutate: (decision: ClientDemandDecision) => Promise<void>;
  onNavigatePath?: (path: string) => void;
}) {
  const [reason, setReason] = useState<'CAPACITY' | 'OUTSIDE_SCOPE'>('CAPACITY');
  const act = (action: ClientDemandDecision['action']) => {
    if (window.confirm(copy.decisionConfirm))
      void mutate({
        action,
        revision: row.revision,
        ...(action === 'REVISE'
          ? { reason: 'MORE_DETAILS' }
          : action === 'REJECT'
            ? { reason }
            : {}),
      });
  };
  const mission = '/missions?mission=' + row.missionId;
  return (
    <details>
      <summary>
        {row.title} · {copy[row.status]}
      </summary>
      <div className="client-portal__section">
        <p className="client-portal__description">{row.description}</p>
        <p>
          {[row.location, copy.positions + ' · ' + row.numberOfPositions]
            .filter(Boolean)
            .join(' · ')}
        </p>
        {row.status === 'SUBMITTED' ? (
          <Button disabled={busy} onClick={() => act('REVIEW')}>
            {copy.REVIEW}
          </Button>
        ) : null}
        {row.status === 'IN_REVIEW' ? (
          <>
            <div className="client-portal__actions">
              <Button disabled={busy} onClick={() => act('APPROVE')}>
                {copy.APPROVE}
              </Button>
              <Button variant="secondary" disabled={busy} onClick={() => act('REVISE')}>
                {copy.REVISE}
              </Button>
            </div>
            <Select
              label={copy.reason}
              value={reason}
              onChange={(event) => setReason(event.target.value as typeof reason)}
            >
              <option value="CAPACITY">{copy.CAPACITY}</option>
              <option value="OUTSIDE_SCOPE">{copy.OUTSIDE_SCOPE}</option>
            </Select>
            <Button variant="secondary" disabled={busy} onClick={() => act('REJECT')}>
              {copy.REJECT}
            </Button>
          </>
        ) : null}
        {row.status === 'APPROVED' && canConvert ? (
          <Button disabled={busy} onClick={() => act('CONVERT')}>
            {copy.CONVERT}
          </Button>
        ) : null}
        {row.missionId ? (
          <a
            href={mission}
            onClick={(event) => {
              if (
                onNavigatePath &&
                event.button === 0 &&
                !event.metaKey &&
                !event.ctrlKey &&
                !event.shiftKey &&
                !event.altKey
              ) {
                event.preventDefault();
                onNavigatePath(mission);
              }
            }}
          >
            {copy.mission}
          </a>
        ) : null}
        <h3>{copy.history}</h3>
        <ol>
          {row.history.map((entry, i) => (
            <li key={entry.createdAt + i}>
              {copy[entry.status]}
              {entry.reason ? ' · ' + copy[entry.reason] : ''}
            </li>
          ))}
        </ol>
      </div>
    </details>
  );
}

function PublicationManager({
  data,
  request,
  copy,
  mutate,
  busy,
  accessToken,
  canShortlist,
}: ManagerProps & { canShortlist: boolean }) {
  const [search, setSearch] = useState('');
  const [found, setFound] = useState<CandidateListResponse>();
  const [candidateId, setCandidateId] = useState('');
  const [demandId, setDemandId] = useState('');
  const [summaryDocument, setSummaryDocument] = useState(false);
  const [preview, setPreview] = useState<ClientPortalPreview>();
  const [error, setError] = useState<Feedback>();
  const [loading, setLoading] = useState(false);
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const requestBody: ClientPublicationRequest = {
    candidateId,
    ...(demandId ? { demandId } : {}),
    summaryDocument,
  };

  async function find(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(undefined);
    setPreview(undefined);
    setConsentConfirmed(false);
    setCandidateId('');
    try {
      setFound(await listCandidates({ accessToken, search: search.trim() }));
    } catch (failure) {
      setError(message(failure));
    } finally {
      setLoading(false);
    }
  }

  async function makePreview() {
    setError(undefined);
    setConsentConfirmed(false);
    setLoading(true);
    try {
      setPreview(await request('/publications/preview', ClientPortalPreviewSchema, requestBody));
    } catch (failure) {
      setError(message(failure));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="client-portal__section">
      <h2>{copy.publications}</h2>
      <form className="client-portal__form" onSubmit={(event) => void find(event)}>
        <TextField
          label={copy.searchLabel}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          maxLength={120}
          required
        />
        <div>
          <Button type="submit" disabled={busy || loading}>
            {copy.find}
          </Button>
        </div>
      </form>
      {error ? <p role="alert">{copy[error]}</p> : null}
      {found?.candidates.length === 0 ? <p>{copy.noResults}</p> : null}
      {found?.candidates.length ? (
        <div className="client-portal__form">
          <Select
            label={copy.candidate}
            value={candidateId}
            disabled={loading || busy}
            onChange={(event) => {
              setPreview(undefined);
              setCandidateId(event.target.value);
            }}
          >
            <option value="">{copy.choose}</option>
            {found.candidates.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.displayName}
              </option>
            ))}
          </Select>
          {canShortlist ? (
            <Select
              label={copy.chooseDemand}
              value={demandId}
              disabled={loading || busy}
              onChange={(event) => {
                setPreview(undefined);
                setDemandId(event.target.value);
              }}
            >
              <option value="">{copy.available}</option>
              {data.demands
                .filter((row) => row.status === 'CONVERTED')
                .map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.title}
                  </option>
                ))}
            </Select>
          ) : null}
          <Checkbox
            label={copy.approveDocument}
            checked={summaryDocument}
            disabled={loading || busy}
            onChange={(event) => {
              setPreview(undefined);
              setSummaryDocument(event.target.checked);
            }}
          />
          <div>
            <Button
              variant="secondary"
              disabled={!candidateId || loading || busy}
              onClick={() => void makePreview()}
            >
              {copy.preview}
            </Button>
          </div>
        </div>
      ) : null}
      {preview ? (
        <div className="client-portal__section">
          <p>{copy.summary}</p>
          <strong>{preview.title}</strong>
          <p>{[preview.city, preview.country].filter(Boolean).join(' · ')}</p>
          <Checkbox
            label={copy.confirmConsent}
            checked={consentConfirmed}
            onChange={(event) => setConsentConfirmed(event.target.checked)}
          />
          <Button
            disabled={!consentConfirmed || busy || loading}
            onClick={() =>
              void mutate(async () => {
                await request('/publications', ClientPublicationSchema, {
                  ...requestBody,
                  preview,
                  consentConfirmed,
                });
                setPreview(undefined);
              })
            }
          >
            {copy.publish}
          </Button>
        </div>
      ) : null}
      {data.publications.length ? (
        <ul className="client-portal__cards">
          {data.publications.map((card) => (
            <li key={card.id}>
              <h3>{card.title}</h3>
              <p>{data.demands.find((row) => row.id === card.demandId)?.title ?? copy.available}</p>
              {!card.demandId || canShortlist ? (
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm(copy.publicationConfirm))
                      void mutate(() =>
                        request('/publications/' + card.id + '/revoke', noResponse, {}),
                      );
                  }}
                >
                  {copy.revokePublication}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p>{copy.noCards}</p>
      )}
    </section>
  );
}
