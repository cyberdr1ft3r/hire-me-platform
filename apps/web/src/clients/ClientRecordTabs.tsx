import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

import { useI18n } from '../i18n/index.js';

export interface ClientRecordTab {
  id: string;
  label: string;
  render: () => ReactNode;
}

export function ClientRecordTabs({
  overview,
  sections,
}: {
  overview: ReactNode;
  sections: readonly ClientRecordTab[];
}) {
  const { t } = useI18n();
  const baseId = useId();
  const tabs = [{ id: 'overview', label: t('clients.record.sections.overview') }, ...sections];
  const [selected, setSelected] = useState('overview');
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set(['overview']));
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  function select(id: string, focus = false): void {
    setSelected(id);
    setOpened((current) => (current.has(id) ? current : new Set([...current, id])));
    if (focus) tabRefs.current[id]?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
    const index = tabs.findIndex((tab) => tab.id === selected);
    const last = tabs.length - 1;
    const next =
      event.key === 'ArrowRight'
        ? index === last
          ? 0
          : index + 1
        : event.key === 'ArrowLeft'
          ? index === 0
            ? last
            : index - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    const target = tabs[next];
    if (target) select(target.id, true);
  }

  return (
    <div className="client-record-tabs">
      <div
        aria-label={t('clients.record.sections.label')}
        className="client-record-tabs__list"
        role="tablist"
      >
        {tabs.map((tab) => (
          <button
            aria-controls={opened.has(tab.id) ? `${baseId}-${tab.id}-panel` : undefined}
            aria-selected={tab.id === selected}
            className="client-record-tabs__tab"
            id={`${baseId}-${tab.id}-tab`}
            key={tab.id}
            onClick={() => select(tab.id)}
            onKeyDown={handleKeyDown}
            ref={(node) => {
              tabRefs.current[tab.id] = node;
            }}
            role="tab"
            tabIndex={tab.id === selected ? 0 : -1}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div
        aria-labelledby={`${baseId}-overview-tab`}
        className="client-record-tabs__panel"
        hidden={selected !== 'overview'}
        id={`${baseId}-overview-panel`}
        role="tabpanel"
      >
        {overview}
      </div>
      {sections.map((section) =>
        opened.has(section.id) ? (
          <div
            aria-labelledby={`${baseId}-${section.id}-tab`}
            className="client-record-tabs__panel"
            hidden={selected !== section.id}
            id={`${baseId}-${section.id}-panel`}
            key={section.id}
            role="tabpanel"
          >
            {section.render()}
          </div>
        ) : null,
      )}
    </div>
  );
}
