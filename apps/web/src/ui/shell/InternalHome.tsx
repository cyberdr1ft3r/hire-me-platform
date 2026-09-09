import type { AuthenticatedUser } from '@hire-me/contracts';

import { useI18n } from '../../i18n/index.js';
import { PageHeader } from '../PageHeader.js';

export function InternalHome({ user }: { user: AuthenticatedUser }) {
  const { t } = useI18n();

  return (
    <div className="app-home">
      <PageHeader
        description={t('overview.description')}
        eyebrow={t('overview.eyebrow')}
        metadata={<span>{t('overview.signedInAs', { email: user.email })}</span>}
        title={t('overview.title')}
      />
      <section aria-labelledby="app-home-start" className="app-home__intro">
        <h2 id="app-home-start">{t('overview.introTitle')}</h2>
        <p>{t('overview.intro')}</p>
      </section>
    </div>
  );
}
