import { HardDeleteBlockedError } from './softDelete.plugin.js';

export class ImmutableRecordError extends Error {
  constructor(modelName) {
    super(`${modelName} records are append-only and cannot be modified.`);
    this.name = 'ImmutableRecordError';
  }
}

const QUERY_UPDATE_OPERATIONS = [
  'updateOne',
  'updateMany',
  'findOneAndUpdate',
  'replaceOne',
  'findOneAndReplace',
];
const QUERY_DELETE_OPERATIONS = ['deleteOne', 'deleteMany', 'findOneAndDelete'];

/**
 * For audit-style collections: documents can be created but never changed. Deletion is
 * only possible with an explicit { allowHardDelete: true } (for example a retention job).
 */
export function appendOnlyPlugin(schema) {
  schema.pre('save', function blockResave() {
    if (!this.isNew) throw new ImmutableRecordError(this.constructor.modelName);
  });

  schema.pre(QUERY_UPDATE_OPERATIONS, function blockUpdate() {
    throw new ImmutableRecordError(this.model.modelName);
  });

  schema.pre(QUERY_DELETE_OPERATIONS, { query: true, document: false }, function blockQuery() {
    if (!this.getOptions().allowHardDelete) throw new HardDeleteBlockedError(this.model.modelName);
  });

  schema.pre('deleteOne', { query: false, document: true }, function blockDocument() {
    if (!this.$locals.allowHardDelete) throw new HardDeleteBlockedError(this.constructor.modelName);
  });
}
