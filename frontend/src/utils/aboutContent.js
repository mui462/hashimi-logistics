import { ABOUT_SLOTS } from '../content/aboutSections';
import { text } from './siteContent';

const norm = (value) => String(value ?? '').toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();
const SLOT_BY_HEADING = new Map(ABOUT_SLOTS.map((slot, index) => [norm(slot.heading), index]));
const isFilled = (section) => Boolean(section && (section.heading || section.body || section.image?.url));

/**
 * Pairs the About page's built-in sections with what the Super Admin saved for the page.
 *
 * The public API only returns the sections that are switched on, in their saved order, so a hidden section simply is not in the
 * list. Each saved section is matched to a slot by its heading (the built-in headings are the anchors); a section whose heading
 * was reworded takes the next free slot between its neighbours. Once a published About page carries these sections, the slots it
 * does not contain are hidden. A page with none of them (or with no CMS page at all) keeps every built-in section, and any
 * unrelated sections the admin wrote earlier are returned in `extra` to be shown as before.
 *
 * Every field falls back to the built-in text when it is empty.
 */
export function resolveAbout(cms) {
  const saved = (cms?.sections ?? []).filter(isFilled);
  const slots = ABOUT_SLOTS.length;
  const anchors = saved.map(() => null);
  let last = -1;
  saved.forEach((section, i) => {
    const slot = SLOT_BY_HEADING.get(norm(section.heading));
    if (slot !== undefined && slot > last) { anchors[i] = slot; last = slot; }
  });
  const customised = anchors.some((slot) => slot !== null) || saved.length >= slots;
  const assigned = Array(slots).fill(null);
  const extra = [];
  if (customised) {
    let cursor = 0;
    saved.forEach((section, i) => {
      if (anchors[i] !== null) { assigned[anchors[i]] = section; cursor = anchors[i] + 1; return; }
      const nextAnchor = anchors.slice(i + 1).find((slot) => slot !== null) ?? slots;
      if (cursor < nextAnchor) { assigned[cursor] = section; cursor += 1; } else extra.push(section);
    });
  } else {
    extra.push(...saved);
  }
  return {
    customised,
    extra,
    slots: ABOUT_SLOTS.map((slot, index) => {
      const own = assigned[index];
      return {
        key: slot.key,
        icon: slot.icon,
        visible: customised ? Boolean(own) : true,
        heading: text(own?.heading, slot.heading),
        body: text(own?.body, slot.body),
        image: own?.image?.url ? own.image : null,
      };
    }),
  };
}

const TITLED = /^([^:\n]{2,60}):\s+([\s\S]+)$/;

/** Splits a section's text into plain introduction paragraphs and "Title: text" items (steps, pillars). */
export function splitItems(body) {
  const paragraphs = String(body ?? '').split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  const intro = [];
  const items = [];
  for (const paragraph of paragraphs) {
    const match = TITLED.exec(paragraph);
    if (match) items.push({ title: match[1].trim(), text: match[2].trim() });
    else intro.push(paragraph);
  }
  return { intro, items };
}

export const paragraphsOf = (body) => String(body ?? '').split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
