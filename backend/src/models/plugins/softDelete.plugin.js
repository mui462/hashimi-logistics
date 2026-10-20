import mongoose from 'mongoose';

export class HardDeleteBlockedError extends Error {
  constructor(modelName) {
    super(
      `${modelName} records are business records and cannot be hard-deleted. ` +
        'Use archive() instead, or pass { allowHardDelete: true } for an audited maintenance task.'
    );
    this.name = 'HardDeleteBlockedError';
  }
}

const QUERY_DELETE_OPERATIONS = ['deleteOne', 'deleteMany', 'findOneAndDelete'];

/**
 * Archive instead of delete.
 *
 * Adds archivedAt / archivedBy, archive() / restore(), a `.active()` query helper, and
 * blocks hard deletes through Mongoose. Archived records stay in normal queries unless
 * the service layer chooses to add `.active()`, so nothing disappears implicitly.
 *
 * Scope: this guards Mongoose operations. Direct driver access or bulkWrite bypasses it.
 */
export function softDeletePlugin(schema) {
  schema.add({
    archivedAt: { type: Date, default: null },
    archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, select: false },
  });

  schema.method('archive', function archive(userId) {
    this.archivedAt = new Date();
    this.archivedBy = userId ?? null;
    return this.save();
  });

  schema.method('restore', function restore() {
    this.archivedAt = null;
    this.archivedBy = null;
    return this.save();
  });

  schema.query.active = function active() {
    return this.where({ archivedAt: null });
  };

  schema.pre(QUERY_DELETE_OPERATIONS, { query: true, document: false }, function blockQuery() {
    if (!this.getOptions().allowHardDelete) {
      throw new HardDeleteBlockedError(this.model.modelName);
    }
  });

  schema.pre('deleteOne', { query: false, document: true }, function blockDocument() {
    if (!this.$locals.allowHardDelete) {
      throw new HardDeleteBlockedError(this.constructor.modelName);
    }
  });
}
