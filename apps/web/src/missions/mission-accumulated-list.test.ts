import { describe, expect, it } from 'vitest';

import {
  emptyAccumulatedList,
  hasMoreAccumulated,
  mergeAccumulatedPage,
} from './mission-accumulated-list.js';

type Row = { id: string; label: string };

describe('mission accumulated list helpers', () => {
  it('merges a next page without duplicate ids', () => {
    const base = mergeAccumulatedPage<Row>(
      emptyAccumulatedList<Row>(),
      1,
      20,
      3,
      [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ],
      true,
    );
    const merged = mergeAccumulatedPage(
      base,
      2,
      20,
      3,
      [
        { id: 'b', label: 'B duplicate' },
        { id: 'c', label: 'C' },
      ],
      false,
    );
    expect(merged.items.map((entry) => entry.id)).toEqual(['a', 'b', 'c']);
    expect(merged.page).toBe(2);
    expect(hasMoreAccumulated(merged)).toBe(false);
  });

  it('replaces items on a fresh first page load', () => {
    const first = mergeAccumulatedPage<Row>(
      emptyAccumulatedList<Row>(),
      1,
      20,
      40,
      [{ id: 'x', label: 'X' }],
      true,
    );
    const second = mergeAccumulatedPage(first, 1, 20, 1, [{ id: 'y', label: 'Y' }], true);
    expect(second.items).toEqual([{ id: 'y', label: 'Y' }]);
  });
});
