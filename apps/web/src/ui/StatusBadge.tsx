import type { ReactNode } from 'react';

export type StatusTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

export function StatusBadge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: StatusTone;
}) {
  return (
    <span className={`ui-status ui-status--${tone}`} data-status={tone}>
      <span aria-hidden="true" className="ui-status__dot" />
      {children}
    </span>
  );
}
