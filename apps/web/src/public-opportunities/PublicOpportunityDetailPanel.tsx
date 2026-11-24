import { useEffect, useRef, useState } from 'react';

import { getPublicOpportunity, submitPublicApplication } from '../api.js';
import { candidateSession } from '../candidate-portal/api.js';
import {
  buildApplicationRequest,
  encodeApplicationFiles,
  type ApplicationSnapshot,
} from './public-application.js';
import {
  classifySubmissionFailure,
  isNotFound,
  type PublicDetailState,
  type PublicSubmissionState,
} from './public-opportunity-state.js';
import { PublicOpportunityDetail } from './PublicOpportunityDetail.js';
import { PublicSite } from './PublicSite.js';

/**
 * Container for `/opportunities/:slug`. It owns the detail request, the one
 * application request, and the guards around both; everything visible is
 * `PublicOpportunityDetail`.
 *
 * Two guards keep asynchronous results in their own context:
 *
 * - a load sequence, so a detail response for an earlier slug or an earlier
 *   attempt can never replace the current one;
 * - a session per slug, so an application that resolves after the page has
 *   moved to another opportunity (or unmounted) shows nothing anywhere. The
 *   server request itself is never cancelled.
 *
 * `submitting` is a synchronous lock taken before the first `await`, so a
 * double click, Enter plus click, or repeated Enter sends one request only.
 * The locale is not a dependency of either effect.
 */
export function PublicOpportunityDetailPanel({ publicSlug }: { publicSlug: string }) {
  const [detail, setDetail] = useState<PublicDetailState>({ status: 'loading' });
  const [submission, setSubmission] = useState<PublicSubmissionState>({ status: 'idle' });
  const [attempt, setAttempt] = useState(0);
  const latestLoad = useRef(0);
  const session = useRef(0);
  const submitting = useRef(false);

  useEffect(() => {
    submitting.current = false;
    setSubmission({ status: 'idle' });
    return () => {
      session.current += 1;
    };
  }, [publicSlug]);

  useEffect(() => {
    const request = ++latestLoad.current;
    setDetail({ status: 'loading' });
    getPublicOpportunity(publicSlug).then(
      async (response) => {
        if (request === latestLoad.current) {
          const next = { opportunity: response.opportunity, status: 'ready' as const };
          if (!response.candidateAuthenticationRequired) {
            setDetail(next);
            return;
          }
          setDetail({ ...next, candidateAccess: { status: 'checking' } });
          try {
            const candidate = await candidateSession();
            if (request === latestLoad.current) {
              setDetail({
                ...next,
                candidateAccess: candidate
                  ? { status: 'signedIn', email: candidate.email }
                  : { status: 'guest' },
              });
            }
          } catch {
            if (request === latestLoad.current)
              setDetail({ ...next, candidateAccess: { status: 'error' } });
          }
        }
      },
      (error: unknown) => {
        if (request === latestLoad.current) {
          setDetail(isNotFound(error) ? { status: 'notFound' } : { status: 'error' });
        }
      },
    );
    return () => {
      latestLoad.current += 1;
    };
  }, [publicSlug, attempt]);

  async function submit(snapshot: ApplicationSnapshot): Promise<void> {
    if (submitting.current) {
      return;
    }
    submitting.current = true;
    const owner = session.current;
    setSubmission({ status: 'submitting' });
    let requestStarted = false;
    try {
      const files = await encodeApplicationFiles(snapshot);
      const request = buildApplicationRequest(snapshot, files);
      requestStarted = true;
      await submitPublicApplication(
        publicSlug,
        request,
        undefined,
        detail.status === 'ready' && detail.candidateAccess?.status === 'signedIn',
      );
      if (owner === session.current) {
        setSubmission({ status: 'received' });
      }
    } catch (error: unknown) {
      if (owner === session.current) {
        setSubmission({
          failure: requestStarted ? classifySubmissionFailure(error) : 'failed',
          status: 'failed',
        });
      }
    } finally {
      if (owner === session.current) {
        submitting.current = false;
      }
    }
  }

  return (
    <PublicSite>
      <PublicOpportunityDetail
        detail={detail}
        onRetry={() => setAttempt((value) => value + 1)}
        onSubmit={(snapshot) => void submit(snapshot)}
        submission={submission}
      />
    </PublicSite>
  );
}
