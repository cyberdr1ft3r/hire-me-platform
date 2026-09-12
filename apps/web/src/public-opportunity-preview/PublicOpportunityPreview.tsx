import { useState } from 'react';
import type { PublicOpportunity } from '@hire-me/contracts';

import { I18nProvider, useI18n, type PlainMessageKey } from '../i18n/index.js';
import {
  PublicOpportunityDetail,
  PublicOpportunityList,
  PublicSite,
  type PublicDetailState,
  type PublicListState,
  type PublicSubmissionState,
} from '../public-opportunities/index.js';
import { Select } from '../ui/index.js';
import { previewOpportunities } from './public-opportunity-preview-data.js';

/**
 * Development-only review surface for the public opportunity pages.
 *
 * It renders the real `PublicSite`, `PublicOpportunityList`, and
 * `PublicOpportunityDetail` inside the real `I18nProvider`, so switching
 * language or state exercises the components production uses. There is no
 * second, preview-only copy of the pages.
 *
 * It performs no request of any kind, reads no token, and contains only
 * synthetic public-shaped records. It is not linked from anywhere and is
 * excluded from the production build. Submitting the form only shows the
 * received state, because there is no API behind it.
 */
export function PublicOpportunityPreview() {
  return (
    <I18nProvider>
      <PublicOpportunityPreviewContent />
    </I18nProvider>
  );
}

const PREVIEW_STATES = [
  'list',
  'empty',
  'listLoading',
  'listError',
  'detail',
  'received',
  'submissionFailed',
  'detailLoading',
  'notFound',
  'detailError',
] as const;

type PreviewState = (typeof PREVIEW_STATES)[number];

function isPreviewState(value: string): value is PreviewState {
  return (PREVIEW_STATES as readonly string[]).includes(value);
}

function stateLabelKey(state: PreviewState): PlainMessageKey {
  return `preview.publicOpportunity.${state}`;
}

function initialState(): PreviewState {
  const requested = new URLSearchParams(window.location.search).get('state') ?? '';
  return isPreviewState(requested) ? requested : 'list';
}

function listFor(state: PreviewState, opportunities: PublicOpportunity[]): PublicListState | null {
  switch (state) {
    case 'list':
      return { opportunities, status: 'ready' };
    case 'empty':
      return { opportunities: [], status: 'ready' };
    case 'listLoading':
      return { status: 'loading' };
    case 'listError':
      return { status: 'error' };
    default:
      return null;
  }
}

function detailFor(state: PreviewState, opportunity: PublicOpportunity): PublicDetailState {
  switch (state) {
    case 'detailLoading':
      return { status: 'loading' };
    case 'notFound':
      return { status: 'notFound' };
    case 'detailError':
      return { status: 'error' };
    default:
      return { opportunity, status: 'ready' };
  }
}

function PublicOpportunityPreviewContent() {
  const { locale, t } = useI18n();
  const [state, setState] = useState<PreviewState>(initialState);
  const [submitted, setSubmitted] = useState(false);

  const opportunities = previewOpportunities(locale);
  const list = listFor(state, opportunities);
  const submission: PublicSubmissionState =
    state === 'received' || submitted
      ? { status: 'received' }
      : state === 'submissionFailed'
        ? { failure: 'failed', status: 'failed' }
        : { status: 'idle' };

  return (
    <>
      <div className="public-preview__switches">
        <Select
          label={t('preview.publicOpportunity.state')}
          onChange={(event) => {
            const next = event.target.value;
            if (isPreviewState(next)) {
              setState(next);
              setSubmitted(false);
            }
          }}
          value={state}
        >
          {PREVIEW_STATES.map((option) => (
            <option key={option} value={option}>
              {t(stateLabelKey(option))}
            </option>
          ))}
        </Select>
      </div>
      {list ? (
        <PublicSite showRolesLink={false}>
          <PublicOpportunityList list={list} onRetry={() => undefined} />
        </PublicSite>
      ) : (
        <PublicSite>
          <PublicOpportunityDetail
            detail={detailFor(state, opportunities[0]!)}
            onRetry={() => undefined}
            onSubmit={() => setSubmitted(true)}
            submission={submission}
          />
        </PublicSite>
      )}
    </>
  );
}
