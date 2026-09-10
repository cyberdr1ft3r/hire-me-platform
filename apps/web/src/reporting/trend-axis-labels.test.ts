import { describe, expect, it } from 'vitest';

import { selectTrendAxisLabelIndices } from './trend-axis-labels.js';

describe('selectTrendAxisLabelIndices', () => {
  it('returns no indices for an empty span', () => {
    expect(selectTrendAxisLabelIndices(0)).toEqual([]);
  });

  it('labels the only bucket when the span is a single week', () => {
    expect(selectTrendAxisLabelIndices(1)).toEqual([0]);
  });

  it('labels the first and last buckets for a two-week span', () => {
    expect(selectTrendAxisLabelIndices(2)).toEqual([0, 1]);
  });

  it('adds quarter and three-quarter markers for roughly twelve weekly buckets', () => {
    expect(selectTrendAxisLabelIndices(12)).toEqual([0, 3, 8, 11]);
  });

  it('labels the preview synthetic thirteen-week window deterministically', () => {
    expect(selectTrendAxisLabelIndices(13)).toEqual([0, 3, 9, 12]);
  });
});
