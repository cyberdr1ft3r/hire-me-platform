import type { ClientStatus, ClientSummary } from '@hire-me/contracts';
import { useEffect, useState, type FormEvent, type ReactNode, type RefObject } from 'react';

import {
  CandidateActionMenu,
  type CandidateMenuAction,
} from '../candidates/CandidateActionMenu.js';
import { useI18n } from '../i18n/index.js';
import { Button, InlineMessage, StatusBadge } from '../ui/index.js';
import type { ClientAccess } from './client-access.js';
import type { ClientProfileValues } from './client-form.js';
import { clientStatusLabelKey, clientStatusTone } from './client-labels.js';
import type { ClientFeedback } from './client-state.js';
import { ClientProfileRead } from './ClientProfileRead.js';

const CLIENT_LIFECYCLE: readonly ClientStatus[] = ['PROSPECT', 'ACTIVE', 'INACTIVE'];

function formatClientHeadline(client: ClientSummary): string {
  const parts = [
    client.industry?.trim(),
    [client.city?.trim(), client.country?.trim()].filter(Boolean).join(', '),
  ].filter(Boolean);
  return parts.join(' · ');
}

export function ClientRecordOverview({
  access,
  client,
  clientHeadingRef,
  detailRevealToken,
  editClientValues,
  feedback,
  onArchiveClient,
  onCancelClientEdit,
  onChangeClientStatus,
  onEditClientValuesChange,
  onSaveClient,
  renderClientFields,
  writesLocked,
}: {
  access: ClientAccess;
  client: ClientSummary;
  clientHeadingRef: RefObject<HTMLHeadingElement | null>;
  detailRevealToken: number;
  editClientValues: ClientProfileValues;
  feedback: ClientFeedback | null;
  onArchiveClient: () => void;
  onCancelClientEdit: () => void;
  onChangeClientStatus: (status: ClientStatus) => void;
  onEditClientValuesChange: (values: ClientProfileValues) => void;
  onSaveClient: (event: FormEvent<HTMLFormElement>) => void;
  renderClientFields: (props: {
    disabled: boolean;
    includeCommercial: boolean;
    onChange: (values: ClientProfileValues) => void;
    values: ClientProfileValues;
  }) => ReactNode;
  writesLocked: boolean;
}) {
  const { formatDateTime, t } = useI18n();
  const [editing, setEditing] = useState(false);
  const archived = client.status === 'ARCHIVED';
  const canEdit = access.canUpdateClients && !archived;
  const headline = formatClientHeadline(client);

  useEffect(() => {
    setEditing(false);
  }, [client.id, detailRevealToken]);

  useEffect(() => {
    if (feedback?.tone === 'success' && feedback.messageKey === 'clients.feedback.updatedClient') {
      setEditing(false);
    }
  }, [feedback]);

  const lifecycleTargets = CLIENT_LIFECYCLE.filter((status) => status !== client.status);
  const menuActions: CandidateMenuAction[] = [
    ...(access.canManageClientStatus && !archived
      ? lifecycleTargets.map((status) => ({
          key: status,
          label:
            status === 'PROSPECT'
              ? t('clients.lifecycle.moveTo.PROSPECT')
              : status === 'ACTIVE'
                ? t('clients.lifecycle.moveTo.ACTIVE')
                : t('clients.lifecycle.moveTo.INACTIVE'),
          onSelect: () => onChangeClientStatus(status),
        }))
      : []),
    ...(access.canArchiveClients && !archived
      ? [
          {
            danger: true,
            key: 'archive',
            label: t('clients.actions.archiveClient'),
            onSelect: onArchiveClient,
          },
        ]
      : []),
  ];

  function closeEditor(): void {
    onCancelClientEdit();
    setEditing(false);
    window.setTimeout(() => clientHeadingRef.current?.focus(), 0);
  }

  return (
    <article aria-labelledby="client-record-name" className="client-detail">
      <header className="client-detail__identity">
        <div className="client-detail__heading">
          <h2
            className="client-detail__title"
            id="client-record-name"
            key={detailRevealToken}
            ref={clientHeadingRef}
            tabIndex={-1}
          >
            {client.name}
          </h2>
          <p className="client-detail__headline">
            {headline.length > 0 ? headline : t('clients.profile.noHeadline')}
          </p>
          <div className="client-detail__meta">
            <StatusBadge tone={clientStatusTone(client.status)}>
              {t(clientStatusLabelKey(client.status))}
            </StatusBadge>
            <span>{t('clients.profile.updated', { date: formatDateTime(client.updatedAt) })}</span>
          </div>
        </div>
        {canEdit || menuActions.length > 0 ? (
          <div aria-label={t('clients.actions.region')} className="client-actions" role="group">
            {canEdit && !editing ? (
              <Button disabled={writesLocked} onClick={() => setEditing(true)}>
                {t('clients.actions.editClient')}
              </Button>
            ) : null}
            {menuActions.length > 0 ? (
              <CandidateActionMenu
                actions={menuActions}
                disabled={writesLocked}
                label={t('clients.actions.more')}
                loadingLabel={t('common.status.working')}
              />
            ) : null}
          </div>
        ) : null}
      </header>

      {archived ? (
        <InlineMessage title={t('clients.lifecycle.archivedNotice')} tone="warning">
          {t('clients.lifecycle.archivedNotice')}
        </InlineMessage>
      ) : null}

      {canEdit && editing ? (
        <form
          aria-label={t('clients.profile.editTitle')}
          className="client-form client-form--edit"
          onSubmit={onSaveClient}
        >
          <h3 className="clients__pane-title">{t('clients.profile.editTitle')}</h3>
          {renderClientFields({
            disabled: false,
            includeCommercial: access.canSeeCommercial,
            onChange: onEditClientValuesChange,
            values: editClientValues,
          })}
          <div className="client-form__actions">
            <Button disabled={writesLocked} type="submit" variant="primary">
              {t('clients.actions.saveClient')}
            </Button>
            <Button disabled={writesLocked} onClick={closeEditor} type="button" variant="secondary">
              {t('common.actions.cancel')}
            </Button>
          </div>
        </form>
      ) : (
        <ClientProfileRead client={client} includeCommercial={access.canSeeCommercial} />
      )}
    </article>
  );
}
