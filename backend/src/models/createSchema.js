import mongoose from 'mongoose';

function selectFalsePaths(schema) {
  const paths = [];
  schema.eachPath((path, schemaType) => {
    if (schemaType.options.select === false) paths.push(path);
  });
  return paths;
}

function unsetPath(object, path) {
  const keys = path.split('.');
  const last = keys.pop();
  const parent = keys.reduce((node, key) => node?.[key], object);
  if (parent) delete parent[last];
}

/**
 * Schema factory shared by every Phase 2 model.
 *
 * - explicit collection name and timestamps
 * - toJSON() strips `_id`, `__v`, and every field declared `select: false`, so an
 *   internal value (carrierRate, brokerMargin, internal notes...) cannot leak through
 *   res.json(document), even for a document that was just created in memory
 * - `hiddenFromJson` lists extra paths that are readable by queries but never serialized (served by their own endpoint)
 * - toInternalJSON() is the explicit, Super-Admin-only way to serialize everything
 */
export function createSchema(definition, { collection, timestamps = true, hiddenFromJson = [] } = {}) {
  const schema = new mongoose.Schema(definition, {
    collection,
    timestamps,
    toJSON: {
      virtuals: true,
      transform(_document, serialized) {
        delete serialized._id;
        delete serialized.__v;
        for (const path of [...selectFalsePaths(schema), ...hiddenFromJson]) unsetPath(serialized, path);
        return serialized;
      },
    },
  });

  schema.method('toInternalJSON', function toInternalJSON() {
    return this.toObject({
      virtuals: true,
      versionKey: false,
      transform(_document, serialized) {
        delete serialized._id;
        return serialized;
      },
    });
  });

  return schema;
}
