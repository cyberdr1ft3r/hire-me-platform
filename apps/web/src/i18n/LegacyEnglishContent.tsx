import type { ReactNode } from 'react';

/**
 * Marks a region whose interface has not been translated yet as English.
 *
 * The document language follows the active locale, so a French session sets
 * `<html lang="fr">`. Several surfaces are deliberately still English until
 * their own redesign, and announcing English copy as French gives assistive
 * technology the wrong pronunciation and the wrong voice. This boundary states
 * the real language of that content instead.
 *
 * It is presentation-only: `display: contents` means the wrapper generates no
 * box, so nothing about layout, spacing, or data flow changes. It carries no
 * behaviour, no locale logic, and no effect on the stored preference.
 *
 * Each boundary disappears when the surface inside it becomes bilingual.
 */
export function LegacyEnglishContent({ children }: { children: ReactNode }) {
  return (
    <div className="legacy-english-content" lang="en">
      {children}
    </div>
  );
}
