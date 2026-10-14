import type { ClientSummary } from '@hire-me/contracts';
import { useEffect, useId, useRef, type KeyboardEvent } from 'react';

import { useI18n } from '../i18n/index.js';
import { Button, Drawer, StatusBadge } from '../ui/index.js';
import { clientStatusLabelKey, clientStatusTone } from './client-labels.js';

function formatLocation(city: string | null, country: string | null, notRecorded: string): string {
  const parts = [city, country].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : notRecorded;
}

/**
 * A lightweight look at one directory row without leaving the directory.
 *
 * Built only from the list row the directory already holds: no request, no write
 * actions, and no commercial summary or other confidential commercial fields.
 */
export function ClientQuickPreview({
  client,
  onClose,
  onOpenRecord,
  presentation = 'pane',
}: {
  client: ClientSummary;
  onClose: () => void;
  onOpenRecord: () => void;
  presentation?: 'pane' | 'sheet';
}) {
  const { t } = useI18n();
  const location = formatLocation(client.city, client.country, t('clients.notRecorded'));

  if (presentation === 'sheet') {
    return (
      <Drawer
        description={location}
        footer={(requestClose) => (
          <>
            <Button onClick={requestClose} variant="secondary">
              {t('common.actions.close')}
            </Button>
            <Button onClick={onOpenRecord}>{t('clients.preview.openRecord')}</Button>
          </>
        )}
        initialFocus="title"
        onClose={onClose}
        placement="bottom"
        title={client.name}
      >
        <div className="client-preview client-preview--sheet" data-client-id={client.id}>
          <p className="client-preview__eyebrow">{t('clients.preview.eyebrow')}</p>
          <StatusBadge tone={clientStatusTone(client.status)}>
            {t(clientStatusLabelKey(client.status))}
          </StatusBadge>
          <PreviewDetails client={client} />
        </div>
      </Drawer>
    );
  }

  return (
    <PreviewPane
      client={client}
      location={location}
      onClose={onClose}
      onOpenRecord={onOpenRecord}
    />
  );
}

function PreviewPane({
  client,
  location,
  onClose,
  onOpenRecord,
}: {
  client: ClientSummary;
  location: string;
  onClose: () => void;
  onOpenRecord: () => void;
}) {
  const { t } = useI18n();
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, [client.id]);

  function handleKeyDown(event: KeyboardEvent<HTMLElement>): void {
    if (event.key === 'Escape' && !event.defaultPrevented) {
      event.preventDefault();
      onClose();
    }
  }

  return (
    <section
      aria-labelledby={headingId}
      className="client-preview"
      data-client-id={client.id}
      onKeyDown={handleKeyDown}
    >
      <header className="client-preview__header">
        <p className="client-preview__eyebrow">{t('clients.preview.eyebrow')}</p>
        <Button
          aria-label={t('clients.preview.close')}
          onClick={onClose}
          size="compact"
          variant="quiet"
        >
          {t('common.actions.close')}
        </Button>
      </header>
      <div className="client-preview__identity">
        <h2 id={headingId} ref={headingRef} tabIndex={-1}>
          {client.name}
        </h2>
        <p className="client-preview__location">{location}</p>
        <StatusBadge tone={clientStatusTone(client.status)}>
          {t(clientStatusLabelKey(client.status))}
        </StatusBadge>
      </div>
      <PreviewDetails client={client} />
      <div className="client-preview__actions">
        <Button onClick={onOpenRecord}>{t('clients.preview.openRecord')}</Button>
      </div>
    </section>
  );
}

/** Ordinary client summary fields from the list row; never commercial terms. */
function PreviewDetails({ client }: { client: ClientSummary }) {
  const { formatDate, t } = useI18n();
  const notRecorded = t('clients.notRecorded');
  const facts: [string, string | null][] = [
    [t('clients.fields.industry'), client.industry],
    [t('clients.fields.website'), client.website],
    [t('clients.fields.mainPhone'), client.mainPhone],
    [t('clients.fields.location'), formatLocation(client.city, client.country, notRecorded)],
    [t('clients.preview.updated'), formatDate(client.updatedAt)],
  ];

  return (
    <dl className="client-preview__facts">
      {facts.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd data-recorded={value?.trim() ? undefined : 'false'}>
            {value?.trim() || notRecorded}
          </dd>
        </div>
      ))}
    </dl>
  );
}
