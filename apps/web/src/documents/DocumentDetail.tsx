import type { DocumentDetail as DocumentDetailRecord, DocumentVersion } from '@hire-me/contracts';
import { useEffect, useRef, type FormEvent } from 'react';

import { useI18n } from '../i18n/index.js';
import { Button, InlineMessage, Select, StatusBadge, TextField } from '../ui/index.js';
import type { DocumentAccess } from './document-access.js';
import {
  DOCUMENT_VISIBILITIES,
  documentSourceTone,
  documentStatusTone,
  friendlyFormat,
} from './document-labels.js';
import type { MetadataValues } from './document-state.js';
import { ContextBreadcrumb } from './DocumentContextTrail.js';
import { DocumentVersionHistory, useFileSize } from './DocumentVersionHistory.js';

export function DocumentDetail({
  access,
  document,
  downloading,
  focusToken,
  metadata,
  onAddVersion,
  onArchive,
  onDownload,
  onMetadataChange,
  onSaveMetadata,
  onVersionFileChange,
  versionFile,
  versionInputKey,
  writesLocked,
}: {
  access: DocumentAccess;
  document: DocumentDetailRecord;
  downloading: string | null;
  /** Changes when the operator selects a document, so focus follows the choice. */
  focusToken: number;
  metadata: MetadataValues;
  onAddVersion: (event: FormEvent<HTMLFormElement>) => void;
  onArchive: () => void;
  onDownload: (version: DocumentVersion) => void;
  onMetadataChange: (values: MetadataValues) => void;
  onSaveMetadata: (event: FormEvent<HTMLFormElement>) => void;
  onVersionFileChange: (file: File | null) => void;
  versionFile: File | null;
  /** Changes after a successful upload so the file input clears. */
  versionInputKey: number;
  writesLocked: boolean;
}) {
  const { formatDateTime, t } = useI18n();
  const fileSize = useFileSize();
  const heading = useRef<HTMLHeadingElement>(null);
  const archived = document.status === 'ARCHIVED' || document.archivedAt !== null;
  const current = document.versions.find((version) => version.id === document.currentVersionId);

  useEffect(() => {
    if (focusToken > 0) {
      heading.current?.focus();
    }
  }, [focusToken]);

  return (
    <article aria-labelledby="document-detail-title" className="document-detail">
      <header className="document-detail__heading">
        <h2
          className="document-detail__title"
          id="document-detail-title"
          ref={heading}
          tabIndex={-1}
        >
          {document.title}
        </h2>
        <div className="document-detail__badges">
          <StatusBadge tone={documentStatusTone(document.status)}>
            {t(`documents.status.${document.status}`)}
          </StatusBadge>
          {current ? (
            <StatusBadge tone={documentSourceTone(current.source)}>
              {t(`documents.source.${current.source}`)}
            </StatusBadge>
          ) : null}
        </div>
      </header>

      {archived ? (
        <InlineMessage title={t('documents.status.ARCHIVED')} tone="warning">
          {t('documents.detail.archivedNotice')}
        </InlineMessage>
      ) : null}

      <section aria-labelledby="document-related-title" className="document-section">
        <h3 className="document-section__title" id="document-related-title">
          {t('documents.detail.relatedTo')}
        </h3>
        <ContextBreadcrumb display={document.contextDisplay} />
      </section>

      <section aria-labelledby="document-summary-title" className="document-section">
        <h3 className="document-section__title" id="document-summary-title">
          {t('documents.detail.summaryTitle')}
        </h3>
        <dl className="document-facts">
          <div>
            <dt>{t('documents.detail.type')}</dt>
            <dd>{t(`documents.types.${document.documentType}`)}</dd>
          </div>
          <div>
            <dt>{t('documents.detail.status')}</dt>
            <dd>{t(`documents.status.${document.status}`)}</dd>
          </div>
          <div>
            <dt>{t('documents.detail.visibility')}</dt>
            <dd>{t(`documents.visibility.${document.visibility}`)}</dd>
          </div>
          <div>
            <dt>{t('documents.detail.source')}</dt>
            <dd>
              {current ? t(`documents.source.${current.source}`) : t('documents.list.noFile')}
            </dd>
          </div>
          {document.generatedSourceType ? (
            <div>
              <dt>{t('documents.detail.generatedFrom')}</dt>
              <dd>{t(`documents.generatedSource.${document.generatedSourceType}`)}</dd>
            </div>
          ) : null}
          <div>
            <dt>{t('documents.detail.owner')}</dt>
            <dd>{document.ownerDisplayName ?? t('documents.notRecorded')}</dd>
          </div>
          <div>
            <dt>{t('documents.detail.createdBy')}</dt>
            <dd>{document.createdByDisplayName ?? t('documents.notRecorded')}</dd>
          </div>
          <div>
            <dt>{t('documents.detail.created')}</dt>
            <dd>
              <time dateTime={document.createdAt}>{formatDateTime(document.createdAt)}</time>
            </dd>
          </div>
          <div>
            <dt>{t('documents.detail.updated')}</dt>
            <dd>
              <time dateTime={document.updatedAt}>{formatDateTime(document.updatedAt)}</time>
            </dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="document-file-title" className="document-section">
        <h3 className="document-section__title" id="document-file-title">
          {t('documents.detail.fileTitle')}
        </h3>
        {current ? (
          <dl className="document-facts">
            <div>
              <dt>{t('documents.detail.currentVersion')}</dt>
              <dd className="u-tabular">
                {t('documents.versions.versionNumber', { number: current.versionNumber })}
              </dd>
            </div>
            <div>
              <dt>{t('documents.detail.filename')}</dt>
              <dd className="document-facts__wrap">{current.filename}</dd>
            </div>
            <div>
              <dt>{t('documents.detail.mimeType')}</dt>
              <dd>{friendlyFormat(current.mimeType)}</dd>
            </div>
            <div>
              <dt>{t('documents.detail.size')}</dt>
              <dd className="u-tabular">{fileSize(current.sizeBytes)}</dd>
            </div>
          </dl>
        ) : (
          <p>{t('documents.detail.noVersion')}</p>
        )}
        {current && access.canDownload ? (
          <Button
            disabled={downloading !== null}
            onClick={() => onDownload(current)}
            size="compact"
            type="button"
            variant="primary"
          >
            {t('documents.versions.downloadFor', { number: current.versionNumber })}
          </Button>
        ) : null}
      </section>

      <DocumentVersionHistory
        canDownload={access.canDownload}
        currentVersionId={document.currentVersionId}
        downloading={downloading}
        onDownload={onDownload}
        versions={document.versions}
      />

      {access.canAddVersion && !archived ? (
        <form
          aria-labelledby="document-add-version-title"
          className="document-section document-form"
          onSubmit={onAddVersion}
        >
          <h3 className="document-section__title" id="document-add-version-title">
            {t('documents.addVersion.title')}
          </h3>
          <TextField
            accept=".pdf,.doc,.docx,.xlsx,.png,.jpg,.jpeg,.txt"
            hint={t('documents.addVersion.fileHint')}
            key={versionInputKey}
            label={t('documents.addVersion.file')}
            name="versionFile"
            onChange={(event) => onVersionFileChange(event.currentTarget.files?.[0] ?? null)}
            required
            type="file"
          />
          <div className="document-form__actions">
            <Button disabled={writesLocked || !versionFile} type="submit" variant="primary">
              {t('documents.addVersion.submit')}
            </Button>
          </div>
        </form>
      ) : null}

      {access.canUpdate && !archived ? (
        <form
          aria-labelledby="document-metadata-title"
          className="document-section document-form"
          onSubmit={onSaveMetadata}
        >
          <h3 className="document-section__title" id="document-metadata-title">
            {t('documents.metadata.title')}
          </h3>
          <TextField
            label={t('documents.metadata.titleField')}
            maxLength={180}
            name="title"
            onChange={(event) =>
              onMetadataChange({ ...metadata, title: event.currentTarget.value })
            }
            required
            value={metadata.title}
          />
          <Select
            hint={t('documents.metadata.visibilityHint')}
            label={t('documents.metadata.visibility')}
            name="visibility"
            onChange={(event) =>
              onMetadataChange({
                ...metadata,
                visibility:
                  DOCUMENT_VISIBILITIES.find(
                    (visibility) => visibility === event.currentTarget.value,
                  ) ?? metadata.visibility,
              })
            }
            value={metadata.visibility}
          >
            {DOCUMENT_VISIBILITIES.map((visibility) => (
              <option key={visibility} value={visibility}>
                {t(`documents.visibility.${visibility}`)}
              </option>
            ))}
          </Select>
          <div className="document-form__actions">
            <Button
              disabled={writesLocked || metadata.title.trim().length === 0}
              type="submit"
              variant="primary"
            >
              {t('documents.metadata.save')}
            </Button>
          </div>
        </form>
      ) : null}

      {access.canArchive && !archived ? (
        <div className="document-section document-form__actions">
          <Button disabled={writesLocked} onClick={onArchive} type="button" variant="danger">
            {t('documents.archive.action')}
          </Button>
        </div>
      ) : null}
    </article>
  );
}
