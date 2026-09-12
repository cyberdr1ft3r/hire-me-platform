import { useEffect, useRef, useState } from 'react';

import { listPublicOpportunities } from '../api.js';
import { PublicOpportunityList } from './PublicOpportunityList.js';
import type { PublicListState } from './public-opportunity-state.js';
import { PublicSite } from './PublicSite.js';

/**
 * Container for `/opportunities`. It owns the single list request and its
 * retry; everything visible is `PublicOpportunityList`.
 *
 * The request runs once per mount and once per retry. The locale is not a
 * dependency, so switching language re-renders text without refetching.
 */
export function PublicOpportunitiesPanel() {
  const [list, setList] = useState<PublicListState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  // Only the latest request may commit, so a slow earlier response or failure
  // can never overwrite the result of a retry.
  const latestRequest = useRef(0);

  useEffect(() => {
    const request = ++latestRequest.current;
    setList({ status: 'loading' });
    listPublicOpportunities().then(
      (response) => {
        if (request === latestRequest.current) {
          setList({ opportunities: response.opportunities, status: 'ready' });
        }
      },
      () => {
        if (request === latestRequest.current) {
          setList({ status: 'error' });
        }
      },
    );
    return () => {
      latestRequest.current += 1;
    };
  }, [attempt]);

  return (
    <PublicSite showRolesLink={false}>
      <PublicOpportunityList list={list} onRetry={() => setAttempt((value) => value + 1)} />
    </PublicSite>
  );
}
