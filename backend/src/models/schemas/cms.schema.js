import mongoose from 'mongoose';
import { objectIdRef, requiredText, textField, urlField } from '../helpers/fields.js';

/** An uploaded image or video chosen in the CMS. `mediaId` links back to the Media library. */
export const mediaAssetSchema = new mongoose.Schema(
  {
    url: urlField({ required: [true, 'A file URL is required.'] }),
    altText: textField(200),
    mediaId: objectIdRef('Media'),
  },
  { _id: false }
);

/** Button link. The URL may be absolute or an internal path such as /request-quote. */
export const buttonSchema = new mongoose.Schema(
  {
    label: requiredText(60, 'Button label'),
    url: requiredText(2048, 'Button link'),
  },
  { _id: false }
);

/** A titled block of plain text on a CMS page (optionally with an image). Plain text only: no HTML is stored or rendered. */
export const pageSectionSchema = new mongoose.Schema(
  {
    heading: textField(150),
    body: textField(20000),
    image: mediaAssetSchema,
    displayOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { _id: true }
);

/** A repeatable titled item (why-choose-us points, how-it-works steps). */
export const contentItemSchema = new mongoose.Schema(
  {
    title: requiredText(150, 'Title'),
    description: textField(1000),
    icon: textField(60),
    displayOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { _id: true }
);

/** A trust-strip card: a titled item that can also carry its own background picture. */
export const trustItemSchema = new mongoose.Schema(
  {
    title: requiredText(150, 'Title'),
    description: textField(1000),
    icon: textField(60),
    image: mediaAssetSchema,
    displayOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { _id: true }
);

/** Common header fields for a homepage section. */
export const sectionHeaderFields = () => ({
  title: textField(150),
  subtitle: textField(200),
  description: textField(1500),
  isActive: { type: Boolean, default: true },
});
