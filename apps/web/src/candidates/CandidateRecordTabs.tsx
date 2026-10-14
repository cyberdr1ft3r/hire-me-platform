import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

import { useI18n } from '../i18n/index.js';

export interface CandidateRecordTab {
  id: string;
  label: string;
  /** Rendered the first time the tab is opened, then kept mounted. */
  render: () => ReactNode;
}

/**
 * Sections of the focused candidate record as an ARIA tab set.
 *
 * The profile (the existing record, with its forms) is always mounted and only
 * hidden while another tab is shown, so switching tabs never discards input. Other
 * sections mount the first time they are opened and then stay, so a section loads
 * its data once per record visit and never in the background before it is asked for.
 *
 * Keyboard: Left/Right move between tabs and activate them, Home/End jump to the
 * ends; Tab moves from the selected tab into its panel.
 */
export function CandidateRecordTabs({
  profile,
  sections,
}: {
  profile: ReactNode;
  sections: readonly CandidateRecordTab[];
}) {
  const { t } = useI18n();
  const baseId = useId();
  const tabs = [{ id: 'profile', label: t('candidate.record.sections.profile') }, ...sections];
  const [selected, setSelected] = useState('profile');
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set(['profile']));
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
    <div className="candidate-record-tabs">
      <div
        aria-label={t('candidate.record.sections.label')}
        className="candidate-record-tabs__list"
        role="tablist"
      >
        {tabs.map((tab) => (
          <button
            // A section that has not been opened has no panel to point at yet.
            aria-controls={opened.has(tab.id) ? `${baseId}-${tab.id}-panel` : undefined}
            aria-selected={tab.id === selected}
            className="candidate-record-tabs__tab"
            id={`${baseId}-${tab.id}-tab`}
            key={tab.id}
            onClick={() => select(tab.id)}
            onKeyDown={handleKeyDown}
            ref={(element) => {
              tabRefs.current[tab.id] = element;
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
        aria-labelledby={`${baseId}-profile-tab`}
        className="candidate-record-tabs__panel"
        hidden={selected !== 'profile'}
        id={`${baseId}-profile-panel`}
        role="tabpanel"
      >
        {profile}
      </div>
      {sections.map((section) =>
        opened.has(section.id) ? (
          <div
            aria-labelledby={`${baseId}-${section.id}-tab`}
            className="candidate-record-tabs__panel"
            hidden={selected !== section.id}
            id={`${baseId}-${section.id}-panel`}
            key={section.id}
            role="tabpanel"
            tabIndex={0}
          >
            {section.render()}
          </div>
        ) : null,
      )}
    </div>
  );
}
