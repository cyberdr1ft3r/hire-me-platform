import { useId, type HTMLAttributes, type ReactNode } from 'react';

import { EmptyState, Skeleton } from './Feedback.js';
import { InlineMessage } from './InlineMessage.js';
import { PageHeader, type PageHeaderProps } from './PageHeader.js';

export type PageLayout = 'flow' | 'fill';
export type PageKind = 'directory' | 'record';

export interface PageShellProps extends HTMLAttributes<HTMLElement> {
  as?: 'article' | 'div' | 'section';
  children: ReactNode;
  layout?: PageLayout;
}

/**
 * The page-level sizing and spacing boundary inside AppShell.
 *
 * It deliberately does not own overflow: flow pages keep shell/document
 * scrolling, while fill pages pass `min-height: 0` to WorkspaceSurface.
 */
export function PageShell({
  as: Element = 'div',
  children,
  className,
  layout = 'flow',
  ...props
}: PageShellProps) {
  return (
    <Element
      {...props}
      className={['ui-page-shell', className].filter(Boolean).join(' ')}
      data-page-layout={layout}
    >
      {children}
    </Element>
  );
}

export interface ContextualActionsProps {
  /** The single preferred action for this page or record. */
  primary?: ReactNode;
  /** Visible supporting actions, ordered before the primary action. */
  secondary?: ReactNode;
  /** A caller-owned accessible menu or disclosure for infrequent actions. */
  overflow?: ReactNode;
}

export function ContextualActions({ overflow, primary, secondary }: ContextualActionsProps) {
  if (!primary && !secondary && !overflow) return null;

  return (
    <div className="ui-contextual-actions">
      {secondary ? <div className="ui-contextual-actions__secondary">{secondary}</div> : null}
      {overflow}
      {primary}
    </div>
  );
}

export interface FilterToolbarProps extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
  actions?: ReactNode;
  filters?: ReactNode;
  search?: ReactNode;
  status?: ReactNode;
}

/** Responsive placement only; query state, forms, labels, and requests stay with the workspace. */
export function FilterToolbar({
  actions,
  className,
  filters,
  search,
  status,
  ...props
}: FilterToolbarProps) {
  return (
    <section {...props} className={['ui-filter-toolbar', className].filter(Boolean).join(' ')}>
      {search ? <div className="ui-filter-toolbar__search">{search}</div> : null}
      {filters ? <div className="ui-filter-toolbar__filters">{filters}</div> : null}
      {status ? <div className="ui-filter-toolbar__status">{status}</div> : null}
      {actions ? <div className="ui-filter-toolbar__actions">{actions}</div> : null}
    </section>
  );
}

export type PageStateKind = 'loading' | 'empty' | 'error' | 'permission-denied';

export interface PageStateProps {
  action?: ReactNode;
  children?: ReactNode;
  kind: PageStateKind;
  title: string;
}

export function PageState({ action, children, kind, title }: PageStateProps) {
  const titleId = useId();

  if (kind === 'loading') {
    return (
      <div aria-busy="true" className="ui-page-state" data-state={kind}>
        <Skeleton label={title} />
      </div>
    );
  }

  if (kind === 'empty') {
    return (
      <div className="ui-page-state" data-state={kind}>
        <EmptyState action={action} title={title}>
          {children}
        </EmptyState>
      </div>
    );
  }

  if (kind === 'error') {
    return (
      <div className="ui-page-state" data-state={kind}>
        <InlineMessage announce title={title} tone="danger">
          {children}
          {action}
        </InlineMessage>
      </div>
    );
  }

  return (
    <section
      aria-labelledby={titleId}
      className="ui-page-state ui-page-state--permission"
      data-state={kind}
      role="alert"
    >
      <div aria-hidden="true" className="ui-page-state__mark">
        !
      </div>
      <h1 id={titleId}>{title}</h1>
      {children ? <div className="ui-page-state__description">{children}</div> : null}
      {action}
    </section>
  );
}

interface ComposedPageProps
  extends Omit<PageShellProps, 'aria-labelledby' | 'children' | 'title'>, PageHeaderProps {
  children: ReactNode;
  notices?: ReactNode;
  toolbar?: ReactNode;
}

export type DirectoryPageProps = ComposedPageProps;
export type RecordPageProps = ComposedPageProps;

function ComposedPage({
  children,
  className,
  notices,
  toolbar,
  ...props
}: ComposedPageProps & { kind: PageKind }) {
  const { kind, ...pageAndHeaderProps } = props;
  const {
    as,
    layout,
    compact,
    description,
    eyebrow,
    metadata,
    primaryAction,
    secondaryActions,
    title,
    titleId: suppliedTitleId,
    ...shellProps
  } = pageAndHeaderProps;
  const generatedTitleId = useId();
  const titleId = suppliedTitleId ?? generatedTitleId;

  return (
    <PageShell
      {...shellProps}
      aria-labelledby={titleId}
      as={as ?? 'section'}
      className={className}
      data-page-kind={kind}
      layout={layout}
    >
      <PageHeader
        compact={compact}
        description={description}
        eyebrow={eyebrow}
        metadata={metadata}
        primaryAction={primaryAction}
        secondaryActions={secondaryActions}
        title={title}
        titleId={titleId}
      />
      {notices ? <div className="ui-page-shell__notices">{notices}</div> : null}
      {toolbar}
      <div className="ui-page-shell__content">{children}</div>
    </PageShell>
  );
}

export function DirectoryPage(props: DirectoryPageProps) {
  return <ComposedPage {...props} kind="directory" />;
}

export function RecordPage(props: RecordPageProps) {
  return <ComposedPage {...props} kind="record" />;
}
