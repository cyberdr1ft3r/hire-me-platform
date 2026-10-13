import type { ShellDomainId } from './shell-navigation.js';

export type ShellIconName = ShellDomainId | 'panel' | 'menu' | 'close' | 'account';
const paths: Record<ShellIconName, string> = {
  overview: 'M3 10 12 3l9 7M5 9v12h14V9M9 21v-7h6v7',
  recruitment:
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M17 4a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-4',
  commercial: 'M4 7h16v14H4zM8 7V3h8v4M4 12h16M10 12v3h4v-3',
  operations: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  communication: 'M3 4h18v13H8l-5 4V4M7 8h10M7 12h7',
  administration: 'M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7l-9-4M8 12l3 3 5-6',
  panel: 'M3 4h18v16H3zM9 4v16M14 9l3 3-3 3',
  menu: 'M4 6h16M4 12h16M4 18h16',
  close: 'm6 6 12 12M6 18 18 6',
  account: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M4 21v-2a5 5 0 0 1 5-5h6a5 5 0 0 1 5 5v2',
};

/** Dependency-free shell icons; names live on the controls, never on decorative SVGs. */
export function ShellIcon({ name }: { name: ShellIconName }) {
  return (
    <svg
      aria-hidden="true"
      className="app-shell__icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
    >
      <path d={paths[name]} />
    </svg>
  );
}
