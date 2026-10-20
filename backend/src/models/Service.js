import mongoose from 'mongoose';
import { createSchema } from './createSchema.js';
import { requiredText, slugField, textField } from './helpers/fields.js';
import { slugPlugin } from './plugins/slug.plugin.js';
import { buttonSchema, mediaAssetSchema } from './schemas/cms.schema.js';
import { softDeletePlugin } from './plugins/softDelete.plugin.js';
import { seoSchema } from './schemas/seo.schema.js';

const serviceSchema = createSchema(
  {
    name: requiredText(150, 'Name'),
    slug: slugField(),
    shortDescription: textField(400),
    fullDescription: textField(50000),
    icon: textField(60),
    image: mediaAssetSchema,
    // Phase 9 (additive). `image` is the card image.
    heroImage: mediaAssetSchema,
    benefits: { type: [textField(200)], validate: { validator: (list) => list.length <= 20, message: 'Use 20 benefits or fewer.' } },
    features: { type: [textField(200)], validate: { validator: (list) => list.length <= 20, message: 'Use 20 features or fewer.' } },
    serviceAreaIds: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ServiceArea' }], validate: { validator: (list) => list.length <= 50, message: 'Use 50 service areas or fewer.' } },
    cta: buttonSchema,
    isFeatured: { type: Boolean, default: false },
    SEO: seoSchema,
    displayOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { collection: 'services' }
);

serviceSchema.plugin(slugPlugin, { source: 'name' });

serviceSchema.plugin(softDeletePlugin);

serviceSchema.index({ isActive: 1, displayOrder: 1 });
serviceSchema.index({ archivedAt: 1, isActive: 1, displayOrder: 1 });

export const Service = mongoose.model('Service', serviceSchema);
