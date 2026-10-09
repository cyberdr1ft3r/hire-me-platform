/** Default page size for nested mission lists (matches API contract defaults). */
export const MISSION_NESTED_PAGE_SIZE = 20;

export type AccumulatedListState<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  loadingMore: boolean;
  loadMoreFailed: boolean;
};

export function emptyAccumulatedList<T>(
  pageSize = MISSION_NESTED_PAGE_SIZE,
): AccumulatedListState<T> {
  return {
    items: [],
    page: 0,
    pageSize,
    total: 0,
    loadingMore: false,
    loadMoreFailed: false,
  };
}

export function accumulatedItems<T>(state: AccumulatedListState<T> | null | undefined): T[] {
  return state?.items ?? [];
}

export function hasMoreAccumulated(state: AccumulatedListState<unknown>): boolean {
  return state.items.length < state.total;
}

export function mergeAccumulatedPage<T extends { id: string }>(
  current: AccumulatedListState<T>,
  page: number,
  pageSize: number,
  total: number,
  incoming: T[],
  replace: boolean,
): AccumulatedListState<T> {
  if (replace) {
    return {
      items: incoming,
      page,
      pageSize,
      total,
      loadingMore: false,
      loadMoreFailed: false,
    };
  }
  const known = new Set(current.items.map((entry) => entry.id));
  return {
    items: [...current.items, ...incoming.filter((entry) => !known.has(entry.id))],
    page,
    pageSize,
    total,
    loadingMore: false,
    loadMoreFailed: false,
  };
}
