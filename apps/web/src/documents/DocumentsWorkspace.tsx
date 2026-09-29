import type { DocumentContextOptionKind, DocumentVersion } from '@hire-me/contracts';
import type { FormEvent } from 'react';

import { useI18n } from '../i18n/index.js';
import { Button, InlineMessage, PageHeader } from '../ui/index.js';
import type { DocumentAccess } from './document-access.js';
import {
  hasActiveDocumentFilters,
  type DocumentDetailState,
  type DocumentFeedback,
  type DocumentFilterValues,
  type DocumentListState,
  type MetadataValues,
  type RegisterValues,
} from './document-state.js';
import { DocumentDetail } from './DocumentDetail.js';
import { DocumentFilters } from './DocumentFilters.js';
import { DocumentList } from './DocumentList.js';
import type { LoadDocumentOptions } from './DocumentOptionPicker.js';
import { DocumentRegisterForm } from './DocumentRegisterForm.js';

export function DocumentsWorkspace({
  access,
  appliedFilters,
  detail,
  downloading,
  feedback,
  filters,
  focusToken,
  list,
  loadOptions,
  metadata,
  onAddVersion,
  onApplyFilters,
  onArchive,
  onDownload,
  onFiltersChange,
  onMetadataChange,
  onPage,
  onRegister,
  onRegisterValuesChange,
  onResetFilters,
  onRetryDetail,
  onRetryList,
  onSaveMetadata,
  onSelect,
  onVersionFileChange,
  registerFormKey,
  registerValues,
  selectedId,
  sessionKey,
  versionFile,
  versionInputKey,
  writesLocked,
}: {
  access: DocumentAccess;
  appliedFilters: DocumentFilterValues;
  detail: DocumentDetailState;
  downloading: string | null;
  feedback: DocumentFeedback | null;
  filters: DocumentFilterValues;
  focusToken: number;
  list: DocumentListState;
  loadOptions: (
    kind: DocumentContextOptionKind,
    purpose: 'filter' | 'attach',
    missionCandidateId?: string,
  ) => LoadDocumentOptions;
  metadata: MetadataValues | null;
  onAddVersion: (event: FormEvent<HTMLFormElement>) => void;
  onApplyFilters: () => void;
  onArchive: () => void;
  onDownload: (version: DocumentVersion) => void;
  onFiltersChange: (values: DocumentFilterValues) => void;
  onMetadataChange: (values: MetadataValues) => void;
  onPage: (page: number) => void;
  onRegister: (event: FormEvent<HTMLFormElement>) => void;
  onRegisterValuesChange: (values: RegisterValues) => void;
  onResetFilters: () => void;
  onRetryDetail: () => void;
  onRetryList: () => void;
  onSaveMetadata: (event: FormEvent<HTMLFormElement>) => void;
  onSelect: (documentId: string) => void;
  onVersionFileChange: (file: File | null) => void;
  registerFormKey: number;
  registerValues: RegisterValues;
  selectedId: string | null;
  sessionKey: number;
  versionFile: File | null;
  versionInputKey: number;
  writesLocked: boolean;
}) {
  const { t } = useI18n();
  // Feedback keys are parameterless messages.
  const message = t as (key: DocumentFeedback['messageKey']) => string;
  const filtered = hasActiveDocumentFilters(appliedFilters);

  return (
    <section aria-label={t('documents.region')} className="documents">
      <PageHeader
        description={t('documents.header.description')}
        eyebrow={t('documents.header.eyebrow')}
        title={t('documents.header.title')}
      />
      {access.readOnly ? (
        <InlineMessage title={t('documents.readOnly.title')} tone="info">
          {t('documents.readOnly.body')}
        </InlineMessage>
      ) : null}
      {feedback ? (
        <InlineMessage
          announce
          title={
            feedback.tone === 'success'
              ? t('documents.feedback.successTitle')
              : t('documents.feedback.errorTitle')
          }
          tone={feedback.tone === 'success' ? 'success' : 'danger'}
        >
          <p className="document-message__text">{message(feedback.messageKey)}</p>
        </InlineMessage>
      ) : null}

      {access.canCreate ? (
        <details className="document-register">
          <summary className="document-register__summary">
            <h2 className="document-register__title" id="document-register-title">
              {t('documents.register.title')}
            </h2>
          </summary>
          <DocumentRegisterForm
            access={access}
            key={registerFormKey}
            loadOptions={loadOptions}
            onChange={onRegisterValuesChange}
            onSubmit={onRegister}
            sessionKey={sessionKey}
            values={registerValues}
            writesLocked={writesLocked}
          />
        </details>
      ) : null}

      <div className="documents__workspace">
        <section aria-labelledby="document-library-title" className="documents__list-pane">
          <h2 className="documents__pane-title" id="document-library-title">
            {t('documents.list.title')}
          </h2>
          <DocumentFilters
            access={access}
            busy={list.status === 'loading'}
            loadOptions={(kind) => loadOptions(kind, 'filter')}
            onChange={onFiltersChange}
            onReset={onResetFilters}
            onSubmit={onApplyFilters}
            sessionKey={sessionKey}
            showReset={filtered || hasActiveDocumentFilters(filters)}
            values={filters}
          />
          <DocumentList
            filtered={filtered}
            list={list}
            onPage={onPage}
            onReset={onResetFilters}
            onRetry={onRetryList}
            onSelect={onSelect}
            selectedId={selectedId}
          />
        </section>

        <div className="documents__detail-pane">
          {!selectedId ? (
            <p className="document-muted">{t('documents.detail.selectPrompt')}</p>
          ) : detail.status === 'loading' || detail.status === 'idle' ? (
            <p role="status">{t('documents.states.loadingDetail')}</p>
          ) : detail.status === 'missing' ? (
            <InlineMessage announce title={t('documents.states.detailErrorTitle')} tone="warning">
              <p className="document-message__text">{t('documents.states.detailMissing')}</p>
            </InlineMessage>
          ) : detail.status === 'error' ? (
            <InlineMessage announce title={t('documents.states.detailErrorTitle')} tone="danger">
              <p className="document-message__text">{t('documents.states.detailError')}</p>
              <Button onClick={onRetryDetail} size="compact" variant="secondary">
                {t('common.actions.retry')}
              </Button>
            </InlineMessage>
          ) : metadata ? (
            <DocumentDetail
              access={access}
              document={detail.document}
              downloading={downloading}
              focusToken={focusToken}
              metadata={metadata}
              onAddVersion={onAddVersion}
              onArchive={onArchive}
              onDownload={onDownload}
              onMetadataChange={onMetadataChange}
              onSaveMetadata={onSaveMetadata}
              onVersionFileChange={onVersionFileChange}
              versionFile={versionFile}
              versionInputKey={versionInputKey}
              writesLocked={writesLocked}
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}
