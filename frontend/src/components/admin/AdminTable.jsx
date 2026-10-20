import { cx } from '../../utils/cx';

/**
 * A real table from `xl` up (scrolling inside its own box only when the columns need it, with a sticky header);
 * stacked cards below, so nothing needs sideways scrolling on a phone.
 * columns: [{ key, header, render(row), primary?: true, className? }]. The `primary` column is the row header / card title.
 */
export default function AdminTable({ caption, columns, rows, getKey }) {
  const primary = columns.find((column) => column.primary) ?? columns[0];
  const secondary = columns.filter((column) => column !== primary);

  return (
    <>
      <div role="region" aria-label={caption} tabIndex={0} className="hidden max-h-[75vh] overflow-auto rounded-lg border border-steel-200 bg-white xl:block">
        <table className="w-full border-collapse text-left text-base">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key} scope="col" className={cx('sticky top-0 z-10 whitespace-nowrap border-b-2 border-steel-300 bg-steel-50 px-4 py-3 font-semibold text-steel-600', column.className)}>
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={getKey(row)} className="border-b border-steel-200 align-top last:border-b-0 hover:bg-steel-50">
                {columns.map((column) =>
                  column === primary ? (
                    <th key={column.key} scope="row" className={cx('px-4 py-4 font-semibold', column.className)}>{column.render(row)}</th>
                  ) : (
                    <td key={column.key} className={cx('px-4 py-4', column.className)}>{column.render(row)}</td>
                  )
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul aria-label={caption} className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-[repeat(2,minmax(0,1fr))] xl:hidden">
        {rows.map((row) => (
          <li key={getKey(row)} className="min-w-0 break-words rounded-lg border border-steel-200 bg-white p-4">
            <p className="break-words text-lg font-bold">{primary.render(row)}</p>
            <dl className="mt-3 space-y-3">
              {secondary.map((column) => (
                <div key={column.key}>
                  <dt className="text-base font-semibold text-steel-600">{column.header}</dt>
                  <dd className="break-words text-base">{column.render(row)}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}
