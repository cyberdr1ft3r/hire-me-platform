import { useId } from 'react';
import type { PublicOpportunity } from '@hire-me/contracts';

import { useI18n } from '../i18n/index.js';
import { Button, InlineMessage } from '../ui/index.js';
import { opportunityHeadline, publishedText } from './public-opportunity-format.js';
import type { PublicListState } from './public-opportunity-state.js';

/**
 * The public list of open roles, in the order the API returns them.
 *
 * It has no search, filters, sorting, or pagination because the public list has
 * never had them. Each row shows only published fields: the title, then
 * location, work arrangement, and contract type, then the summary.
 */
export function PublicOpportunityList({
  list,
  onRetry,
}: {
  list: PublicListState;
  onRetry: () => void;
}) {
  const { t } = useI18n();
  const titleId = useId();

  return (
    <div className="public-page public-page--list">
      <div className="public-intro">
        <h1 id={titleId}>{t('publicOpportunity.list.title')}</h1>
        <p className="public-intro__lead">{t('publicOpportunity.list.description')}</p>
      </div>
      <section aria-labelledby={titleId} className="public-list">
        <ListBody list={list} onRetry={onRetry} />
      </section>
    </div>
  );
}

function ListBody({ list, onRetry }: { list: PublicListState; onRetry: () => void }) {
  const { t } = useI18n();

  if (list.status === 'loading') {
    return (
      <div aria-busy="true" className="public-list__loading" role="status">
        <span className="sr-only">{t('publicOpportunity.states.loadingList')}</span>
        {[0, 1, 2].map((row) => (
          <div aria-hidden="true" className="public-list__skeleton" key={row}>
            <span className="ui-skeleton ui-skeleton--title" />
            <span className="ui-skeleton ui-skeleton--short" />
            <span className="ui-skeleton" />
          </div>
        ))}
      </div>
    );
  }

  if (list.status === 'error') {
    return (
      <div className="public-state">
        <InlineMessage announce title={t('publicOpportunity.states.listErrorTitle')} tone="danger">
          {t('publicOpportunity.states.listError')}
        </InlineMessage>
        <div>
          <Button onClick={onRetry} variant="secondary">
            {t('common.actions.retry')}
          </Button>
        </div>
      </div>
    );
  }

  if (list.opportunities.length === 0) {
    return (
      <div className="public-state public-state--empty">
        <h2>{t('publicOpportunity.empty.title')}</h2>
        <p>{t('publicOpportunity.empty.body')}</p>
      </div>
    );
  }

  return (
    <>
      <p className="public-list__count">
        {t('publicOpportunity.list.count', { count: list.opportunities.length })}
      </p>
      <ul className="public-list__rows">
        {list.opportunities.map((opportunity) => (
          <PublicOpportunityRow key={opportunity.publicSlug} opportunity={opportunity} />
        ))}
      </ul>
    </>
  );
}

/**
 * One opportunity. The title is the row's real link; its pseudo-element covers
 * the whole row so the row is one pointer target, while the accessible name
 * stays the title alone. "View opportunity" is a visual cue for the same link.
 */
function PublicOpportunityRow({ opportunity }: { opportunity: PublicOpportunity }) {
  const { t } = useI18n();
  const headline = opportunityHeadline(opportunity);
  const summary = publishedText(opportunity.publicSummary);

  return (
    <li className="public-list__row">
      <article className="public-list__item">
        <h2 className="public-list__title">
          <a className="public-list__link" href={`/opportunities/${opportunity.publicSlug}`}>
            {opportunity.publicTitle}
          </a>
        </h2>
        {headline.length > 0 ? (
          <ul className="public-meta">
            {headline.map((item, index) => (
              <li key={`${index}-${item}`}>{item}</li>
            ))}
          </ul>
        ) : null}
        {summary ? <p className="public-list__summary">{summary}</p> : null}
        <span aria-hidden="true" className="public-list__cue">
          {t('publicOpportunity.list.viewOpportunity')}
          <span className="public-list__arrow">→</span>
        </span>
      </article>
    </li>
  );
}
