import type { ReactNode } from 'react';

import { useI18n } from '../i18n/index.js';
import { Button, InlineMessage, Skeleton } from '../ui/index.js';
import type { SectionState } from './mission-state.js';

/**
 * A table that scrolls inside its own region on narrow screens, so the page
 * itself never scrolls sideways. The region is focusable, which lets keyboard
 * users scroll it, and it is named after the table it holds.
 */
export function ScrollTable({ children, label }: { children: ReactNode; label: string }) {
  const { t } = useI18n();
  return (
    <div
      aria-label={t('missions.table.scrollRegion', { label })}
      className="u-table-scroll mission-table-scroll"
      role="region"
      tabIndex={0}
    >
      {children}
    </div>
  );
}

/**
 * Loading and failure states shared by every mission section. Ready content is
 * rendered by the caller; idle renders nothing.
 */
export function SectionStatus<T>({
  children,
  onRetry,
  section,
}: {
  children: (data: T) => ReactNode;
  onRetry?: () => void;
  section: SectionState<T>;
}) {
  const { t } = useI18n();
  if (section.status === 'idle') {
    return null;
  }
  if (section.status === 'loading') {
    return <Skeleton label={t('missions.states.loadingSection')} />;
  }
  if (section.status === 'error') {
    return (
      <InlineMessage title={t('missions.states.sectionErrorTitle')} tone="warning">
        <p className="mission-message__text">{t('missions.states.sectionError')}</p>
        {onRetry ? (
          <Button onClick={onRetry} size="compact" variant="secondary">
            {t('common.actions.retry')}
          </Button>
        ) : null}
      </InlineMessage>
    );
  }
  return <>{children(section.data)}</>;
}

/** A labelled value in a mission summary; empty values show a neutral placeholder. */
export function SummaryItem({ children, label }: { children: ReactNode; label: string }) {
  const { t } = useI18n();
  const empty = children === null || children === undefined || children === '';
  return (
    <div className="mission-summary__item">
      <dt>{label}</dt>
      <dd>
        {empty ? <span className="mission-muted">{t('missions.notRecorded')}</span> : children}
      </dd>
    </div>
  );
}
