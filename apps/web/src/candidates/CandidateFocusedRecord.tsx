import type { DocumentSummary, TaskSummary } from '@hire-me/contracts';
import { useMemo, useRef } from 'react';

import { useI18n } from '../i18n/index.js';
import { Button } from '../ui/index.js';
import type { CandidateRelatedPage } from './candidate-state.js';
import { CandidateDetailView, type CandidateDetailViewProps } from './CandidateDetailView.js';
import type { CandidateRecordTab } from './CandidateRecordTabs.js';
import { CandidateRelatedDocuments, CandidateRelatedTasks } from './CandidateRelated.js';
import { useRecordLeaveGuard } from './use-record-leave-guard.js';

/**
 * Loaders for the record's related sections, bound by the container to the open
 * candidate and the current session. `null` means the actor lacks the owning
 * module's view permission, so the section does not exist at all.
 */
export interface CandidateRelatedLoaders {
  documents: (() => Promise<CandidateRelatedPage<DocumentSummary>>) | null;
  tasks: (() => Promise<CandidateRelatedPage<TaskSummary>>) | null;
}

/**
 * The focused candidate record: the full-width workspace for detailed recruitment
 * work. It is the existing record (identity, lifecycle actions, profile, structured
 * records, restricted information) with a way back to the directory and the related
 * sections the platform already supports.
 *
 * Applications are not offered: the API has no read of one candidate's mission
 * processes across missions, and inventing one is out of scope (Issue #204).
 */
export function CandidateFocusedRecord({
  detailProps,
  loaders,
  onBack,
  onNavigatePath,
}: {
  detailProps: Omit<CandidateDetailViewProps, 'sections'>;
  loaders: CandidateRelatedLoaders;
  onBack: () => void;
  onNavigatePath?: (path: string) => void;
}) {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  useRecordLeaveGuard(
    containerRef,
    t('candidate.record.discardPrompt'),
    detailProps.pending !== null,
  );

  const candidateId =
    detailProps.detail.status === 'ready' ? detailProps.detail.candidate.id : null;
  const sections = useMemo<CandidateRecordTab[]>(() => {
    const tabs: CandidateRecordTab[] = [];
    if (loaders.documents) {
      const load = loaders.documents;
      tabs.push({
        id: 'documents',
        label: t('candidate.record.sections.documents'),
        render: () => <CandidateRelatedDocuments load={load} onNavigatePath={onNavigatePath} />,
      });
    }
    if (loaders.tasks) {
      const load = loaders.tasks;
      tabs.push({
        id: 'tasks',
        label: t('candidate.record.sections.tasks'),
        render: () => <CandidateRelatedTasks load={load} onNavigatePath={onNavigatePath} />,
      });
    }
    return tabs;
    // Rebuilt per candidate; the loaders are bound to that candidate.
  }, [candidateId, loaders.documents, loaders.tasks, onNavigatePath, t]);

  return (
    <div className="candidate-record" ref={containerRef}>
      <nav aria-label={t('candidate.record.navigation')} className="candidate-record__nav">
        <Button className="candidate-record__back" onClick={onBack} size="compact" variant="quiet">
          <span aria-hidden="true">←</span> {t('candidate.record.back')}
        </Button>
      </nav>
      <CandidateDetailView {...detailProps} sections={sections} />
    </div>
  );
}
