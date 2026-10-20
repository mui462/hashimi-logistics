import { useId } from 'react';
import { PAGE_SIZES } from '../../hooks/useListParams';
import Pagination from '../customer/Pagination';
import { FIELD_CLASSES } from '../forms/fieldStyles';

export default function AdminPagination({ pagination, limit, onPage, onLimit }) {
  const id = useId();
  if (!pagination) return null;
  return (
    <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
      <div>
        <label htmlFor={id} className="block text-base font-semibold">Rows per page</label>
        <select id={id} value={limit ?? pagination.limit} onChange={(event) => onLimit(Number(event.target.value))} className={`${FIELD_CLASSES} mt-1 w-32`}>
          {PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
        </select>
      </div>
      <div className="flex-1">
        {pagination.totalPages > 1 ? <Pagination pagination={pagination} onPage={onPage} /> : <p className="text-right text-base text-steel-600">{pagination.total} {pagination.total === 1 ? 'result' : 'results'}</p>}
      </div>
    </div>
  );
}
