import type { DocumentContextDisplay } from '@hire-me/contracts';

import { useI18n } from '../i18n/index.js';

type TrailKind = 'client' | 'mission' | 'candidate' | 'missionCandidate' | 'interview';

export type TrailStep = { key: string; kind: TrailKind; label: string };

type Translate = ReturnType<typeof useI18n>['t'];
type FormatDate = ReturnType<typeof useI18n>['formatDate'];

/**
 * The linked records, parent first, as the API labelled them. Only labels the
 * server supplied are used, so a hidden record never appears, and no step ever
 * carries an ID as text.
 */
export function contextTrail(
  display: DocumentContextDisplay,
  t: Translate,
  formatDate: FormatDate,
): TrailStep[] {
  const steps: TrailStep[] = [];
  if (display.client) {
    steps.push({ key: `client-${display.client.id}`, kind: 'client', label: display.client.label });
  }
  const missionLabel =
    display.mission?.label ??
    display.missionCandidate?.missionLabel ??
    display.interview?.missionLabel ??
    null;
  if (missionLabel) {
    steps.push({ key: `mission-${missionLabel}`, kind: 'mission', label: missionLabel });
  }
  if (display.candidate) {
    steps.push({
      key: `candidate-${display.candidate.id}`,
      kind: 'candidate',
      label: display.candidate.label,
    });
  }
  const processLabel =
    display.missionCandidate?.candidateLabel ?? display.interview?.candidateLabel ?? null;
  if (processLabel && processLabel !== display.candidate?.label) {
    steps.push({ key: `process-${processLabel}`, kind: 'missionCandidate', label: processLabel });
  }
  if (display.interview) {
    steps.push({
      key: `interview-${display.interview.id}`,
      kind: 'interview',
      label: t('documents.context.interviewLabel', {
        date: formatDate(display.interview.scheduledStartAt),
        type: t(`documents.interviewType.${display.interview.interviewType}`),
      }),
    });
  }
  return steps;
}

function kindLabel(t: Translate, kind: TrailKind): string {
  switch (kind) {
    case 'client':
      return t('documents.context.client');
    case 'mission':
      return t('documents.context.mission');
    case 'candidate':
      return t('documents.context.candidate');
    case 'missionCandidate':
      return t('documents.context.missionCandidate');
    case 'interview':
      return t('documents.context.interview');
  }
}

/** Compact one-line trail for the library. */
export function ContextSummary({ display }: { display: DocumentContextDisplay }) {
  const { formatDate, t } = useI18n();
  const steps = contextTrail(display, t, formatDate);
  if (steps.length === 0) {
    return <span className="document-muted">{t('documents.unlinked')}</span>;
  }
  return (
    <span className="document-context-summary">
      {steps.map((step, index) => (
        <span className="document-context-summary__step" key={step.key}>
          {index > 0 ? (
            <span aria-hidden="true" className="document-trail__separator">
              ›
            </span>
          ) : null}
          <span className="sr-only">{`${kindLabel(t, step.kind)} `}</span>
          {step.label}
        </span>
      ))}
    </span>
  );
}

/** Breadcrumb for the detail view; wraps instead of overflowing. */
export function ContextBreadcrumb({ display }: { display: DocumentContextDisplay }) {
  const { formatDate, t } = useI18n();
  const steps = contextTrail(display, t, formatDate);
  if (steps.length === 0) {
    return <p className="document-muted">{t('documents.unlinked')}</p>;
  }
  return (
    <nav aria-label={t('documents.detail.relatedTo')} className="document-trail">
      <ol className="document-trail__list">
        {steps.map((step) => (
          <li className="document-trail__item" key={step.key}>
            <span className="document-trail__kind">{kindLabel(t, step.kind)}</span>
            <span className="document-trail__label">{step.label}</span>
          </li>
        ))}
      </ol>
    </nav>
  );
}
