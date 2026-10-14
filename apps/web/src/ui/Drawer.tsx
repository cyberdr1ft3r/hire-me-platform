import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { useI18n } from '../i18n/index.js';
import { blockNavigation } from '../navigation/navigation-guard.js';
import { Button } from './Button.js';

const FOCUSABLE =
  'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]';

export interface DrawerProps {
  children: ReactNode;
  /**
   * True while the drawer's own write is in flight: Escape, the close button and the
   * scrim do nothing, so the drawer cannot appear cancelled while the request goes on.
   */
  closeDisabled?: boolean;
  /** True while the form holds input that closing would discard. */
  dirty?: boolean;
  /** Short purpose line under the title. */
  description?: ReactNode;
  /**
   * Pinned below the scrolling body: the drawer's actions. A function receives the
   * guarded close, so a Cancel button asks before discarding unsaved input too.
   */
  footer: ReactNode | ((requestClose: () => void) => ReactNode);
  /**
   * Where focus lands on open. `field` (default) is the first control in the body;
   * `title` suits forms whose first control opens a popup on focus, such as a
   * type-ahead picker, so the drawer announces itself without covering the form.
   */
  initialFocus?: 'field' | 'title';
  onClose: () => void;
  /**
   * `side` (default) is the right-side drawer. `bottom` is a sheet anchored to the
   * bottom of the viewport for narrow screens: the same modal behaviour, a height
   * capped below the full viewport so the page it belongs to stays visible above it.
   */
  placement?: 'bottom' | 'side';
  title: ReactNode;
}

/**
 * A right-side modal drawer (Workspace Surface v1.0): fixed header, scrolling
 * body, pinned footer. It renders into `document.body`, makes the application
 * behind it inert, keeps Tab inside, closes on Escape, the close button or the
 * scrim, and returns focus to the control that opened it. Closing with unsaved
 * input asks first, inside the drawer, instead of losing the draft silently; so do
 * browser Back/Forward (through the router's navigation guard) and reload or tab
 * close (the browser's own prompt).
 * Mount it only while open; unmounting is closing.
 */
export function Drawer({
  children,
  closeDisabled = false,
  description,
  dirty = false,
  footer,
  initialFocus = 'field',
  onClose,
  placement = 'side',
  title,
}: DrawerProps) {
  const { t } = useI18n();
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLElement>(null);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  // A held Back/Forward, completed only if the user discards.
  const pendingLeave = useRef<(() => void) | null>(null);
  // Where focus was when the question appeared; Keep editing returns it there.
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    const first =
      (initialFocus === 'title' ? panel?.querySelector<HTMLElement>('.ui-drawer__title') : null) ??
      panel?.querySelector('.ui-drawer__body')?.querySelector<HTMLElement>(FOCUSABLE) ??
      panel?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    // The application behind the drawer is not reachable while it is open.
    const app = document.getElementById('root');
    const previousInert = app?.inert ?? false;
    if (app && panel && !app.contains(panel)) app.inert = true;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      if (app) app.inert = previousInert;
      document.body.style.overflow = previousOverflow;
      if (opener?.isConnected && opener !== document.body) opener.focus();
    };
    // Opening is mounting: focus and inertness are applied once per open drawer.
  }, []);

  useEffect(() => {
    if (confirmingDiscard)
      panelRef.current?.querySelector<HTMLElement>('[data-drawer-keep-editing]')?.focus();
  }, [confirmingDiscard]);

  useEffect(() => {
    if (!dirty) return;
    const release = blockNavigation({
      confirmLeave: (proceed) => {
        pendingLeave.current = proceed;
        askToDiscard();
      },
    });
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Older engines show their prompt only when returnValue is set.
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => {
      release();
      window.removeEventListener('beforeunload', warnBeforeUnload);
    };
  }, [dirty]);

  function askToDiscard(): void {
    // Never remember the question's own buttons: a repeated Back arrives while it shows.
    const active = document.activeElement;
    if (
      active instanceof HTMLElement &&
      panelRef.current?.contains(active) &&
      !active.closest('.ui-drawer__discard')
    )
      returnFocus.current = active;
    setConfirmingDiscard(true);
  }

  function keepEditing(): void {
    pendingLeave.current = null;
    setConfirmingDiscard(false);
    const target = returnFocus.current;
    returnFocus.current = null;
    // The question replaced the footer; put focus back where the user was editing.
    requestAnimationFrame(() => {
      if (target?.isConnected) target.focus();
      else
        panelRef.current
          ?.querySelector('.ui-drawer__body')
          ?.querySelector<HTMLElement>(FOCUSABLE)
          ?.focus();
    });
  }

  function discard(): void {
    const leave = pendingLeave.current;
    pendingLeave.current = null;
    onClose();
    leave?.();
  }

  function requestClose(): void {
    if (closeDisabled) return;
    if (dirty && !confirmingDiscard) {
      askToDiscard();
      return;
    }
    onClose();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>): void {
    if (event.key === 'Escape') {
      // A nested popup (combobox, native select) handles its own Escape first.
      if (event.defaultPrevented) return;
      event.preventDefault();
      if (confirmingDiscard) {
        keepEditing();
        return;
      }
      requestClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (
      event.shiftKey &&
      (document.activeElement === first ||
        !focusable.includes(document.activeElement as HTMLElement))
    ) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return createPortal(
    <div className="ui-drawer" data-placement={placement}>
      <div aria-hidden="true" className="ui-drawer__scrim" onClick={requestClose} />
      <section
        aria-describedby={description ? descriptionId : undefined}
        aria-labelledby={titleId}
        aria-modal="true"
        className="ui-drawer__panel"
        onKeyDown={handleKeyDown}
        ref={panelRef}
        role="dialog"
      >
        <header className="ui-drawer__header">
          <div className="ui-drawer__heading">
            <h2 className="ui-drawer__title" id={titleId} tabIndex={-1}>
              {title}
            </h2>
            {description ? (
              <p className="ui-drawer__description" id={descriptionId}>
                {description}
              </p>
            ) : null}
          </div>
          <Button
            aria-label={t('common.actions.close')}
            className="ui-drawer__close"
            disabled={closeDisabled}
            onClick={requestClose}
            size="compact"
            variant="quiet"
          >
            <span aria-hidden="true">✕</span>
          </Button>
        </header>
        <div className="ui-drawer__body">{children}</div>
        <footer className="ui-drawer__footer">
          {confirmingDiscard ? (
            <div aria-labelledby={`${titleId}-discard`} className="ui-drawer__discard" role="group">
              <p className="ui-drawer__discard-text" id={`${titleId}-discard`} role="status">
                {t('ui.drawer.discardPrompt')}
              </p>
              <div className="ui-drawer__actions">
                <Button data-drawer-keep-editing="" onClick={keepEditing} variant="secondary">
                  {t('ui.drawer.keepEditing')}
                </Button>
                <Button onClick={discard} variant="danger">
                  {t('ui.drawer.discard')}
                </Button>
              </div>
            </div>
          ) : (
            <div className="ui-drawer__actions">
              {typeof footer === 'function' ? footer(requestClose) : footer}
            </div>
          )}
        </footer>
      </section>
    </div>,
    document.body,
  );
}

export interface CreationDrawerProps {
  children: ReactNode;
  description?: ReactNode;
  dirty?: boolean;
  /** Failure to show above the form, e.g. a rejected submission. */
  error?: ReactNode;
  /** The `id` of the form in `children`; the footer submits it. */
  formId: string;
  initialFocus?: DrawerProps['initialFocus'];
  onClose: () => void;
  submitDisabled?: boolean;
  submitLabel: ReactNode;
  /** True while the request is in flight: the submit shows progress and cannot repeat. */
  submitting?: boolean;
  title: ReactNode;
}

/** A Drawer whose footer is the standard Cancel / Create pair for one form. */
export function CreationDrawer({
  children,
  description,
  dirty,
  error,
  formId,
  initialFocus,
  onClose,
  submitDisabled = false,
  submitLabel,
  submitting = false,
  title,
}: CreationDrawerProps) {
  const { t } = useI18n();
  return (
    <Drawer
      closeDisabled={submitting}
      description={description}
      dirty={dirty && !submitting}
      footer={(requestClose) => (
        <>
          <Button disabled={submitting} onClick={requestClose} variant="secondary">
            {t('common.actions.cancel')}
          </Button>
          <Button
            disabled={submitDisabled}
            form={formId}
            loading={submitting}
            loadingLabel={t('common.status.working')}
            type="submit"
          >
            {submitLabel}
          </Button>
        </>
      )}
      initialFocus={initialFocus}
      onClose={onClose}
      title={title}
    >
      {error}
      {children}
    </Drawer>
  );
}
