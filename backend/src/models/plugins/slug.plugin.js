import { slugify } from '../../utils/slugify.js';

/** Fills `slug` from another field when none was supplied. Uniqueness is enforced by the index. */
export function slugPlugin(schema, { source }) {
  schema.pre('validate', function fillSlug() {
    if (!this.slug && this[source]) {
      this.slug = slugify(this[source]);
    }
  });
}
