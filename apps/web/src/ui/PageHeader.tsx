import type { ReactNode } from 'react';

export interface PageHeaderProps {
  /** Tighter rhythm for fill-layout workspaces that need the viewport height. */
  compact?: boolean;
  description?: ReactNode;
  eyebrow?: ReactNode;
  metadata?: ReactNode;
  primaryAction?: ReactNode;
  secondaryActions?: ReactNode;
  title: ReactNode;
}

export function PageHeader({
  compact = false,
  description,
  eyebrow,
  metadata,
  primaryAction,
  secondaryActions,
  title,
}: PageHeaderProps) {
  return (
    <header className={compact ? 'ui-page-header ui-page-header--compact' : 'ui-page-header'}>
      <div className="ui-page-header__copy">
        {eyebrow ? <p className="ui-page-header__eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {description ? <p className="ui-page-header__description">{description}</p> : null}
        {metadata ? <div className="ui-page-header__metadata">{metadata}</div> : null}
      </div>
      {primaryAction || secondaryActions ? (
        <div className="ui-page-header__actions">
          {secondaryActions}
          {primaryAction}
        </div>
      ) : null}
    </header>
  );
}
