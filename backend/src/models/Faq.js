import mongoose from 'mongoose';
import { createSchema } from './createSchema.js';
import { FAQ_CATEGORIES } from './enums.js';
import { requiredText } from './helpers/fields.js';
import { softDeletePlugin } from './plugins/softDelete.plugin.js';

const faqSchema = createSchema(
  {
    question: requiredText(300, 'Question'),
    answer: requiredText(5000, 'Answer'),
    category: { type: String, enum: FAQ_CATEGORIES, default: 'General' },
    displayOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { collection: 'faqs' }
);

faqSchema.plugin(softDeletePlugin);

faqSchema.index({ isActive: 1, category: 1, displayOrder: 1 });
faqSchema.index({ archivedAt: 1, isActive: 1, displayOrder: 1 });

export const Faq = mongoose.model('Faq', faqSchema);
