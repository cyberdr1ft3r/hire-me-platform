import { useId, useRef, useState, type ReactNode } from 'react';

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

/** A visible, non-color marker for a record archived with its candidate. */
export function ArchivedRecordMarker() {
  const { t } = useI18n();
  return <span className="candidate-rows__archived">{t('candidate.records.archived')}</span>;
}
