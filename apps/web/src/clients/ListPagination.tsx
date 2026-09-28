import { Button } from '../ui/index.js';
import { pageCount } from './client-state.js';

export function ListPagination({
  labels,
  onPage,
  page,
  pageSize,
  total,
}: {
  labels: {
    next: string;
    page: (values: { page: number; pages: number }) => string;
    previous: string;
    range: (values: { first: number; last: number; total: number }) => string;
    region: string;
  };
  onPage: (page: number) => void;
  page: number;
  pageSize: number;
  total: number;
}) {
  const pages = pageCount(total, pageSize);
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <nav aria-label={labels.region} className="client-pagination">
      <p className="client-pagination__state u-tabular">
        <span>{labels.page({ page, pages })}</span>
        <span aria-hidden="true"> · </span>
        <span>{labels.range({ first, last, total })}</span>
      </p>
      {pages > 1 ? (
        <div className="client-pagination__actions">
          <Button
            disabled={page <= 1}
            onClick={() => onPage(page - 1)}
            size="compact"
            variant="secondary"
          >
            {labels.previous}
          </Button>
          <Button
            disabled={page >= pages}
            onClick={() => onPage(page + 1)}
            size="compact"
            variant="secondary"
          >
            {labels.next}
          </Button>
        </div>
      ) : null}
    </nav>
  );
}
