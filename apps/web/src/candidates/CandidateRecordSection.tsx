import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

import { useI18n } from '../i18n/index.js';
import { Button } from '../ui/index.js';

/**
 * One structured profile section: a heading, the recorded rows, and an add
 * form behind a disclosure.
 *
 * `canView` mirrors `candidate_profile:view`. Without it the API returns empty
 * arrays, so the section says the records are unavailable instead of claiming
 * that none are recorded. `canAdd` mirrors `candidate_profile:manage` on a
 * candidate that is not archived; without it the add control does not exist.
 */
export function CandidateRecordSection({
  addLabel,
  busy,
  canAdd,
  canView,
  children,
  count,
  emptyText,
  renderForm,
  title,
}: {
  addLabel: string;
  busy: boolean;
  canAdd: boolean;
  canView: boolean;
  children: ReactNode;
  count: number;
  emptyText: string;
  renderForm: (close: () => void) => ReactNode;
  title: string;
}) {
  const { formatNumber, t } = useI18n();
  const headingId = useId();
  const formId = useId();
  const sectionRef = useRef<HTMLElement>(null);
  const [adding, setAdding] = useState(false);

  function close(): void {
    setAdding(false);
    // Focus returns to the control that opened the form.
    window.setTimeout(() => {
      sectionRef.current?.querySelector<HTMLButtonElement>('[data-record-toggle]')?.focus();
    }, 0);
  }

  return (
    <section
      aria-labelledby={headingId}
      className="candidate-section candidate-records"
      ref={sectionRef}
    >
      <div className="candidate-section__head">
        <h3 id={headingId}>
          {title}
          {canView && count > 0 ? (
            <span className="candidate-section__count u-tabular"> {formatNumber(count)}</span>
          ) : null}
        </h3>
        {canAdd && !adding ? (
          <Button
            aria-controls={formId}
            aria-expanded={false}
            data-record-toggle=""
            disabled={busy}
            onClick={() => setAdding(true)}
            size="compact"
            variant="secondary"
          >
            {addLabel}
          </Button>
        ) : null}
      </div>
      {canView ? (
        count > 0 ? (
          children
        ) : (
          <p className="candidate-section__empty">{emptyText}</p>
        )
      ) : (
        <p className="candidate-section__empty">{t('candidate.records.unavailable')}</p>
      )}
      {canAdd && adding ? <div id={formId}>{renderForm(close)}</div> : null}
    </section>
  );
}

/**
 * One structured record, maintainable in place.
 *
 * An active record offers Edit and Archive to an actor holding
 * `candidate_profile:manage` on a candidate that is not archived; the server
 * checks that permission again on every request. Edit replaces the row with a
 * form pre-filled from the record. Archive keeps the row as history, marked
 * archived, and it can no longer be changed: there is no deletion and no
 * restore. The buttons name the record ("Edit Python") rather than its ID.
 */
export function CandidateRecordRow({
  archived,
  busy,
  canManage,
  children,
  className,
  label,
  onArchive,
  pending,
  renderEdit,
}: {
  archived: boolean;
  /** The workspace's single write lock. */
  busy: boolean;
  canManage: boolean;
  children: ReactNode;
  className: string;
  /** The record as the operator reads it, for the action names. */
  label: string;
  /** Resolves true once the record is archived. */
  onArchive: () => Promise<boolean>;
  /** True while this record's own edit or archival is the write in flight. */
  pending: boolean;
  renderEdit: (close: () => void) => ReactNode;
}) {
  const { t } = useI18n();
  const rowRef = useRef<HTMLLIElement>(null);
  const [editing, setEditing] = useState(false);
  const restoreEditFocus = useRef(false);
  const actionable = canManage && !archived;

  function closeEditor(): void {
    restoreEditFocus.current = true;
    setEditing(false);
  }

  // Focus returns to Edit after the form closes, once the button is enabled again.
  useEffect(() => {
    if (!restoreEditFocus.current || editing || busy) {
      return;
    }
    restoreEditFocus.current = false;
    rowRef.current?.querySelector<HTMLButtonElement>('[data-record-edit]')?.focus();
  }, [busy, editing]);

  async function archive(): Promise<void> {
    if (await onArchive()) {
      // The row stays as history without actions, so it takes focus itself.
      rowRef.current?.focus();
    }
  }

  return (
    <li className={className} ref={rowRef} tabIndex={-1}>
      {actionable && editing ? (
        renderEdit(closeEditor)
      ) : (
        <>
          {children}
          {actionable ? (
            <span className="candidate-rows__actions">
              <Button
                aria-label={t('candidate.records.editLabel', { record: label })}
                data-record-edit=""
                disabled={busy}
                onClick={() => setEditing(true)}
                size="compact"
                variant="quiet"
              >
                {t('candidate.records.edit')}
              </Button>
              <Button
                aria-label={t('candidate.records.archiveLabel', { record: label })}
                disabled={busy}
                loading={pending}
                loadingLabel={t('common.status.working')}
                onClick={() => void archive()}
                size="compact"
                variant="quiet"
              >
                {t('candidate.records.archive')}
              </Button>
            </span>
          ) : null}
        </>
      )}
    </li>
  );
}

/** A visible, non-color marker for an archived record. */
export function ArchivedRecordMarker() {
  const { t } = useI18n();
  return <span className="candidate-rows__archived">{t('candidate.records.archived')}</span>;
}
