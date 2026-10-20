import mongoose from 'mongoose';
import { createSchema } from './createSchema.js';
import { requiredText, slugField, textField } from './helpers/fields.js';
import { slugPlugin } from './plugins/slug.plugin.js';
import { buttonSchema, mediaAssetSchema } from './schemas/cms.schema.js';
import { softDeletePlugin } from './plugins/softDelete.plugin.js';
import { seoSchema } from './schemas/seo.schema.js';

const industrySchema = createSchema(
  {
    name: requiredText(150, 'Name'),
    slug: slugField(),
    description: textField(50000),
    // Phase 9 (additive). `description` is the full description.
    shortDescription: textField(400),
    benefits: { type: [textField(200)], validate: { validator: (list) => list.length <= 20, message: 'Use 20 benefits or fewer.' } },
    cta: buttonSchema,
    image: mediaAssetSchema,
    icon: textField(60),
    SEO: seoSchema,
    displayOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { collection: 'industries' }
);

industrySchema.plugin(slugPlugin, { source: 'name' });

industrySchema.plugin(softDeletePlugin);

industrySchema.index({ isActive: 1, displayOrder: 1 });
industrySchema.index({ archivedAt: 1, isActive: 1, displayOrder: 1 });

export const Industry = mongoose.model('Industry', industrySchema);
