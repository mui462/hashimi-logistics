import mongoose from 'mongoose';
import { textField } from '../helpers/fields.js';

export const weightSchema = new mongoose.Schema(
  {
    value: { type: Number, required: [true, 'Weight value is required.'], min: 0 },
    unit: { type: String, enum: ['lb', 'kg'], default: 'lb' },
  },
  { _id: false }
);

export const dimensionsSchema = new mongoose.Schema(
  {
    length: { type: Number, min: 0 },
    width: { type: Number, min: 0 },
    height: { type: Number, min: 0 },
    unit: { type: String, enum: ['in', 'cm'], default: 'in' },
  },
  { _id: false }
);

export const temperatureSchema = new mongoose.Schema(
  {
    minimum: Number,
    maximum: {
      type: Number,
      validate: {
        validator(value) {
          return value == null || this.minimum == null || value >= this.minimum;
        },
        message: 'The maximum temperature cannot be below the minimum.',
      },
    },
    unit: { type: String, enum: ['C', 'F'], default: 'F' },
    notes: textField(300),
  },
  { _id: false }
);
