import { useId, type ReactNode } from 'react';

export function Skeleton({ label = 'Loading content' }: { label?: string }) {
  return (
    <div className="ui-skeleton-wrap" role="status">
      <span className="sr-only">{label}</span>
      <span aria-hidden="true" className="ui-skeleton ui-skeleton--title" />
      <span aria-hidden="true" className="ui-skeleton" />
      <span aria-hidden="true" className="ui-skeleton ui-skeleton--short" />
    </div>
  );
}

export function EmptyState({
  action,
  children,
  title,
}: {
  action?: ReactNode;
  children: ReactNode;
  title: string;
}) {
  const titleId = useId();

  return (
    <section className="ui-empty" aria-labelledby={titleId}>
      <div aria-hidden="true" className="ui-empty__mark">
        —
      </div>
      <h3 id={titleId}>{title}</h3>
      <p>{children}</p>
      {action}
    </section>
  );
}
