import mongoose from 'mongoose';
import { createSchema } from './createSchema.js';
import { requiredText, textField } from './helpers/fields.js';
import { mediaAssetSchema } from './schemas/cms.schema.js';
import { softDeletePlugin } from './plugins/softDelete.plugin.js';

/** Created only by the Super Admin from real feedback. Nothing is seeded. */
const testimonialSchema = createSchema(
  {
    customerName: requiredText(120, 'Customer name'),
    company: textField(150),
    position: textField(120),
    testimonial: requiredText(2000, 'Testimonial'),
    photo: mediaAssetSchema,
    rating: { type: Number, min: 1, max: 5 },
    isFeatured: { type: Boolean, default: false },
    displayOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { collection: 'testimonials' }
);

testimonialSchema.plugin(softDeletePlugin);

testimonialSchema.index({ isActive: 1, displayOrder: 1 });
testimonialSchema.index({ archivedAt: 1, isActive: 1, displayOrder: 1 });

export const Testimonial = mongoose.model('Testimonial', testimonialSchema);
