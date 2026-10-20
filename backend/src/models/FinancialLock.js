import mongoose from 'mongoose';

/**
 * Short-lived mutual-exclusion lock for financial state changes on one invoice or payable. `_id` is the lock key
 * (e.g. "invoice:<id>"); acquiring inserts the row, so the primary-key uniqueness lets exactly one caller win even on a
 * database whose conditional updates are not strictly isolated (FerretDB). Expired locks (crashed holder) are removed on
 * contention. No TTL index is used so the model also works on databases without expireAfterSeconds.
 */
const financialLockSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    token: { type: String, required: true },
    expiresAt: { type: Date, required: true },
  },
  { collection: 'financial_locks', versionKey: false }
);

export const FinancialLock = mongoose.model('FinancialLock', financialLockSchema);
