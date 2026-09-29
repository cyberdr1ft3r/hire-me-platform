import type { DocumentVersion } from '@hire-me/contracts';

import { useI18n } from '../i18n/index.js';
import { Button, StatusBadge } from '../ui/index.js';
import { documentSourceTone, fileSizeParts, friendlyFormat } from './document-labels.js';

/** File size in the active locale, with localized decimal units. */
export function useFileSize(): (sizeBytes: number) => string {
  const { formatNumber, t } = useI18n();
  return (sizeBytes) => {
    const { unit, value } = fileSizeParts(sizeBytes);
    return t(`documents.size.${unit}`, { value: formatNumber(value) });
  };
}

/**
 * Immutable version history, newest first. Every row is its own download:
 * a historical version is never replaced, only superseded as "current".
 */
export function DocumentVersionHistory({
  canDownload,
  currentVersionId,
  downloading,
  onDownload,
  versions,
}: {
  canDownload: boolean;
  currentVersionId: string | null;
  downloading: string | null;
  onDownload: (version: DocumentVersion) => void;
  versions: DocumentVersion[];
}) {
  const { formatDateTime, t } = useI18n();
  const fileSize = useFileSize();
  const ordered = [...versions].sort((left, right) => right.versionNumber - left.versionNumber);

  return (
    <section aria-labelledby="document-versions-title" className="document-section">
      <h3 className="document-section__title" id="document-versions-title">
        {t('documents.versions.title')}
      </h3>
      <p className="document-muted">{t('documents.versions.immutableNote')}</p>
      {ordered.length === 0 ? (
        <p>{t('documents.versions.empty')}</p>
      ) : (
        <ol aria-label={t('documents.versions.region')} className="document-versions">
          {ordered.map((version) => {
            const current = version.id === currentVersionId;
            const archived = version.status === 'ARCHIVED' || version.archivedAt !== null;
            return (
              <li
                className={`document-version${current ? ' document-version--current' : ''}`}
                key={version.id}
              >
                <div className="document-version__heading">
                  <span className="document-version__number">
                    {t('documents.versions.versionNumber', { number: version.versionNumber })}
                  </span>
                  {current ? (
                    <StatusBadge tone="success">{t('documents.versions.current')}</StatusBadge>
                  ) : null}
                  <StatusBadge tone={documentSourceTone(version.source)}>
                    {t(`documents.source.${version.source}`)}
                  </StatusBadge>
                  {archived ? (
                    <StatusBadge tone="neutral">{t('documents.status.ARCHIVED')}</StatusBadge>
                  ) : null}
                </div>
                <p className="document-version__file">{version.filename}</p>
                <p className="document-version__meta">
                  <span>{friendlyFormat(version.mimeType)}</span>
                  <span aria-hidden="true"> · </span>
                  <span className="u-tabular">{fileSize(version.sizeBytes)}</span>
                  <span aria-hidden="true"> · </span>
                  <time dateTime={version.createdAt}>{formatDateTime(version.createdAt)}</time>
                </p>
                <p className="document-version__meta">
                  {version.createdByDisplayName
                    ? t('documents.versions.addedBy', { name: version.createdByDisplayName })
                    : t('documents.versions.unknownCreator')}
                </p>
                {version.templateId ? (
                  <p className="document-version__meta">
                    {t('documents.versions.template', {
                      revision: version.templateVersion ?? '—',
                      template: version.templateId,
                    })}
                    {version.generationLanguage ? (
                      <>
                        <span aria-hidden="true"> · </span>
                        {t('documents.versions.language', {
                          language: version.generationLanguage.toUpperCase(),
                        })}
                      </>
                    ) : null}
                  </p>
                ) : null}
                {canDownload && !archived ? (
                  <Button
                    aria-label={t('documents.versions.downloadFor', {
                      number: version.versionNumber,
                    })}
                    disabled={downloading !== null}
                    onClick={() => onDownload(version)}
                    size="compact"
                    type="button"
                    variant="secondary"
                  >
                    {t('documents.versions.download')}
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
