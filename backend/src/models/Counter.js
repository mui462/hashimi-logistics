import mongoose from 'mongoose';

/** Atomic sequence per key (for example "QT-2026") used to build human-readable numbers. */
const counterSchema = new mongoose.Schema(
  { _id: { type: String }, sequence: { type: Number, default: 0 } },
  { collection: 'counters', versionKey: false }
);

export const Counter = mongoose.model('Counter', counterSchema);
