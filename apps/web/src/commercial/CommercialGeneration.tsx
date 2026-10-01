import type {
  DocumentVersion,
  GeneratedVersionProvenance,
  GenerationLanguage,
  GenerationOutputFamily,
} from '@hire-me/contracts';
import { useState } from 'react';

import { Button, Select } from '../ui/index.js';
import type { CommercialAccess } from './commercial-access.js';
import { generationEligible, type CommercialDetail } from './commercial-kinds.js';
import { useCommercialFormat } from './commercial-labels.js';

export type GenerationActions = {
  /** Resolves to null when generation failed or its result belongs to a stale context. */
  onGenerate: (
    outputFamily: GenerationOutputFamily,
    language: GenerationLanguage,
  ) => Promise<GeneratedVersionProvenance | null>;
  onLoadVersions: (documentId: string) => Promise<DocumentVersion[] | null>;
  onDownload: (documentId: string, version: { id: string; filename: string }) => void;
};

/**
 * Generate the record's document through the protected generation endpoint
 * and download versions through the protected document endpoint. Rendered only
 * with `documents:generate`, commercial data access, and the record type's view
 * permission; the API re-checks all three and the source record's scope.
 */
export function CommercialGeneration({
  access,
  actions,
  detail,
  writesLocked,
}: {
  access: CommercialAccess;
  actions: GenerationActions;
  detail: CommercialDetail;
  writesLocked: boolean;
}) {
  const { formatDateTime, locale, t } = useCommercialFormat();
  const [language, setLanguage] = useState<GenerationLanguage>(locale === 'fr' ? 'fr' : 'en');
  const [generated, setGenerated] = useState<GeneratedVersionProvenance | null>(null);
  const [versions, setVersions] = useState<DocumentVersion[] | null>(null);

  if (!access.generate[detail.kind]) return null;
  const eligible = generationEligible(detail.kind, detail.record.status);

  function generate(outputFamily: GenerationOutputFamily): void {
    void actions.onGenerate(outputFamily, language).then((result) => {
      if (!result) return;
      setGenerated(result);
      setVersions(null);
      if (access.viewGeneratedVersions) {
        void actions.onLoadVersions(result.documentId).then((history) => {
          if (history) setVersions(history);
        });
      }
    });
  }

  return (
    <section aria-labelledby="commercial-generation-title" className="commercial-section">
      <h3 className="commercial-section__title" id="commercial-generation-title">
        {t('commercial.generation.title')}
      </h3>
      {eligible ? (
        <div className="commercial-form commercial-form--inline">
          <Select
            label={t('commercial.generation.language')}
            onChange={(event) => setLanguage(event.currentTarget.value === 'fr' ? 'fr' : 'en')}
            value={language}
          >
            <option value="en">{t('commercial.generation.languages.en')}</option>
            <option value="fr">{t('commercial.generation.languages.fr')}</option>
          </Select>
          <div
            aria-label={t('commercial.generation.actions')}
            className="commercial-actions"
            role="group"
          >
            <Button
              disabled={writesLocked}
              onClick={() => generate('PDF')}
              size="compact"
              variant="secondary"
            >
              {generated?.outputFamily === 'PDF'
                ? t('commercial.generation.regeneratePdf')
                : t('commercial.generation.pdf')}
            </Button>
            <Button
              disabled={writesLocked}
              onClick={() => generate('WORD')}
              size="compact"
              variant="secondary"
            >
              {generated?.outputFamily === 'WORD'
                ? t('commercial.generation.regenerateWord')
                : t('commercial.generation.word')}
            </Button>
          </div>
        </div>
      ) : (
        <p className="commercial-muted">{t(`commercial.generation.notEligible.${detail.kind}`)}</p>
      )}

      {generated ? (
        <div className="commercial-generated" role="status">
          <p>
            {t('commercial.generation.generated', {
              format: t(`commercial.generation.formats.${generated.outputFamily}`),
              language: t(`commercial.generation.languages.${generated.language}`),
              version: generated.versionNumber,
            })}
          </p>
          {access.downloadGeneratedVersions ? (
            <Button
              onClick={() =>
                actions.onDownload(generated.documentId, {
                  filename: generated.filename,
                  id: generated.versionId,
                })
              }
              size="compact"
              variant="secondary"
            >
              {t('commercial.generation.download')}
            </Button>
          ) : null}
        </div>
      ) : null}

      {versions && versions.length > 0 ? (
        <ul aria-label={t('commercial.generation.versions')} className="commercial-versions">
          {versions.map((version) => (
            <li key={version.id}>
              <span>
                {t('commercial.generation.versionLine', {
                  language: version.generationLanguage
                    ? t(
                        `commercial.generation.languages.${version.generationLanguage === 'fr' ? 'fr' : 'en'}`,
                      )
                    : '—',
                  version: version.versionNumber,
                })}
                <span className="commercial-muted">
                  {' · '}
                  <time dateTime={version.createdAt}>{formatDateTime(version.createdAt)}</time>
                </span>
                {version.templateVersion !== null || version.createdByDisplayName ? (
                  <span className="commercial-muted commercial-break">
                    {' · '}
                    {version.createdByDisplayName
                      ? t('commercial.generation.provenanceBy', {
                          name: version.createdByDisplayName,
                          template: version.templateVersion ?? '—',
                        })
                      : t('commercial.generation.provenance', {
                          template: version.templateVersion ?? '—',
                        })}
                  </span>
                ) : null}
              </span>
              {access.downloadGeneratedVersions ? (
                <Button
                  onClick={() =>
                    actions.onDownload(version.documentId, {
                      filename: version.filename,
                      id: version.id,
                    })
                  }
                  size="compact"
                  variant="quiet"
                >
                  {t('commercial.generation.downloadVersion', { version: version.versionNumber })}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
