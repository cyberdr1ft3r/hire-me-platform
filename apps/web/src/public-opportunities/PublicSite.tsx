import type { ReactNode } from 'react';

import { useI18n } from '../i18n/index.js';
import { LanguageSelect } from '../ui/shell/LanguageSelect.js';

/**
 * The restrained public frame around the opportunity pages.
 *
 * It is deliberately not the internal AppShell: no navigation, no session, no
 * API health. It carries the HireMe mark, the shared language control, and the
 * page content in the `public-spacious` density. Links are ordinary anchors, so
 * the browser owns history, Back, and deep links.
 */
export function PublicSite({
  children,
  showRolesLink = true,
}: {
  children: ReactNode;
  /** The footer link back to the list is omitted on the list itself. */
  showRolesLink?: boolean;
}) {
  const { t } = useI18n();

  return (
    <div className="public-site" data-density="public-spacious">
      <a className="public-site__skip-link" href="#public-main">
        {t('publicOpportunity.site.skipToMain')}
      </a>
      <header className="public-site__header">
        <div className="public-site__bar">
          <a className="public-site__brand" href="/opportunities">
            <span aria-hidden="true" className="public-site__brand-mark">
              H
            </span>
            <span className="public-site__brand-text">
              <strong>HireMe</strong> <span>{t('publicOpportunity.site.brandSubtitle')}</span>
            </span>
          </a>
          <LanguageSelect classPrefix="public-site__language" />
        </div>
      </header>
      <main className="public-site__main" id="public-main" tabIndex={-1}>
        <div className="public-site__content">{children}</div>
      </main>
      <footer className="public-site__footer">
        <div className="public-site__footer-inner">
          <span>HireMe</span>
          {showRolesLink ? <a href="/opportunities">{t('publicOpportunity.list.title')}</a> : null}
        </div>
      </footer>
    </div>
  );
}
