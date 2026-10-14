import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

import { Button } from '../ui/index.js';

export interface CandidateMenuAction {
  danger?: boolean;
  key: string;
  label: string;
  onSelect: () => void;
}

/**
 * A menu button for the record's less frequent actions (lifecycle changes, archive).
 *
 * The actions themselves are unchanged: choosing one runs exactly the handler the
 * button used to run, with its own confirmation. Only permitted actions are passed
 * in, so an unauthorized action never appears here either.
 *
 * Keyboard (WAI-ARIA menu button): Enter, Space or ArrowDown open the menu on the
 * first item, ArrowUp on the last; arrows, Home and End move; Escape closes and
 * returns focus to the button; Tab or a click outside closes it.
 */
export function CandidateActionMenu({
  actions,
  disabled,
  label,
  loading = false,
  loadingLabel,
}: {
  actions: readonly CandidateMenuAction[];
  disabled: boolean;
  label: string;
  /** One of this menu's own actions is in flight; the button shows progress. */
  loading?: boolean;
  loadingLabel?: string;
}) {
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [open, setOpen] = useState(false);
  const [initialIndex, setInitialIndex] = useState(0);

  // A write that starts while the menu is open closes it: nothing can be chosen then.
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  useEffect(() => {
    if (!open) return undefined;
    itemRefs.current[initialIndex]?.focus();
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [open, initialIndex]);

  function openAt(index: number): void {
    setInitialIndex(index);
    setOpen(true);
  }

  function close(returnFocus: boolean): void {
    setOpen(false);
    if (returnFocus)
      rootRef.current?.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')?.focus();
  }

  function handleButtonKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      openAt(0);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      openAt(actions.length - 1);
    }
  }

  function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const items = itemRefs.current.filter(Boolean) as HTMLButtonElement[];
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const last = items.length - 1;
    const move = (next: number) => {
      event.preventDefault();
      items[next]?.focus();
    };
    switch (event.key) {
      case 'ArrowDown':
        move(index >= last ? 0 : index + 1);
        break;
      case 'ArrowUp':
        move(index <= 0 ? last : index - 1);
        break;
      case 'Home':
        move(0);
        break;
      case 'End':
        move(last);
        break;
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        close(true);
        break;
      case 'Tab':
        close(false);
        break;
    }
  }

  function choose(action: CandidateMenuAction): void {
    close(true);
    action.onSelect();
  }

  return (
    <div className="candidate-menu" ref={rootRef}>
      <Button
        aria-controls={open ? menuId : undefined}
        aria-expanded={open}
        aria-haspopup="menu"
        disabled={disabled}
        loading={loading}
        loadingLabel={loadingLabel}
        onClick={() => (open ? close(false) : openAt(0))}
        onKeyDown={handleButtonKeyDown}
        variant="secondary"
      >
        {label}
        <span aria-hidden="true" className="candidate-menu__chevron">
          ▾
        </span>
      </Button>
      {open ? (
        <div
          aria-label={label}
          className="candidate-menu__list"
          id={menuId}
          onKeyDown={handleMenuKeyDown}
          role="menu"
        >
          {actions.map((action, index) => (
            <button
              className="candidate-menu__item"
              data-danger={action.danger ? 'true' : undefined}
              key={action.key}
              onClick={() => choose(action)}
              ref={(element) => {
                itemRefs.current[index] = element;
              }}
              role="menuitem"
              tabIndex={-1}
              type="button"
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
