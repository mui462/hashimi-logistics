import mongoose from 'mongoose';
import { createSchema } from './createSchema.js';
import { HOMEPAGE_SECTION_KEYS } from './enums.js';
import { requiredText, textField } from './helpers/fields.js';
import { buttonSchema, contentItemSchema, mediaAssetSchema, sectionHeaderFields, trustItemSchema } from './schemas/cms.schema.js';
import { seoSchema } from './schemas/seo.schema.js';
import { SECTION_ANIMATIONS, SECTION_BACKGROUNDS, SECTION_CARD_STYLES, SECTION_SPACINGS } from '../cms/sectionAppearance.js';

/** Optional look of a section (named presets only). Unset means the section's built-in look. */
const sectionAppearanceSchema = new mongoose.Schema(
  {
    background: { type: String, enum: SECTION_BACKGROUNDS },
    spacing: { type: String, enum: SECTION_SPACINGS },
    animation: { type: String, enum: SECTION_ANIMATIONS },
    cardStyle: { type: String, enum: SECTION_CARD_STYLES },
  },
  { _id: false }
);

// Phase 9 (additive): every section may also carry an image and a call to action.
const section = (extraFields = {}) =>
  new mongoose.Schema({ ...sectionHeaderFields(), image: mediaAssetSchema, button: buttonSchema, appearance: sectionAppearanceSchema, ...extraFields }, { _id: false });

const heroSchema = new mongoose.Schema(
  {
    eyebrow: textField(100),
    title: textField(200),
    subtitle: textField(250),
    description: textField(1500),
    backgroundVideo: mediaAssetSchema,
    fallbackImage: mediaAssetSchema,
    poster: mediaAssetSchema,
    primaryButton: buttonSchema,
    secondaryButton: buttonSchema,
    overlay: new mongoose.Schema(
      {
        color: textField(9, { default: '#000000', match: [/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i, 'Use a hex color.'] }),
        opacity: { type: Number, min: 0, max: 1, default: 0.5 },
        isActive: { type: Boolean, default: true },
      },
      { _id: false }
    ),
    autoplay: { type: Boolean, default: true },
    muted: { type: Boolean, default: true },
    loop: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },
  },
  { _id: false }
);

/** Real values are entered by the Super Admin in the CMS. Nothing is pre-filled. */
const statSchema = new mongoose.Schema(
  {
    label: requiredText(80, 'Label'),
    value: requiredText(40, 'Value'),
    description: textField(200),
    isActive: { type: Boolean, default: true },
    displayOrder: { type: Number, default: 0 },
  },
  { _id: true }
);

/**
 * Singleton (see SiteSettings). Sections that list records (services, industries, testimonials,
 * FAQs, service areas) only store their heading text; the items come from their own collections.
 */
const homepageSchema = createSchema(
  {
    key: { type: String, enum: ['primary'], default: 'primary', unique: true, immutable: true },
    hero: heroSchema,
    // Order of the homepage sections after the hero. Visibility stays on each section (`isActive`).
    sectionOrder: {
      type: [{ type: String, enum: HOMEPAGE_SECTION_KEYS }],
      validate: { validator: (keys) => new Set(keys).size === keys.length, message: 'Each section may appear only once.' },
    },
    trust: section({ items: [trustItemSchema] }),
    statsSection: section(),
    stats: [statSchema],
    // Pictures the Super Admin chose for the built-in service cards, one per service slug.
    servicesSection: section({ cardImages: [new mongoose.Schema({ slug: requiredText(80, 'Service'), image: mediaAssetSchema }, { _id: false })] }),
    whyChooseUs: section({ items: [contentItemSchema] }),
    howItWorks: section({ steps: [contentItemSchema] }),
    // Pictures the Super Admin chose for the built-in industry cards, one per industry slug.
    industries: section({ cardImages: [new mongoose.Schema({ slug: requiredText(80, 'Industry'), image: mediaAssetSchema }, { _id: false })] }),
    crossBorder: section({
      highlights: [textField(200)],
      image: mediaAssetSchema,
      button: buttonSchema,
    }),
    // Pictures the Super Admin chose for the built-in service-area cards, one per area slug.
    serviceAreas: section({ cardImages: [new mongoose.Schema({ slug: requiredText(80, 'Service area'), image: mediaAssetSchema }, { _id: false })] }),
    // Fixed-position homepage blocks (not part of `sectionOrder`): the network map block and the quote form block.
    networkSection: section({ items: [contentItemSchema] }),
    quoteSection: section(),
    testimonials: section(),
    faq: section(),
    finalCTA: section({ primaryButton: buttonSchema, secondaryButton: buttonSchema }),
    SEO: seoSchema,
  },
  { collection: 'homepage' }
);

homepageSchema.static('getPrimary', function getPrimary() {
  return this.findOneAndUpdate(
    { key: 'primary' },
    { $setOnInsert: { key: 'primary' } },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  );
});

export const Homepage = mongoose.model('Homepage', homepageSchema);
