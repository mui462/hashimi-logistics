import mongoose from 'mongoose';
import { createSchema } from './createSchema.js';
import { BLOG_STATUSES } from './enums.js';
import { objectIdRef, requiredText, slugField, textField } from './helpers/fields.js';
import { slugPlugin } from './plugins/slug.plugin.js';
import { mediaAssetSchema } from './schemas/cms.schema.js';
import { seoSchema } from './schemas/seo.schema.js';

const blogPostSchema = createSchema(
  {
    title: requiredText(200, 'Title'),
    slug: slugField(),
    excerpt: textField(500),
    content: textField(200000),
    featuredImage: mediaAssetSchema,
    author: objectIdRef('User'),
    category: textField(80),
    tags: {
      type: [textField(50, { lowercase: true })],
      validate: { validator: (list) => list.length <= 20, message: 'Use 20 tags or fewer.' },
    },
    status: { type: String, enum: BLOG_STATUSES, default: 'draft' },
    publishedAt: Date,
    // Phase 9 (additive). A scheduled post is public only once `scheduledAt` has passed.
    scheduledAt: Date,
    isFeatured: { type: Boolean, default: false },
    authorName: textField(120),
    SEO: seoSchema,
  },
  { collection: 'blog_posts' }
);

blogPostSchema.plugin(slugPlugin, { source: 'title' });

blogPostSchema.pre('validate', function stampPublishedAt() {
  if (this.status === 'published' && !this.publishedAt) {
    this.publishedAt = new Date();
  }
});

blogPostSchema.index({ status: 1, publishedAt: -1 });
blogPostSchema.index({ status: 1, scheduledAt: 1 });
blogPostSchema.index({ isFeatured: 1, status: 1, publishedAt: -1 });
blogPostSchema.index({ category: 1, status: 1 });
blogPostSchema.index({ tags: 1 });

export const BlogPost = mongoose.model('BlogPost', blogPostSchema);
