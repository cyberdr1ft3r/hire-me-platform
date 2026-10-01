import type {
  DocumentVersion,
  GeneratedVersionProvenance,
  GenerationLanguage,
  GenerationOutputFamily,
  TrainingCertificateStatus as CertificateStatus,
  TrainingEnrollmentSummary,
} from '@hire-me/contracts';
import { useState, type FormEvent } from 'react';

import { useI18n } from '../i18n/index.js';
import { Button, Select, StatusBadge } from '../ui/index.js';
import type { TrainingAccess } from './training-access.js';
import { certificateStatusTone, enrollmentIsTerminal } from './training-labels.js';

type Applicability = Exclude<CertificateStatus, 'ISSUED'>;

export type CertificateActions = {
  onApplicability: (
    enrollment: TrainingEnrollmentSummary,
    status: Applicability,
  ) => Promise<boolean>;
  /** Resolves to null when generation failed or its result belongs to a stale context. */
  onGenerate: (
    enrollment: TrainingEnrollmentSummary,
    outputFamily: GenerationOutputFamily,
    language: GenerationLanguage,
  ) => Promise<GeneratedVersionProvenance | null>;
  onLoadVersions: (documentId: string) => Promise<DocumentVersion[] | null>;
  onDownload: (documentId: string, version: { id: string; filename: string }) => void;
};

function readinessKey(
  enrollment: TrainingEnrollmentSummary,
): `training.certificate.readiness.${'issued' | 'notApplicable' | 'pending' | 'ready'}` {
  if (enrollment.certificateStatus === 'ISSUED') return 'training.certificate.readiness.issued';
  if (enrollment.certificateStatus === 'NOT_APPLICABLE') {
    return 'training.certificate.readiness.notApplicable';
  }
  return enrollment.certificateReady
    ? 'training.certificate.readiness.ready'
    : 'training.certificate.readiness.pending';
}

export function TrainingCertificateStatus({
  access,
  actions,
  canOperate,
  enrollment,
  writesLocked,
}: {
  access: TrainingAccess;
  actions: CertificateActions;
  canOperate: boolean;
  enrollment: TrainingEnrollmentSummary;
  writesLocked: boolean;
}) {
  const { formatDateTime, locale, t } = useI18n();
  const [applicability, setApplicability] = useState<Applicability>(
    enrollment.certificateStatus === 'NOT_APPLICABLE' ? 'NOT_APPLICABLE' : 'PENDING',
  );
  const [language, setLanguage] = useState<GenerationLanguage>(locale === 'fr' ? 'fr' : 'en');
  const [generated, setGenerated] = useState<GeneratedVersionProvenance | null>(null);
  const [versions, setVersions] = useState<DocumentVersion[] | null>(null);

  const canChangeApplicability =
    access.manageEnrollments &&
    canOperate &&
    enrollment.certificateStatus !== 'ISSUED' &&
    !enrollmentIsTerminal(enrollment);
  const canGenerate = access.generateCertificate && enrollment.certificateReady;

  function submitApplicability(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (applicability === enrollment.certificateStatus) return;
    void actions.onApplicability(enrollment, applicability);
  }

  function generate(outputFamily: GenerationOutputFamily): void {
    void actions.onGenerate(enrollment, outputFamily, language).then((result) => {
      if (!result) return;
      setGenerated(result);
      setVersions(null);
      if (access.viewCertificateVersions) {
        void actions.onLoadVersions(result.documentId).then((history) => {
          if (history) setVersions(history);
        });
      }
    });
  }

  return (
    <section aria-labelledby="training-certificate-title" className="training-certificate">
      <h5 className="training-record__title" id="training-certificate-title">
        {t('training.certificate.title')}
      </h5>
      <div className="training-certificate__status">
        <StatusBadge tone={certificateStatusTone(enrollment.certificateStatus)}>
          {t(`training.status.certificate.${enrollment.certificateStatus}`)}
        </StatusBadge>
        <p className="training-muted">{t(readinessKey(enrollment))}</p>
      </div>

      {canChangeApplicability ? (
        <form
          aria-label={t('training.certificate.applicabilityTitle')}
          className="training-form training-form--inline"
          noValidate
          onSubmit={submitApplicability}
        >
          <Select
            hint={t('training.certificate.applicabilityHint')}
            label={t('training.certificate.applicability')}
            onChange={(event) => setApplicability(event.currentTarget.value as Applicability)}
            value={applicability}
          >
            <option value="PENDING">{t('training.status.certificate.PENDING')}</option>
            <option value="NOT_APPLICABLE">
              {t('training.status.certificate.NOT_APPLICABLE')}
            </option>
          </Select>
          <div className="training-form__actions">
            <Button
              disabled={writesLocked || applicability === enrollment.certificateStatus}
              size="compact"
              type="submit"
              variant="secondary"
            >
              {t('training.certificate.saveApplicability')}
            </Button>
          </div>
        </form>
      ) : null}

      {canGenerate ? (
        <div className="training-form training-form--inline">
          <Select
            label={t('training.certificate.language')}
            onChange={(event) => setLanguage(event.currentTarget.value === 'fr' ? 'fr' : 'en')}
            value={language}
          >
            <option value="en">{t('training.certificate.languages.en')}</option>
            <option value="fr">{t('training.certificate.languages.fr')}</option>
          </Select>
          <div
            aria-label={t('training.certificate.generateActions')}
            className="training-form__actions"
            role="group"
          >
            <Button disabled={writesLocked} onClick={() => generate('PDF')} size="compact">
              {t('training.certificate.generatePdf')}
            </Button>
            <Button
              disabled={writesLocked}
              onClick={() => generate('WORD')}
              size="compact"
              variant="secondary"
            >
              {t('training.certificate.generateWord')}
            </Button>
          </div>
        </div>
      ) : null}

      {generated ? (
        <div className="training-certificate__generated" role="status">
          <p>
            {t('training.certificate.generated', {
              format: t(`training.certificate.formats.${generated.outputFamily}`),
              language: t(`training.certificate.languages.${generated.language}`),
              version: generated.versionNumber,
            })}
          </p>
          {access.downloadCertificate ? (
            <Button
              onClick={() =>
                actions.onDownload(generated.documentId, {
                  id: generated.versionId,
                  filename: generated.filename,
                })
              }
              size="compact"
              variant="secondary"
            >
              {t('training.certificate.download')}
            </Button>
          ) : null}
        </div>
      ) : null}

      {versions && versions.length > 0 ? (
        <ul
          aria-label={t('training.certificate.versions')}
          className="training-certificate__versions"
        >
          {versions.map((version) => (
            <li key={version.id}>
              <span>
                {t('training.certificate.versionLine', {
                  language: version.generationLanguage ?? '—',
                  version: version.versionNumber,
                })}
                <span className="training-muted">
                  {' · '}
                  <time dateTime={version.createdAt}>{formatDateTime(version.createdAt)}</time>
                </span>
              </span>
              {access.downloadCertificate ? (
                <Button
                  onClick={() =>
                    actions.onDownload(version.documentId, {
                      id: version.id,
                      filename: version.filename,
                    })
                  }
                  size="compact"
                  variant="quiet"
                >
                  {t('training.certificate.downloadVersion', { version: version.versionNumber })}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
