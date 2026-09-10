/**
 * Choose which weekly bucket columns receive a visible x-axis label.
 *
 * The first and last buckets are always labeled when more than one bucket
 * exists. Longer spans also label the buckets nearest 25% and 75% along the
 * index range. Indices are deduplicated and sorted, so roughly twelve weekly
 * buckets yield four labels without repeating a full axis under every series.
 */
export function selectTrendAxisLabelIndices(bucketCount: number): readonly number[] {
  if (bucketCount <= 0) {
    return [];
  }
  if (bucketCount === 1) {
    return [0];
  }

  const indices = new Set<number>([0, bucketCount - 1]);
  if (bucketCount > 2) {
    indices.add(Math.round((bucketCount - 1) * 0.25));
    indices.add(Math.round((bucketCount - 1) * 0.75));
  }

  return [...indices].sort((left, right) => left - right);
}
