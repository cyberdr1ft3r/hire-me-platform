import type { CommercialAccess } from './commercial-access.js';
import type { LifecycleInput } from './commercial-api.js';
import type {
  CommercialDetail,
  CommercialKind,
  CommercialSummary,
  LifecycleAction,
} from './commercial-kinds.js';
import { useCommercialFormat } from './commercial-labels.js';
import {
  hasActiveFilters,
  type CommercialFeedback,
  type CommercialListFilters,
  type CreateFormValues,
  type CreateRequest,
  type DetailState,
  type ListState,
  type LoadCommercialOptions,
} from './commercial-state.js';
import { Button, EmptyState, InlineMessage, PageHeader } from '../ui/index.js';
import { CommercialCreateForm } from './CommercialCreateForm.js';
import { CommercialDetailView } from './CommercialDetail.js';
import type { GenerationActions } from './CommercialGeneration.js';
import { CommercialFilters, CommercialList } from './CommercialList.js';
import type { CommercialWriteAction, CreateDraft } from './CommercialPanel.js';

export type CommercialLoaders = {
  clients: LoadCommercialOptions;
  missions: (clientId: string) => LoadCommercialOptions;
  placements: (clientId: string, recruitmentMissionId: string | null) => LoadCommercialOptions;
  sources: (
    source: 'quotation' | 'contract' | 'purchaseOrder',
    clientId: string,
  ) => LoadCommercialOptions;
};

export type ListPane = {
  appliedFilters: CommercialListFilters;
  filters: CommercialListFilters;
  state: ListState<CommercialSummary>;
  selectedId: string | null;
  onApply: () => void;
  onFiltersChange: (filters: CommercialListFilters) => void;
  onPage: (page: number) => void;
  onReset: () => void;
  onRetry: () => void;
  onSelect: (summary: CommercialSummary) => void;
};

export type DetailPane = {
  focusToken: number;
  state: DetailState<CommercialDetail>;
  generation: GenerationActions;
  onAction: (action: LifecycleAction, input: LifecycleInput) => Promise<boolean>;
  onRetry: () => void;
};

export type CreatePane = {
  draft: CreateDraft | null;
  onCancel: () => void;
  onChange: (values: CreateFormValues) => void;
  onOpen: (kind: CommercialKind, from?: CommercialDetail) => void;
  onSubmit: (request: CreateRequest) => Promise<boolean>;
};

export function CommercialWorkspace({
  access,
  create,
  detail,
  feedback,
  kind,
  kinds,
  list,
  loaders,
  onKind,
  pending,
  sessionKey,
}: {
  access: CommercialAccess;
  create: CreatePane;
  detail: DetailPane;
  feedback: CommercialFeedback | null;
  kind: CommercialKind;
  kinds: CommercialKind[];
  list: ListPane;
  loaders: CommercialLoaders;
  onKind: (kind: CommercialKind) => void;
  pending: CommercialWriteAction | null;
  sessionKey: number;
}) {
  const { message, t } = useCommercialFormat();
  const writesLocked = pending !== null;
  const draft = create.draft;

  return (
    <section aria-label={t('commercial.region')} className="commercial">
      <PageHeader
        description={t('commercial.header.description')}
        eyebrow={t('commercial.header.eyebrow')}
        primaryAction={
          access.manage[kind] && access.view[kind] && !draft ? (
            <Button onClick={() => create.onOpen(kind)}>{t(`commercial.newRecord.${kind}`)}</Button>
          ) : undefined
        }
        title={t('commercial.header.title')}
      />

      <ol aria-label={t('commercial.header.chainLabel')} className="commercial-chain-hint">
        <li>{t('commercial.kinds.quotation')}</li>
        <li>{t('commercial.kinds.purchaseOrder')}</li>
        <li>{t('commercial.kinds.invoice')}</li>
      </ol>

      {access.readOnly ? (
        <InlineMessage title={t('commercial.notices.readOnly.title')} tone="info">
          <p className="commercial-message__text">{t('commercial.notices.readOnly.body')}</p>
        </InlineMessage>
      ) : null}
      {!access.amounts ? (
        <InlineMessage title={t('commercial.notices.amountsHidden.title')} tone="info">
          <p className="commercial-message__text">{t('commercial.notices.amountsHidden.body')}</p>
        </InlineMessage>
      ) : null}
      {!access.pickMissions && kinds.length > 0 ? (
        <InlineMessage title={t('commercial.notices.missionScope.title')} tone="info">
          <p className="commercial-message__text">{t('commercial.notices.missionScope.body')}</p>
        </InlineMessage>
      ) : null}
      {feedback ? (
        <InlineMessage
          announce
          title={
            feedback.tone === 'success'
              ? t('commercial.feedback.successTitle')
              : t('commercial.feedback.errorTitle')
          }
          tone={feedback.tone === 'success' ? 'success' : 'danger'}
        >
          <p className="commercial-message__text">{message(feedback.messageKey)}</p>
        </InlineMessage>
      ) : null}

      {kinds.length === 0 ? (
        <EmptyState title={t('commercial.empty.noAccessTitle')}>
          {t('commercial.empty.noAccess')}
        </EmptyState>
      ) : (
        <>
          {draft ? (
            <CommercialCreateForm
              access={access}
              draft={draft}
              key={`${sessionKey}:${draft.kind}:${draft.focusToken}`}
              loaders={loaders}
              onCancel={create.onCancel}
              onChange={create.onChange}
              onSubmit={create.onSubmit}
              sessionKey={sessionKey}
              writesLocked={writesLocked}
            />
          ) : null}

          <div aria-label={t('commercial.kindTabs')} className="commercial-kinds" role="group">
            {kinds.map((option) => (
              <button
                aria-pressed={option === kind}
                className="commercial-kinds__option"
                key={option}
                onClick={() => onKind(option)}
                type="button"
              >
                {t(`commercial.kindsPlural.${option}`)}
              </button>
            ))}
          </div>

          <div className="commercial__workspace">
            <section aria-labelledby="commercial-list-title" className="commercial__list-pane">
              <h2 className="commercial__pane-title" id="commercial-list-title">
                {t(`commercial.kindsPlural.${kind}`)}
              </h2>
              <CommercialFilters
                access={access}
                busy={list.state.status === 'loading'}
                kind={kind}
                loadClients={loaders.clients}
                onChange={list.onFiltersChange}
                onReset={list.onReset}
                onSubmit={list.onApply}
                sessionKey={sessionKey}
                showReset={hasActiveFilters(list.appliedFilters) || hasActiveFilters(list.filters)}
                values={list.filters}
              />
              <CommercialList
                filtered={hasActiveFilters(list.appliedFilters)}
                kind={kind}
                list={list.state}
                onPage={list.onPage}
                onReset={list.onReset}
                onRetry={list.onRetry}
                onSelect={list.onSelect}
                selectedId={list.selectedId}
              />
            </section>

            <div className="commercial__detail-pane">
              <CommercialDetailView
                access={access}
                detail={detail}
                kind={kind}
                onFollowUp={(target, from) => create.onOpen(target, from)}
                pending={pending}
                selectedId={list.selectedId}
              />
            </div>
          </div>
        </>
      )}
    </section>
  );
}
