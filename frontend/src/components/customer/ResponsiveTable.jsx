import { cx } from '../../utils/cx';

/**
 * A real table from the `tableFrom` breakpoint up (the portal sidebar takes 18rem from lg); stacked cards below it, so nothing needs sideways scrolling on a phone.
 * columns: [{ key, header, render(row), primary?: true, className? }]. The `primary` column becomes the card title.
 */
// Tailwind needs whole class names, so each breakpoint is spelled out.
const TABLE_FROM = { lg: 'hidden overflow-x-auto lg:block', xl: 'hidden overflow-x-auto xl:block' };
const CARDS_UNTIL = { lg: 'grid gap-4 md:grid-cols-2 lg:hidden', xl: 'grid gap-4 md:grid-cols-2 xl:hidden' };

export default function ResponsiveTable({ caption, columns, rows, getKey, tableFrom = 'xl' }) {
  const primary = columns.find((column) => column.primary) ?? columns[0];
  const secondary = columns.filter((column) => column !== primary);

  return (
    <>
      <div className={TABLE_FROM[tableFrom]}>
        <table className="w-full border-collapse text-left text-base">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b-2 border-steel-300">
              {columns.map((column) => (
                <th key={column.key} scope="col" className={cx('px-4 py-3 font-semibold text-steel-600', column.className)}>
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={getKey(row)} className="border-b border-steel-200 align-top">
                {columns.map((column) =>
                  column === primary ? (
                    <th key={column.key} scope="row" className={cx('px-4 py-4 font-semibold', column.className)}>
                      {column.render(row)}
                    </th>
                  ) : (
                    <td key={column.key} className={cx('px-4 py-4', column.className)}>{column.render(row)}</td>
                  )
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul aria-label={caption} className={CARDS_UNTIL[tableFrom]}>
        {rows.map((row) => (
          <li key={getKey(row)} className="rounded-lg border border-steel-200 p-4">
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
