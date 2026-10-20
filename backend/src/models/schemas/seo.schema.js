import mongoose from 'mongoose';
import { textField, urlField } from '../helpers/fields.js';

const CANONICAL_PATTERN = /^(https?:\/\/\S+|\/\S*)$/i;

/** Reusable SEO block shared by pages, services, industries, blog posts, and the homepage. */
export const seoSchema = new mongoose.Schema(
  {
    title: textField(120),
    description: textField(320),
    keywords: {
      type: [textField(60)],
      validate: { validator: (list) => list.length <= 30, message: 'Use 30 keywords or fewer.' },
    },
    canonicalUrl: textField(2048, {
      match: [CANONICAL_PATTERN, 'Use an absolute http(s) URL or a path starting with /.'],
    }),
    ogImage: urlField(),
    noIndex: { type: Boolean, default: false },
  },
  { _id: false }
);
