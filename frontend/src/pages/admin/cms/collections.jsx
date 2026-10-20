import { useEffect, useState } from 'react';
import { ICON_NAMES } from '../../../components/common/IconByName';
import * as admin from '../../../services/adminService';
import { CmsButton, CmsList, CmsMedia, CmsSelect, CmsSeo, CmsText, CmsTextArea, CmsToggle } from '../../../components/admin/cms/CmsFields';
import { buttonBody, buttonValue, mediaBody, mediaValue, seoBody, seoValue, str, trimmed } from '../../../components/admin/cms/useCmsForm';

/**
 * One description per managed collection. The generic list and editor pages read everything from here, so a service, an
 * industry, a service area, an FAQ and a testimonial all share the same behaviour (search, paging, archive, reorder).
 * `build()` returns only fields the API allows; ids, roles and statuses are never part of it.
 */
const COUNTRY_OPTIONS = [{ value: 'US', label: 'United States' }, { value: 'CA', label: 'Canada' }, { value: 'MX', label: 'Mexico' }];
const COVERAGE_OPTIONS = [{ value: 'domestic', label: 'Domestic' }, { value: 'cross_border', label: 'Cross-border' }, { value: 'both', label: 'Domestic and cross-border' }];
const FAQ_OPTIONS = ['Shippers', 'Carriers', 'Quotes', 'Tracking', 'Cross-Border', 'General'].map((value) => ({ value, label: value }));
const lines = (list) => (list ?? []).map(str);
const cleanLines = (list) => (list ?? []).map((line) => line.trim()).filter(Boolean);
const need = (found, values, key, message) => { if (!trimmed(values[key])) found[key] = message; };

function AreaPicker({ form }) {
  const [areas, setAreas] = useState({ loading: true, items: [], failed: false });
  useEffect(() => {
    let current = true;
    admin.listCmsServiceAreas({ archived: 'false', limit: 100 }).then(
      (data) => current && setAreas({ loading: false, items: data.items, failed: false }),
      () => current && setAreas({ loading: false, items: [], failed: true })
    );
    return () => { current = false; };
  }, []);
  const chosen = form.get('serviceAreaIds') ?? [];
  const toggle = (id) => form.set('serviceAreaIds', chosen.includes(id) ? chosen.filter((value) => value !== id) : [...chosen, id]);
  return (
    <fieldset className="space-y-2">
      <legend className="text-base font-semibold">Where this service is offered</legend>
      {areas.loading && <p role="status" className="text-base text-steel-600">Loading service areas…</p>}
      {areas.failed && <p className="text-base text-danger-700">Service areas could not be loaded.</p>}
      {!areas.loading && !areas.failed && areas.items.length === 0 && <p className="text-base text-steel-600">Add service areas first, then choose them here.</p>}
      <div className="grid gap-1 sm:grid-cols-2">
        {areas.items.map((area) => (
          <label key={area.id} className="flex min-h-11 items-center gap-3 text-base">
            <input type="checkbox" className="h-5 w-5" checked={chosen.includes(area.id)} onChange={() => toggle(area.id)} />
            <span>{area.name} ({area.country})</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

const slugField = (form, isNew) => (
  <CmsText form={form} name="slug" label="Web address" hint={isNew ? 'Optional. Created from the title when left empty. Lowercase letters, numbers and hyphens.' : 'Changing this on live content breaks existing links, so you will be asked to confirm.'} maxLength={160} />
);
const visibility = (form, extra) => (
  <div className="space-y-1">
    <CmsToggle form={form} name="isActive" label="Visible on the website" hint="Turn this off to hide it without deleting it." />
    {extra}
  </div>
);
const withSlug = (values, { isNew, original }) => (isNew ? (trimmed(values.slug) ? { slug: trimmed(values.slug) } : {}) : trimmed(values.slug) && trimmed(values.slug) !== original?.slug ? { slug: trimmed(values.slug) } : {});

export const COLLECTIONS = {
  services: {
    title: 'Services', singular: 'service', path: 'services', nameKey: 'name', hasSlug: true, filters: ['featured'],
    api: { list: admin.listCmsServices, get: admin.getCmsService, create: admin.createCmsService, save: admin.saveCmsService, archive: admin.archiveCmsService, restore: admin.restoreCmsService, reorder: admin.reorderCmsServices },
    emptyHint: 'Add the freight services you offer. Until you add one, the website shows its built-in services.',
    blank: () => ({ name: '', slug: '', shortDescription: '', fullDescription: '', icon: '', image: null, heroImage: null, benefits: [], features: [], serviceAreaIds: [], cta: buttonValue(), isFeatured: false, isActive: true, SEO: seoValue() }),
    initial: (item) => ({ name: str(item.name), slug: str(item.slug), shortDescription: str(item.shortDescription), fullDescription: str(item.fullDescription), icon: str(item.icon), image: mediaValue(item.image), heroImage: mediaValue(item.heroImage), benefits: lines(item.benefits), features: lines(item.features), serviceAreaIds: item.serviceAreaIds ?? [], cta: buttonValue(item.cta), isFeatured: Boolean(item.isFeatured), isActive: item.isActive !== false, SEO: seoValue(item.SEO) }),
    build: (v, ctx) => ({ name: trimmed(v.name), ...withSlug(v, ctx), shortDescription: trimmed(v.shortDescription), fullDescription: trimmed(v.fullDescription), icon: trimmed(v.icon), image: mediaBody(v.image), heroImage: mediaBody(v.heroImage), benefits: cleanLines(v.benefits), features: cleanLines(v.features), serviceAreaIds: v.serviceAreaIds, cta: buttonBody(v.cta), isFeatured: v.isFeatured, isActive: v.isActive, SEO: seoBody(v.SEO) }),
    validate: (v) => { const f = {}; need(f, v, 'name', 'Enter the service name.'); return f; },
    Fields: ({ form, isNew }) => (
      <>
        <CmsText form={form} name="name" label="Service name" maxLength={150} />
        {slugField(form, isNew)}
        <CmsTextArea form={form} name="shortDescription" label="Short description" hint="Shown on service cards." rows={3} maxLength={400} />
        <CmsTextArea form={form} name="fullDescription" label="Full description" hint="Plain text. Blank lines start a new paragraph." rows={8} maxLength={50000} />
        <CmsText form={form} name="icon" label="Icon name" hint={`Optional. One of: ${ICON_NAMES.join(", ")}.`} maxLength={60} />
        <CmsMedia form={form} name="image" label="Card image" />
        <CmsMedia form={form} name="heroImage" label="Page banner image" />
        <CmsList form={form} name="benefits" label="Benefit" addLabel="Add a benefit" />
        <CmsList form={form} name="features" label="Feature" addLabel="Add a feature" />
        <AreaPicker form={form} />
        <CmsButton form={form} name="cta" label="Page button (optional)" />
        {visibility(form, <CmsToggle form={form} name="isFeatured" label="Featured" hint="Featured services are shown first on the homepage." />)}
      </>
    ),
    columns: (item) => ({ name: item.name, secondary: item.shortDescription }),
  },
  industries: {
    title: 'Industries', singular: 'industry', path: 'industries', nameKey: 'name', hasSlug: true, filters: [],
    api: { list: admin.listCmsIndustries, get: admin.getCmsIndustry, create: admin.createCmsIndustry, save: admin.saveCmsIndustry, archive: admin.archiveCmsIndustry, restore: admin.restoreCmsIndustry, reorder: admin.reorderCmsIndustries },
    emptyHint: 'Add the industries you serve. Until you add one, the website shows its built-in industries.',
    blank: () => ({ name: '', slug: '', shortDescription: '', description: '', icon: '', image: null, benefits: [], cta: buttonValue(), isActive: true, SEO: seoValue() }),
    initial: (item) => ({ name: str(item.name), slug: str(item.slug), shortDescription: str(item.shortDescription), description: str(item.description), icon: str(item.icon), image: mediaValue(item.image), benefits: lines(item.benefits), cta: buttonValue(item.cta), isActive: item.isActive !== false, SEO: seoValue(item.SEO) }),
    build: (v, ctx) => ({ name: trimmed(v.name), ...withSlug(v, ctx), shortDescription: trimmed(v.shortDescription), description: trimmed(v.description), icon: trimmed(v.icon), image: mediaBody(v.image), benefits: cleanLines(v.benefits), cta: buttonBody(v.cta), isActive: v.isActive, SEO: seoBody(v.SEO) }),
    validate: (v) => { const f = {}; need(f, v, 'name', 'Enter the industry name.'); return f; },
    Fields: ({ form, isNew }) => (
      <>
        <CmsText form={form} name="name" label="Industry name" maxLength={150} />
        {slugField(form, isNew)}
        <CmsTextArea form={form} name="shortDescription" label="Short description" rows={3} maxLength={400} />
        <CmsTextArea form={form} name="description" label="Full description" hint="Plain text. Blank lines start a new paragraph." rows={8} maxLength={50000} />
        <CmsText form={form} name="icon" label="Icon name" hint={`Optional. One of: ${ICON_NAMES.join(", ")}.`} maxLength={60} />
        <CmsMedia form={form} name="image" label="Image" />
        <CmsList form={form} name="benefits" label="Benefit" addLabel="Add a benefit" />
        <CmsButton form={form} name="cta" label="Page button (optional)" />
        {visibility(form)}
      </>
    ),
    columns: (item) => ({ name: item.name, secondary: item.shortDescription }),
  },
  'service-areas': {
    title: 'Service areas', singular: 'service area', path: 'service-areas', nameKey: 'name', hasSlug: true, filters: ['country'],
    api: { list: admin.listCmsServiceAreas, get: admin.getCmsServiceArea, create: admin.createCmsServiceArea, save: admin.saveCmsServiceArea, archive: admin.archiveCmsServiceArea, restore: admin.restoreCmsServiceArea, reorder: admin.reorderCmsServiceAreas },
    emptyHint: 'Service is offered in the United States, Canada and Mexico, with cross-border lanes between the U.S. and each neighbour.',
    blank: () => ({ name: '', slug: '', country: 'US', stateProvince: '', cityRegion: '', description: '', image: null, coverageType: 'domestic', isActive: true, SEO: seoValue() }),
    initial: (item) => ({ name: str(item.name), slug: str(item.slug), country: item.country ?? 'US', stateProvince: str(item.stateProvince), cityRegion: str(item.cityRegion), description: str(item.description), image: mediaValue(item.image), coverageType: item.coverageType ?? 'domestic', isActive: item.isActive !== false, SEO: seoValue(item.SEO) }),
    build: (v, ctx) => ({ name: trimmed(v.name), ...withSlug(v, ctx), country: v.country, stateProvince: trimmed(v.stateProvince), cityRegion: trimmed(v.cityRegion), description: trimmed(v.description), image: mediaBody(v.image), coverageType: v.coverageType, isActive: v.isActive, SEO: seoBody(v.SEO) }),
    validate: (v) => { const f = {}; need(f, v, 'name', 'Enter the area name.'); if (!v.country) f.country = 'Choose a country.'; return f; },
    Fields: ({ form, isNew }) => (
      <>
        <CmsText form={form} name="name" label="Area name" maxLength={150} />
        {slugField(form, isNew)}
        <div className="grid gap-4 sm:grid-cols-2">
          <CmsSelect form={form} name="country" label="Country" options={COUNTRY_OPTIONS} />
          <CmsSelect form={form} name="coverageType" label="Coverage" options={COVERAGE_OPTIONS} />
          <CmsText form={form} name="stateProvince" label="State or province" maxLength={80} />
          <CmsText form={form} name="cityRegion" label="City or region" maxLength={120} />
        </div>
        <CmsTextArea form={form} name="description" label="Description" rows={5} maxLength={3000} hint="Cross-border service is U.S. to Canada and U.S. to Mexico only." />
        <CmsMedia form={form} name="image" label="Image" />
        {visibility(form)}
      </>
    ),
    columns: (item) => ({ name: item.name, secondary: [item.cityRegion, item.stateProvince, item.country].filter(Boolean).join(', ') }),
  },
  faqs: {
    title: 'FAQs', singular: 'FAQ', path: 'faqs', nameKey: 'question', hasSlug: false, filters: ['category'],
    api: { list: admin.listCmsFaqs, get: admin.getCmsFaq, create: admin.createCmsFaq, save: admin.saveCmsFaq, archive: admin.archiveCmsFaq, restore: admin.restoreCmsFaq, reorder: admin.reorderCmsFaqs },
    emptyHint: 'Answer the questions shippers and carriers actually ask. Avoid promising delivery times, prices or capacity.',
    blank: () => ({ question: '', answer: '', category: 'General', isActive: true }),
    initial: (item) => ({ question: str(item.question), answer: str(item.answer), category: item.category ?? 'General', isActive: item.isActive !== false }),
    build: (v) => ({ question: trimmed(v.question), answer: trimmed(v.answer), category: v.category, isActive: v.isActive }),
    validate: (v) => { const f = {}; need(f, v, 'question', 'Enter the question.'); need(f, v, 'answer', 'Enter the answer.'); return f; },
    Fields: ({ form }) => (
      <>
        <CmsText form={form} name="question" label="Question" maxLength={300} />
        <CmsTextArea form={form} name="answer" label="Answer" rows={6} maxLength={5000} hint="Plain text. Do not guarantee delivery times, response times, pricing, savings or capacity." />
        <CmsSelect form={form} name="category" label="Category" options={FAQ_OPTIONS} />
        {visibility(form)}
      </>
    ),
    columns: (item) => ({ name: item.question, secondary: item.category }),
  },
  testimonials: {
    title: 'Testimonials', singular: 'testimonial', path: 'testimonials', nameKey: 'customerName', hasSlug: false, filters: ['featured'],
    api: { list: admin.listCmsTestimonials, get: admin.getCmsTestimonial, create: admin.createCmsTestimonial, save: admin.saveCmsTestimonial, archive: admin.archiveCmsTestimonial, restore: admin.restoreCmsTestimonial, reorder: admin.reorderCmsTestimonials },
    emptyHint: 'Only add words a real customer or carrier gave you permission to publish. With none here, the testimonials section stays off the website.',
    blank: () => ({ customerName: '', company: '', position: '', testimonial: '', photo: null, rating: '', isFeatured: false, isActive: true }),
    initial: (item) => ({ customerName: str(item.customerName), company: str(item.company), position: str(item.position), testimonial: str(item.testimonial), photo: mediaValue(item.photo), rating: item.rating ? String(item.rating) : '', isFeatured: Boolean(item.isFeatured), isActive: item.isActive !== false }),
    build: (v) => ({ customerName: trimmed(v.customerName), company: trimmed(v.company), position: trimmed(v.position), testimonial: trimmed(v.testimonial), photo: mediaBody(v.photo), rating: v.rating ? Number(v.rating) : null, isFeatured: v.isFeatured, isActive: v.isActive }),
    validate: (v) => { const f = {}; need(f, v, 'customerName', 'Enter the name.'); need(f, v, 'testimonial', 'Enter the testimonial.'); return f; },
    Fields: ({ form }) => (
      <>
        <p className="rounded-md border border-steel-300 bg-steel-50 p-4 text-base">Publish only real testimonials, with the person’s permission. Never invent a name, company or quote.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <CmsText form={form} name="customerName" label="Name" maxLength={120} />
          <CmsText form={form} name="company" label="Company" maxLength={150} />
          <CmsText form={form} name="position" label="Job title" maxLength={120} />
          <CmsSelect form={form} name="rating" label="Rating" placeholder="No rating shown" options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: `${n} out of 5` }))} />
        </div>
        <CmsTextArea form={form} name="testimonial" label="Testimonial" rows={5} maxLength={2000} />
        <CmsMedia form={form} name="photo" label="Photo (optional)" />
        {visibility(form, <CmsToggle form={form} name="isFeatured" label="Featured" hint="Featured testimonials appear first." />)}
      </>
    ),
    columns: (item) => ({ name: item.customerName, secondary: [item.position, item.company].filter(Boolean).join(', ') || item.testimonial }),
  },
};
export const COLLECTION_EXPORTS = Object.keys(COLLECTIONS);
