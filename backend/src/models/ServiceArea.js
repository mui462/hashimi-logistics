import mongoose from 'mongoose';
import { createSchema } from './createSchema.js';
import { COVERAGE_TYPES } from './enums.js';
import { requiredText, textField } from './helpers/fields.js';
import { slugPlugin } from './plugins/slug.plugin.js';
import { softDeletePlugin } from './plugins/softDelete.plugin.js';
import { seoSchema } from './schemas/seo.schema.js';
import { mediaAssetSchema } from './schemas/cms.schema.js';
import { countryField } from './schemas/location.schema.js';

const serviceAreaSchema = createSchema(
  {
    country: countryField({ required: [true, 'Country is required.'] }),
    stateProvince: textField(80),
    cityRegion: textField(120),
    title: requiredText(150, 'Title'),
    // Phase 9 (additive). Sparse so older documents without a slug stay valid.
    slug: textField(160, { lowercase: true, unique: true, sparse: true, match: [/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slugs may only contain lowercase letters, numbers, and single hyphens.'] }),
    SEO: seoSchema,
    description: textField(3000),
    image: mediaAssetSchema,
    coverageType: { type: String, enum: COVERAGE_TYPES, default: 'domestic' },
    isActive: { type: Boolean, default: true },
    displayOrder: { type: Number, default: 0 },
  },
  { collection: 'service_areas' }
);

serviceAreaSchema.plugin(slugPlugin, { source: 'title' });
serviceAreaSchema.plugin(softDeletePlugin);

serviceAreaSchema.index({ isActive: 1, displayOrder: 1 });
serviceAreaSchema.index({ archivedAt: 1, isActive: 1, displayOrder: 1 });
serviceAreaSchema.index({ country: 1, stateProvince: 1 });

export const ServiceArea = mongoose.model('ServiceArea', serviceAreaSchema);
