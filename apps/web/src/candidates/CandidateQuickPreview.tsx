import type { CandidateSummary } from '@hire-me/contracts';
import { useEffect, useId, useRef, type KeyboardEvent } from 'react';

import { useI18n } from '../i18n/index.js';
import { Button, Drawer, StatusBadge } from '../ui/index.js';
import { formatCandidateLocation } from './candidate-format.js';
import {
  candidateSourceLabel,
  candidateStatusLabelKey,
  candidateStatusTone,
} from './candidate-labels.js';

/**
 * A lightweight look at one directory row without leaving the directory.
 *
 * It is built only from the list row the directory already holds, so opening it
 * sends no request and starts no timer. Compensation and consent are never shown
 * here; they belong to the focused record and its own permissions. There are no
 * write actions: work on a candidate happens in the focused record.
 *
 * Two presentations of the same content:
 * - `pane` (wide workspaces): not modal, beside the directory, which stays usable.
 *   Focus moves to its heading on open; Escape or Close returns focus to the row.
 * - `sheet` (narrow workspaces): the shared modal drawer anchored to the bottom of
 *   the viewport, so it is visible at once without scrolling past the list. It
 *   traps Tab, closes on Escape, Close or the scrim, and returns focus to the row.
 *   The directory behind it keeps its page, filters and scroll position.
 */
export function CandidateQuickPreview({
  candidate,
  onClose,
  onOpenRecord,
  presentation = 'pane',
}: {
  candidate: CandidateSummary;
  onClose: () => void;
  onOpenRecord: () => void;
  presentation?: 'pane' | 'sheet';
}) {
  const { t } = useI18n();
  const headline = previewHeadline(candidate, t('candidate.profile.noHeadline'));

  if (presentation === 'sheet') {
    return (
      <Drawer
        description={headline}
        footer={(requestClose) => (
          <>
            <Button onClick={requestClose} variant="secondary">
              {t('common.actions.close')}
            </Button>
            <Button onClick={onOpenRecord}>{t('candidate.preview.openRecord')}</Button>
          </>
        )}
        initialFocus="title"
        onClose={onClose}
        placement="bottom"
        title={candidate.displayName}
      >
        <div
          className="candidate-preview candidate-preview--sheet"
          data-candidate-id={candidate.id}
        >
          <p className="candidate-preview__eyebrow">{t('candidate.preview.eyebrow')}</p>
          <StatusBadge tone={candidateStatusTone(candidate.status)}>
            {t(candidateStatusLabelKey(candidate.status))}
          </StatusBadge>
          <PreviewDetails candidate={candidate} />
        </div>
      </Drawer>
    );
  }

  return (
    <PreviewPane
      candidate={candidate}
      headline={headline}
      onClose={onClose}
      onOpenRecord={onOpenRecord}
    />
  );
}

function previewHeadline(candidate: CandidateSummary, fallback: string): string {
  const parts = [
    candidate.currentJobTitle?.trim(),
    formatCandidateLocation(candidate.city, candidate.country),
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : fallback;
}

function PreviewPane({
  candidate,
  headline,
  onClose,
  onOpenRecord,
}: {
  candidate: CandidateSummary;
  headline: string;
  onClose: () => void;
  onOpenRecord: () => void;
}) {
  const { t } = useI18n();
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);

  // A different row opened while the preview was showing moves focus to its heading too.
  useEffect(() => {
    headingRef.current?.focus();
  }, [candidate.id]);

  function handleKeyDown(event: KeyboardEvent<HTMLElement>): void {
    // A nested control that handles Escape itself (none today) keeps it.
    if (event.key === 'Escape' && !event.defaultPrevented) {
      event.preventDefault();
      onClose();
    }
  }

  return (
    <section
      aria-labelledby={headingId}
      className="candidate-preview"
      data-candidate-id={candidate.id}
      onKeyDown={handleKeyDown}
    >
      <header className="candidate-preview__header">
        <p className="candidate-preview__eyebrow">{t('candidate.preview.eyebrow')}</p>
        <Button
          aria-label={t('candidate.preview.close')}
          className="candidate-preview__close"
          onClick={onClose}
          size="compact"
          variant="quiet"
        >
          {t('common.actions.close')}
        </Button>
      </header>
      <div className="candidate-preview__identity">
        <h2 id={headingId} ref={headingRef} tabIndex={-1}>
          {candidate.displayName}
        </h2>
        <p className="candidate-preview__headline">{headline}</p>
        <StatusBadge tone={candidateStatusTone(candidate.status)}>
          {t(candidateStatusLabelKey(candidate.status))}
        </StatusBadge>
      </div>
      <PreviewDetails candidate={candidate} />
      <div className="candidate-preview__actions">
        <Button onClick={onOpenRecord}>{t('candidate.preview.openRecord')}</Button>
      </div>
    </section>
  );
}

/** The ordinary summary fields the row carries; never compensation or consent. */
function PreviewDetails({ candidate }: { candidate: CandidateSummary }) {
  const { formatDate, t } = useI18n();
  const facts: [string, string | null][] = [
    [t('candidate.fields.email'), candidate.email],
    [t('candidate.fields.phone'), candidate.phone],
    [
      t('candidate.fields.source'),
      candidate.source ? candidateSourceLabel(candidate.source, t) : null,
    ],
    [t('candidate.fields.availabilityNotice'), candidate.availabilityNotice],
    [t('candidate.profile.updatedLabel'), formatDate(candidate.updatedAt)],
  ];

  return (
    <>
      <dl className="candidate-facts candidate-preview__facts">
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd data-recorded={value ? undefined : 'false'}>
              {value || t('candidate.profile.notRecorded')}
            </dd>
          </div>
        ))}
      </dl>
      {candidate.professionalSummary?.trim() ? (
        <div className="candidate-preview__summary">
          <h3>{t('candidate.fields.professionalSummary')}</h3>
          <p>{candidate.professionalSummary}</p>
        </div>
      ) : null}
    </>
  );
}
