import mongoose from 'mongoose';
import { createSchema } from './createSchema.js';
import { CMS_STATUSES, PAGE_KEYS } from './enums.js';
import { requiredText, slugField, textField } from './helpers/fields.js';
import { slugPlugin } from './plugins/slug.plugin.js';
import { buttonSchema, mediaAssetSchema, pageSectionSchema } from './schemas/cms.schema.js';
import { seoSchema } from './schemas/seo.schema.js';

const pageSchema = createSchema(
  {
    title: requiredText(200, 'Title'),
    slug: slugField(),
    excerpt: textField(500),
    content: textField(200000),
    featuredImage: mediaAssetSchema,
    // Phase 9 (additive). `pageKey` marks a system page the public site routes to; its key and slug are locked by the CMS.
    pageKey: { type: String, enum: PAGE_KEYS },
    heroHeading: textField(200),
    heroSubtitle: textField(300),
    heroImage: mediaAssetSchema,
    sections: {
      type: [pageSectionSchema],
      validate: { validator: (list) => list.length <= 30, message: 'Use 30 sections or fewer.' },
    },
    cta: buttonSchema,
    SEO: seoSchema,
    status: { type: String, enum: CMS_STATUSES, default: 'draft' },
    displayOrder: { type: Number, default: 0 },
  },
  { collection: 'pages' }
);

pageSchema.plugin(slugPlugin, { source: 'title' });

pageSchema.index({ status: 1, displayOrder: 1 });
pageSchema.index({ pageKey: 1 }, { unique: true, sparse: true });

export const Page = mongoose.model('Page', pageSchema);
