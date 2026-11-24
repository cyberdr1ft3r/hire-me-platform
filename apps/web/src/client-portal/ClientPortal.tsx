import {
  ClientDemandFieldsSchema,
  ClientDemandSchema,
  ClientPortalDashboardSchema,
  ClientPortalPublicationsSchema,
  type ClientDemand,
  type ClientDemandFields,
  type ClientPortalDashboard,
  type ClientPortalPublications,
} from '@hire-me/contracts';
import { useEffect, useRef, useState, type FormEvent } from 'react';

import { getApiBaseUrl } from '../api.js';
import { useI18n } from '../i18n/index.js';
import { PublicSite } from '../public-opportunities/PublicSite.js';
import { Button, TextArea, TextField } from '../ui/index.js';
import { clientConfig, clientPortal, ClientPortalError, noResponse } from './api.js';
import { clientCopy, type ClientCopy } from './copy.js';
import './client-portal.css';

const blank = { title: '', description: '', location: '', numberOfPositions: 1 };
type AccessMode = 'login' | 'forgot' | 'accept' | 'reset';

export function ClientPortal({ pathname }: { pathname: string }) {
  const { locale } = useI18n();
  const copy = clientCopy[locale];
  const route = pathname.split('/')[2];
  const mode = route === 'forgot' || route === 'accept' || route === 'reset' ? route : 'login';
  const dashboard = route === undefined || route === 'dashboard';
  const [enabled, setEnabled] = useState<boolean>();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void clientConfig().then(
      (result) => {
        if (active) setEnabled(result.enabled);
      },
      () => {
        if (active) setFailed(true);
      },
    );
    return () => {
      active = false;
    };
  }, [attempt]);

  return (
    <PublicSite showRolesLink={false}>
      <section className="public-page client-portal">
        <h1>{dashboard ? copy.portal : copy[mode]}</h1>
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
        ) : enabled === undefined ? (
          <p role="status">{copy.waiting}</p>
        ) : !enabled ? (
          <p role="status">{copy.disabled}</p>
        ) : dashboard ? (
          <ClientDashboard copy={copy} locale={locale} />
        ) : (
          <ClientAccessForm copy={copy} mode={mode} />
        )}
      </section>
    </PublicSite>
  );
}

function ClientAccessForm({ copy, mode }: { copy: ClientCopy; mode: AccessMode }) {
  const [feedback, setFeedback] = useState<'sent' | 'error' | 'invalid' | null>(null);
  const [busy, setBusy] = useState(false);
  const completing = mode === 'accept' || mode === 'reset';
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setFeedback(null);
    try {
      const body = completing
        ? { token: window.location.hash.slice(1), password: form.get('password') }
        : {
            email: form.get('email'),
            ...(mode === 'login' ? { password: form.get('password') } : {}),
          };
      await clientPortal(mode, noResponse, { body });
      if (mode === 'forgot') setFeedback('sent');
      else window.location.replace('/client');
    } catch (error) {
      setFeedback(error instanceof ClientPortalError && error.status < 500 ? 'invalid' : 'error');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {mode === 'login' ? <p>{copy.signInHelp}</p> : null}
      <form className="public-form client-portal__form" onSubmit={(event) => void submit(event)}>
        {!completing ? (
          <TextField
            name="email"
            label={copy.email}
            type="email"
            required
            autoComplete="email"
            maxLength={254}
          />
        ) : null}
        {mode !== 'forgot' ? (
          <TextField
            name="password"
            label={completing ? copy.newPassword : copy.password}
            type="password"
            hint={completing ? copy.passwordHelp : undefined}
            required
            minLength={12}
            maxLength={128}
            autoComplete={completing ? 'new-password' : 'current-password'}
          />
        ) : null}
        {feedback ? <p role={feedback === 'sent' ? 'status' : 'alert'}>{copy[feedback]}</p> : null}
        <div>
          <Button type="submit" loading={busy} loadingLabel={copy.waiting}>
            {copy.continue}
          </Button>
        </div>
      </form>
      <a href={mode === 'login' ? '/client/forgot' : '/client/sign-in'}>
        {mode === 'login' ? copy.forgot : copy.login}
      </a>
    </>
  );
}

function ClientDashboard({ copy, locale }: { copy: ClientCopy; locale: string }) {
  const [dashboard, setDashboard] = useState<ClientPortalDashboard>();
  const [feedback, setFeedback] = useState<'error' | 'invalid' | 'changed' | 'saved' | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<ClientDemand>();
  const [editor, setEditor] = useState<ClientDemandFields>();
  const [busy, setBusy] = useState(false);
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });

  useEffect(() => {
    let active = true;
    void clientPortal('dashboard', ClientPortalDashboardSchema).then(
      (value) => {
        if (active) setDashboard(value);
      },
      (error: unknown) => {
        if (active) failure(error);
      },
    );
    return () => {
      active = false;
    };
  }, [attempt]);

  function failure(error: unknown) {
    if (error instanceof ClientPortalError && error.status === 401) {
      window.location.replace('/client/sign-in');
      return;
    }
    setFeedback(
      error instanceof ClientPortalError && error.status === 409
        ? 'changed'
        : error instanceof ClientPortalError && error.status === 400
          ? 'invalid'
          : 'error',
    );
  }

  const isEditing = editor !== undefined;
  const selectedId = selected?.id;
  const heading = useRef<HTMLHeadingElement>(null);
  const original = selected ?? blank;
  const dirty =
    !!editor &&
    (editor.title !== original.title ||
      editor.description !== original.description ||
      editor.location !== original.location ||
      editor.numberOfPositions !== original.numberOfPositions);

  useEffect(() => {
    if (isEditing || selectedId) heading.current?.focus();
  }, [isEditing, selectedId]);

  useEffect(() => {
    if (!dirty) return;
    const prevent = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', prevent);
    return () => window.removeEventListener('beforeunload', prevent);
  }, [dirty]);

  function closeEditor() {
    return !dirty || window.confirm(copy.dirty);
  }

  function open(row?: ClientDemand) {
    if (!closeEditor()) return;
    setEditor(row ? undefined : blank);
    setSelected(row);
    setFeedback(null);
  }

  async function action(work: () => Promise<void>) {
    setBusy(true);
    setFeedback(null);
    try {
      await work();
    } catch (error) {
      failure(error);
    } finally {
      setBusy(false);
    }
  }

  function keep(row: ClientDemand) {
    setSelected(row);
    setEditor(undefined);
    setDashboard((current) =>
      current
        ? { ...current, demands: [row, ...current.demands.filter((item) => item.id !== row.id)] }
        : current,
    );
    setFeedback('saved');
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor) return;
    const parsed = ClientDemandFieldsSchema.safeParse(editor);
    if (!parsed.success) {
      setFeedback('invalid');
      return;
    }
    await action(async () => {
      const row = await clientPortal(
        selected ? 'demands/' + selected.id : 'demands',
        ClientDemandSchema,
        { body: selected ? { ...parsed.data, revision: selected.revision } : parsed.data },
      );
      keep(row);
    });
  }

  if (!dashboard)
    return feedback ? (
      <>
        <p role="alert">{copy[feedback]}</p>
        <Button
          onClick={() => {
            setFeedback(null);
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
    <>
      <section className="client-portal__section">
        <h2>{copy.organization}</h2>
        <h3>{dashboard.organization.name}</h3>
        <p>
          {[
            dashboard.organization.industry,
            dashboard.organization.city,
            dashboard.organization.country,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
        {safeWebsite(dashboard.organization.website) ? (
          <p>
            <a href={safeWebsite(dashboard.organization.website)}>
              {dashboard.organization.website}
            </a>
          </p>
        ) : null}
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => {
            if (closeEditor())
              void action(async () => {
                await clientPortal('logout', noResponse, { body: {} });
                window.location.replace('/client/sign-in');
              });
          }}
        >
          {copy.logout}
        </Button>
      </section>

      <section className="client-portal__section">
        <h2>{copy.demands}</h2>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => {
            if (closeEditor())
              void action(async () => {
                const next = await clientPortal('dashboard', ClientPortalDashboardSchema);
                setDashboard(next);
                setEditor(undefined);
                setSelected(next.demands.find((row) => row.id === selectedId));
              });
          }}
        >
          {copy.refresh}
        </Button>
        <Button disabled={busy} onClick={() => open()}>
          {copy.newDemand}
        </Button>
        {dashboard.demands.length ? (
          <ul className="client-portal__list">
            {dashboard.demands.map((row) => (
              <li key={row.id}>
                <button
                  className="client-portal__record"
                  type="button"
                  onClick={() => open(row)}
                  disabled={busy}
                >
                  <strong>{row.title}</strong>
                  <span>{copy[row.status]}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p>{copy.noDemands}</p>
        )}
        {dashboard.nextCursor ? (
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() =>
              void action(async () => {
                const next = await clientPortal(
                  'dashboard?cursor=' + dashboard.nextCursor,
                  ClientPortalDashboardSchema,
                );
                setDashboard({
                  ...next,
                  demands: [
                    ...dashboard.demands,
                    ...next.demands.filter(
                      (row) => !dashboard.demands.some((prior) => prior.id === row.id),
                    ),
                  ],
                });
              })
            }
          >
            {copy.more}
          </Button>
        ) : null}
      </section>

      <section className="client-portal__section" aria-label={copy.selected}>
        {feedback ? <p role={feedback === 'saved' ? 'status' : 'alert'}>{copy[feedback]}</p> : null}
        {feedback === 'changed' && selected ? (
          <Button
            disabled={busy}
            onClick={() => {
              if (closeEditor())
                void action(async () =>
                  keep(await clientPortal('demands/' + selected.id, ClientDemandSchema)),
                );
            }}
          >
            {copy.retry}
          </Button>
        ) : null}
        {editor ? (
          <form className="public-form client-portal__form" onSubmit={(event) => void save(event)}>
            <h2 ref={heading} tabIndex={-1}>
              {selected ? copy.edit : copy.newDemand}
            </h2>
            <TextField
              label={copy.title}
              value={editor.title}
              onChange={(event) => setEditor({ ...editor, title: event.target.value })}
              required
              minLength={3}
              maxLength={180}
            />
            <TextArea
              label={copy.description}
              value={editor.description}
              onChange={(event) => setEditor({ ...editor, description: event.target.value })}
              required
              minLength={10}
              maxLength={3000}
              rows={5}
            />
            <TextField
              label={copy.location}
              value={editor.location}
              onChange={(event) => setEditor({ ...editor, location: event.target.value })}
              maxLength={120}
            />
            <TextField
              label={copy.positions}
              type="number"
              min={1}
              max={100}
              value={editor.numberOfPositions || ''}
              onChange={(event) =>
                setEditor({ ...editor, numberOfPositions: Number(event.target.value) })
              }
              required
            />
            <div className="client-portal__actions">
              <Button type="submit" loading={busy} loadingLabel={copy.waiting}>
                {copy.saveDraft}
              </Button>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  if (closeEditor()) setEditor(undefined);
                }}
              >
                {copy.cancel}
              </Button>
            </div>
          </form>
        ) : selected ? (
          <>
            <h2 ref={heading} tabIndex={-1}>
              {selected.title}
            </h2>
            <p>{copy[selected.status]}</p>
            <p className="client-portal__description">{selected.description}</p>
            <p>
              {[selected.location, copy.positions + ' · ' + selected.numberOfPositions]
                .filter(Boolean)
                .join(' · ')}
            </p>
            {selected.editable ? (
              <div className="client-portal__actions">
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() =>
                    setEditor({
                      title: selected.title,
                      description: selected.description,
                      location: selected.location,
                      numberOfPositions: selected.numberOfPositions,
                    })
                  }
                >
                  {copy.edit}
                </Button>
                <Button
                  disabled={busy}
                  onClick={() =>
                    void action(async () =>
                      keep(
                        await clientPortal(
                          'demands/' + selected.id + '/submit',
                          ClientDemandSchema,
                          { body: { revision: selected.revision } },
                        ),
                      ),
                    )
                  }
                >
                  {copy.submit}
                </Button>
              </div>
            ) : null}
            <h3>{copy.history}</h3>
            <ol>
              {selected.history.map((entry, i) => (
                <li key={entry.createdAt + i}>
                  {date.format(new Date(entry.createdAt))} · {copy[entry.status]}
                  {entry.reason ? ' · ' + copy[entry.reason] : ''}
                </li>
              ))}
            </ol>
            {selected.status === 'CONVERTED' ? (
              <CandidateCards key={selected.id} copy={copy} demandId={selected.id} />
            ) : null}
          </>
        ) : null}
      </section>
      <CandidateCards copy={copy} />
    </>
  );
}

function safeWebsite(value: string | null) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function CandidateCards({ copy, demandId }: { copy: ClientCopy; demandId?: string }) {
  const [items, setItems] = useState<ClientPortalPublications>();
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const route = 'publications?' + (demandId ? 'demandId=' + demandId : '');
  useEffect(() => {
    let active = true;
    void clientPortal(route, ClientPortalPublicationsSchema).then(
      (value) => {
        if (active) setItems(value);
      },
      () => {
        if (active) setFailed(true);
      },
    );
    return () => {
      active = false;
    };
  }, [attempt, route]);

  async function more(cursor: string) {
    setBusy(true);
    setFailed(false);
    try {
      const next = await clientPortal(route + '&cursor=' + cursor, ClientPortalPublicationsSchema);
      setItems((prior) => ({
        ...next,
        publications: [...(prior?.publications ?? []), ...next.publications],
      }));
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="client-portal__section">
      <h2>{demandId ? copy.shortlist : copy.available}</h2>
      {failed ? (
        <>
          <p role="alert">{copy.error}</p>
          <Button
            variant="secondary"
            onClick={() => {
              setFailed(false);
              setAttempt(attempt + 1);
            }}
          >
            {copy.retry}
          </Button>
        </>
      ) : !items ? (
        <p role="status">{copy.waiting}</p>
      ) : !items.publications.length ? (
        <p>{copy.noCards}</p>
      ) : (
        <ul className="client-portal__cards">
          {items.publications.map((card) => (
            <li key={card.id}>
              <h3>{card.title}</h3>
              <p>{[card.city, card.country].filter(Boolean).join(' · ')}</p>
              {card.summaryDocument ? (
                <a
                  href={getApiBaseUrl() + '/v1/client-portal/publications/' + card.id + '/document'}
                >
                  {copy.document}
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {items?.nextCursor ? (
        <Button variant="secondary" disabled={busy} onClick={() => void more(items.nextCursor!)}>
          {copy.more}
        </Button>
      ) : null}
    </section>
  );
}
