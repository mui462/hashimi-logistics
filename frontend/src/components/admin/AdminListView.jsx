import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useListParams } from '../../hooks/useListParams';
import EmptyState from '../common/EmptyState';
import AdminAsyncView from './AdminAsyncView';
import AdminFilters from './AdminFilters';
import AdminPagination from './AdminPagination';
import AdminTable from './AdminTable';

/**
 * A server-side list: filters, page and page size all live in the URL and are sent to the API; the table only renders
 * what the server returned. `fields` may carry `optionsLoader` (a promise of [{ value, label }]) for customer / carrier pickers.
 */
export default function AdminListView({ fetcher, fields, columns, getKey, caption, emptyTitle, emptyDescription, extraParams, fixedLimit }) {
  const keys = useMemo(() => fields.map((field) => field.name), [fields]);
  const { params, update, reset } = useListParams(keys);
  const [remote, setRemote] = useState({});

  useEffect(() => {
    let current = true;
    for (const field of fields) {
      if (!field.optionsLoader) continue;
      field.optionsLoader().then(
        (options) => current && setRemote((previous) => ({ ...previous, [field.name]: options })),
        () => current && setRemote((previous) => ({ ...previous, [field.name]: [] }))
      );
    }
    return () => {
      current = false;
    };
  }, [fields]);

  const resolvedFields = useMemo(() => fields.map((field) => (field.optionsLoader ? { ...field, options: remote[field.name] ?? [] } : field)), [fields, remote]);
  const query = useMemo(() => ({ ...params, ...(fixedLimit ? { limit: fixedLimit } : {}), ...extraParams }), [params, extraParams, fixedLimit]);
  const load = useCallback(() => fetcher(query), [fetcher, query]);
  const state = useAsyncData(load);
  const filtered = keys.some((key) => params[key]);

  return (
    <div className="space-y-5">
      <AdminFilters fields={resolvedFields} values={params} onApply={(values) => update(values)} onReset={reset} />
      <AdminAsyncView
        state={state}
        label="Loading results"
        errorTitle="We could not load this list"
        isEmpty={(data) => data.items.length === 0}
        empty={
          <EmptyState
            title={filtered ? 'No results match these filters' : emptyTitle}
            description={filtered ? 'Change or reset the filters to see more.' : emptyDescription}
          />
        }
      >
        {(data) => (
          <>
            <AdminTable caption={caption} columns={columns} rows={data.items} getKey={getKey} />
            <AdminPagination
              pagination={data.pagination}
              limit={params.limit}
              onPage={(page) => update({ page }, { resetPage: false })}
              onLimit={(limit) => update({ limit })}
            />
          </>
        )}
      </AdminAsyncView>
    </div>
  );
}
