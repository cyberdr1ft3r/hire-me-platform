import type { HTMLAttributes, ReactNode, Ref } from 'react';

/**
 * Workspace Surface v1.0: one continuous surface for list + record workspaces.
 *
 * The surface is the only bordered region. Panes inside it are separated by a
 * single one-pixel divider; toolbars and sections are separated by rules and
 * whitespace, never by nested cards. When the shell runs a route in `fill`
 * layout, the surface takes the remaining viewport height and each pane body
 * owns its own vertical scrolling (see `ui/workspace.css`).
 */

/**
 * `standard` and `wide` pair a narrow list with a wide record. `preview` is the
 * reverse: the directory keeps the width and a compact preview pane sits beside it.
 */
export type WorkspaceSplit = 'preview' | 'standard' | 'wide';
export type WorkspaceView = 'list' | 'detail';

/** Container widths at which the panes sit side by side; mirrored in workspace.css. */
export const WORKSPACE_SPLIT_MIN_REM: Record<WorkspaceSplit, number> = {
  preview: 44,
  standard: 48,
  wide: 60,
};

export interface WorkspaceSurfaceProps {
  children: ReactNode;
  className?: string;
  ref?: Ref<HTMLDivElement>;
  /** `wide` keeps panes stacked until the record has room for its own columns. */
  split?: WorkspaceSplit;
  /**
   * One-pane-at-a-time mode for narrow containers: only the named pane renders
   * while stacked. Omit it to stack both panes in reading order.
   */
  view?: WorkspaceView;
}

export function WorkspaceSurface({
  children,
  className,
  ref,
  split = 'standard',
  view,
}: WorkspaceSurfaceProps) {
  return (
    <div
      className={['ui-workspace', className].filter(Boolean).join(' ')}
      data-split={split}
      ref={ref}
    >
      <div className="ui-workspace__layout" data-view={view}>
        {children}
      </div>
    </div>
  );
}

export interface WorkspacePaneProps extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
  as?: 'div' | 'section';
  bodyRef?: Ref<HTMLDivElement>;
  children: ReactNode;
  kind: WorkspaceView;
  /** Pinned above the scrolling body: heading, search, filters or pane actions. */
  toolbar?: ReactNode;
}

export function WorkspacePane({
  as: Element = 'section',
  bodyRef,
  children,
  className,
  kind,
  toolbar,
  ...props
}: WorkspacePaneProps) {
  return (
    <Element
      {...props}
      className={['ui-workspace__pane', className].filter(Boolean).join(' ')}
      data-pane={kind}
    >
      {toolbar}
      <div className="ui-workspace__pane-body" ref={bodyRef}>
        {children}
      </div>
    </Element>
  );
}

export interface WorkspaceToolbarProps {
  actions?: ReactNode;
  children?: ReactNode;
  /** The pane heading element, so callers keep their own ids, refs and focus targets. */
  heading: ReactNode;
}

export function WorkspaceToolbar({ actions, children, heading }: WorkspaceToolbarProps) {
  return (
    <div className="ui-workspace__toolbar">
      <div className="ui-workspace__toolbar-row">
        <div className="ui-workspace__toolbar-heading">{heading}</div>
        {actions ? <div className="ui-workspace__toolbar-actions">{actions}</div> : null}
      </div>
      {children ? <div className="ui-workspace__toolbar-controls">{children}</div> : null}
    </div>
  );
}

export interface WorkspaceSectionProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  actions?: ReactNode;
  children: ReactNode;
  heading?: ReactNode;
}

/** A structural section inside a pane, separated from its neighbours by one rule. */
export function WorkspaceSection({
  actions,
  children,
  className,
  heading,
  ...props
}: WorkspaceSectionProps) {
  return (
    <section {...props} className={['ui-workspace__section', className].filter(Boolean).join(' ')}>
      {heading || actions ? (
        <div className="ui-workspace__section-header">
          {heading}
          {actions ? <div className="ui-workspace__toolbar-actions">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
