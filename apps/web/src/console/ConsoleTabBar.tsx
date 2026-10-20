import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';

import type { InternalRoute } from '../navigation/internal-navigation.js';
import { useI18n, type PlainMessageKey } from '../i18n/index.js';
import { SOFT_TAB_LIMIT, type ConsoleState, type ConsoleTab, type TabId } from './console-state.js';

interface ConsoleTabBarProps {
  onActivate: (tab: ConsoleTab, keepFocus: boolean) => void;
  onClose: (id: TabId) => void;
  onCancelPending: () => void;
  onContinuePending: () => void;
  onReplacePending: () => void;
  canReplacePending: boolean;
  dirtyTabId: TabId | null;
  pendingLabel?: string;
  state: ConsoleState;
  visibleTabs: readonly ConsoleTab[];
}

const routeMessage: Record<InternalRoute, PlainMessageKey> = {
  home: 'navigation.destinations.overview',
  admin: 'navigation.destinations.administration',
  agenda: 'navigation.destinations.agenda',
  meetings: 'navigation.destinations.agenda',
  messages: 'navigation.destinations.messages',
  clients: 'navigation.destinations.clients',
  candidates: 'navigation.destinations.candidates',
  missions: 'navigation.destinations.missions',
  tasks: 'navigation.destinations.tasks',
  documents: 'navigation.destinations.documents',
  training: 'navigation.destinations.training',
  reporting: 'navigation.destinations.reporting',
  commercial: 'navigation.destinations.commercial',
  accounting: 'navigation.destinations.accounting',
};

function tabTitle(tab: ConsoleTab, t: (key: PlainMessageKey) => string): string {
  const moduleTitle = t(routeMessage[tab.route]);
  return tab.kind === 'workspace' ? moduleTitle : `${moduleTitle} · ${t('consoleTabs.record')}`;
}

export function ConsoleTabBar({
  onActivate,
  onClose,
  onCancelPending,
  onContinuePending,
  onReplacePending,
  canReplacePending,
  dirtyTabId,
  pendingLabel,
  state,
  visibleTabs,
}: ConsoleTabBarProps) {
  const { t } = useI18n();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [hasOverflow, setHasOverflow] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const desktopTriggerRef = useRef<HTMLButtonElement>(null);
  const mobileTriggerRef = useRef<HTMLButtonElement>(null);
  const isDialogOpen = dialogOpen || Boolean(pendingLabel);
  const tabRefs = useRef(new Map<TabId, HTMLButtonElement>());

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const measure = () => setHasOverflow(list.scrollWidth > list.clientWidth + 1);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, [visibleTabs.length]);

  useEffect(() => {
    if (!isDialogOpen) return;
    const dialog = dialogRef.current;
    dialog?.querySelector<HTMLElement>('[data-console-dialog-active="true"]')?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
      window.setTimeout(() => {
        const trigger =
          typeof window.matchMedia === 'function' &&
          window.matchMedia('(max-width: 56.1875rem)').matches
            ? mobileTriggerRef.current
            : desktopTriggerRef.current;
        trigger?.focus();
      }, 0);
    };
  }, [isDialogOpen]);

  useEffect(() => {
    if (isDialogOpen) {
      dialogRef.current?.querySelector<HTMLElement>('[data-console-dialog-active="true"]')?.focus();
      return;
    }
    const active = tabRefs.current.get(state.active);
    if (
      active &&
      document.activeElement !== active &&
      !listRef.current?.contains(document.activeElement)
    ) {
      active.focus();
    }
  }, [isDialogOpen, state.active]);

  function activate(tab: ConsoleTab, event: MouseEvent<HTMLButtonElement>): void {
    onActivate(tab, event.detail === 0);
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    const direction = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    let next = index;
    if (direction !== 0) next = (index + direction + visibleTabs.length) % visibleTabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = visibleTabs.length - 1;
    else if (event.key === 'Delete') {
      const tab = visibleTabs[index];
      if (tab && tab.id !== 'ws:home') {
        event.preventDefault();
        onClose(tab.id);
      }
      return;
    } else return;
    event.preventDefault();
    const nextTab = visibleTabs[next];
    if (nextTab) {
      tabRefs.current.get(nextTab.id)?.focus();
      onActivate(nextTab, true);
    }
  }

  function handleDialogKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      setDialogOpen(false);
      if (pendingLabel) onCancelPending();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), [href], [tabindex="0"]',
      ) ?? [],
    );
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  function selectFromDialog(tab: ConsoleTab, event: MouseEvent<HTMLButtonElement>): void {
    activate(tab, event);
    setDialogOpen(false);
  }

  return (
    <>
      <div className="console-tabs" data-testid="console-tabs">
        <div
          aria-label={t('consoleTabs.openTabs')}
          className="console-tabs__list"
          ref={listRef}
          role="tablist"
        >
          {visibleTabs.map((tab, index) => {
            const title = tabTitle(tab, t);
            const active = state.active === tab.id;
            const dirty = dirtyTabId === tab.id;
            return (
              <div className="console-tabs__item" key={tab.id}>
                <button
                  aria-selected={active}
                  className="console-tabs__tab"
                  data-console-active={active ? 'true' : undefined}
                  data-dirty={dirty ? 'true' : undefined}
                  aria-label={dirty ? `${title} · ${t('consoleTabs.unsavedChange')}` : title}
                  onClick={(event) => activate(tab, event)}
                  onKeyDown={(event) => handleTabKeyDown(event, index)}
                  ref={(element) => {
                    if (element) tabRefs.current.set(tab.id, element);
                    else tabRefs.current.delete(tab.id);
                  }}
                  role="tab"
                  tabIndex={active ? 0 : -1}
                  title={title}
                  type="button"
                >
                  <span>
                    {title}
                    {dirty ? (
                      <span aria-hidden="true" className="console-tabs__dirty-marker">
                        {' '}
                        •
                      </span>
                    ) : null}
                  </span>
                </button>
                {tab.id !== 'ws:home' ? (
                  <button
                    aria-label={t('consoleTabs.closeTab', { title })}
                    className="console-tabs__close"
                    onClick={() => onClose(tab.id)}
                    tabIndex={0}
                    type="button"
                  >
                    <span aria-hidden="true">×</span>
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
        {hasOverflow ? (
          <div className="console-tabs__scroll-controls">
            <button
              aria-label={t('consoleTabs.scrollLeft')}
              className="console-tabs__control"
              onClick={() => listRef.current?.scrollBy({ left: -240, behavior: 'smooth' })}
              type="button"
            >
              <span aria-hidden="true">‹</span>
            </button>
            <button
              aria-label={t('consoleTabs.scrollRight')}
              className="console-tabs__control"
              onClick={() => listRef.current?.scrollBy({ left: 240, behavior: 'smooth' })}
              type="button"
            >
              <span aria-hidden="true">›</span>
            </button>
          </div>
        ) : null}
        <button
          aria-haspopup="dialog"
          aria-expanded={isDialogOpen}
          className="console-tabs__more"
          onClick={() => setDialogOpen(true)}
          ref={desktopTriggerRef}
          type="button"
        >
          {t('consoleTabs.more')}
        </button>
        <button
          aria-haspopup="dialog"
          aria-expanded={isDialogOpen}
          className="console-tabs__mobile-trigger"
          onClick={() => setDialogOpen(true)}
          ref={mobileTriggerRef}
          type="button"
        >
          {t('consoleTabs.switcher')}
          <span aria-hidden="true">⌄</span>
        </button>
        <span aria-live="polite" className="sr-only">
          {visibleTabs.length >= SOFT_TAB_LIMIT
            ? t('consoleTabs.openCount', { count: visibleTabs.length })
            : ''}
        </span>
      </div>

      {isDialogOpen ? (
        <div className="console-tabs__scrim">
          <div
            aria-labelledby="console-tabs-dialog-title"
            aria-modal="true"
            className="console-tabs__dialog"
            onKeyDown={handleDialogKeyDown}
            ref={dialogRef}
            role="dialog"
            tabIndex={-1}
          >
            <header className="console-tabs__dialog-header">
              <h2 id="console-tabs-dialog-title">
                {pendingLabel ? t('consoleTabs.limitTitle') : t('consoleTabs.dialogTitle')}
              </h2>
              <button
                aria-label={t('consoleTabs.closeDialog')}
                className="console-tabs__control"
                onClick={() => {
                  setDialogOpen(false);
                  onCancelPending();
                }}
                type="button"
              >
                ×
              </button>
            </header>
            {pendingLabel ? (
              <p className="console-tabs__pending-copy">
                {t('consoleTabs.limitMessage', { title: pendingLabel })}
              </p>
            ) : null}
            <div className="console-tabs__dialog-tabs">
              {visibleTabs.map((tab) => {
                const title = tabTitle(tab, t);
                const active = state.active === tab.id;
                const dirty = dirtyTabId === tab.id;
                return (
                  <div className="console-tabs__dialog-item" key={tab.id}>
                    <button
                      aria-current={active ? 'true' : undefined}
                      className="console-tabs__dialog-tab"
                      data-console-dialog-active={active ? 'true' : undefined}
                      aria-label={dirty ? `${title} · ${t('consoleTabs.unsavedChange')}` : title}
                      onClick={(event) => selectFromDialog(tab, event)}
                      type="button"
                    >
                      <span>
                        {title}
                        {dirty ? (
                          <span aria-hidden="true" className="console-tabs__dirty-marker">
                            {' '}
                            •
                          </span>
                        ) : null}
                      </span>
                      {active ? <span>{t('consoleTabs.current')}</span> : null}
                    </button>
                    {tab.id !== 'ws:home' ? (
                      <button
                        aria-label={t('consoleTabs.closeTab', { title })}
                        className="console-tabs__close"
                        onClick={() => onClose(tab.id)}
                        type="button"
                      >
                        <span aria-hidden="true">×</span>
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
            {pendingLabel ? (
              <div className="console-tabs__limit-actions">
                <button
                  className="console-tabs__action"
                  disabled={!canReplacePending}
                  onClick={onReplacePending}
                  type="button"
                >
                  {t('consoleTabs.replaceLeastRecent')}
                </button>
                {visibleTabs.length < 10 ? (
                  <button
                    className="console-tabs__action"
                    onClick={onContinuePending}
                    type="button"
                  >
                    {t('consoleTabs.continueOpen')}
                  </button>
                ) : null}
                <button
                  className="console-tabs__action console-tabs__action--secondary"
                  onClick={onCancelPending}
                  type="button"
                >
                  {t('consoleTabs.keepCurrent')}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
