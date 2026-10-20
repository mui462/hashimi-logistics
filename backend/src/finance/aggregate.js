/**
 * Grouped counts and sums with exactly ONE accumulator per $group stage.
 * FerretDB 1.24 evaluates only the first accumulator of a multi-accumulator $group (the others come back as 0), which would
 * silently produce wrong money totals. Issuing one aggregation per measure is correct on FerretDB and on MongoDB.
 * `keys` maps output names to document fields, e.g. { currency: '$currency', status: '$status' }.
 * Returns rows like { currency, status, count, total, paid }.
 */
export async function groupMeasures(Model, { match = {}, keys, sums = {} }) {
  const measures = [['count', { $sum: 1 }], ...Object.entries(sums).map(([name, field]) => [name, { $sum: `$${field}` }])];
  const results = await Promise.all(
    measures.map(([, accumulator]) => Model.aggregate([{ $match: match }, { $group: { _id: keys, value: accumulator } }]))
  );
  const rows = new Map();
  results.forEach((groups, index) => {
    const [name] = measures[index];
    for (const group of groups) {
      const id = JSON.stringify(group._id);
      if (!rows.has(id)) rows.set(id, { ...group._id, ...Object.fromEntries(measures.map(([m]) => [m, 0])) });
      rows.get(id)[name] = group.value;
    }
  });
  return [...rows.values()];
}
