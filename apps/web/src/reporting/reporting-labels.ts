import { MissionCandidateStateSchema, type MissionCandidateState } from '@hire-me/contracts';

import type { PlainMessageKey } from '../i18n/index.js';

/**
 * Presentation labels for language-neutral reporting values.
 *
 * The stored value is authoritative everywhere else: it is what the API
 * returned, what a filter would send back, and what any future business rule
 * would read. These helpers only decide which dictionary key describes it, so a
 * localized label never reaches the API and no branch is ever taken on display
 * text.
 */

const PIPELINE_STATES: ReadonlySet<string> = new Set(MissionCandidateStateSchema.options);

/**
 * Distribution keys arrive as plain strings in the reporting contract, so a
 * value the interface does not recognise is possible. Recognised values get a
 * translated label; anything else keeps the raw value rather than inventing one.
 */
export function isPipelineState(value: string): value is MissionCandidateState {
  return PIPELINE_STATES.has(value);
}

export function pipelineStateLabelKey(state: MissionCandidateState): PlainMessageKey {
  return `domain.pipelineState.${state}`;
}
