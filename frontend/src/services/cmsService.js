import { fetchContent, fetchContentOrNull } from './contentService';

// Public CMS reads (Phase 9). Each function maps to one GET /content/* endpoint.
export const getSiteSettings = () => fetchContent('/site-settings');
export const getHomepageContent = () => fetchContent('/homepage');
export const getSeoIndex = () => fetchContent('/seo');
export const getCmsPage = (slug) => fetchContentOrNull(`/pages/${encodeURIComponent(slug)}`);
export const listCmsServices = () => fetchContent('/services');
export const getCmsService = (slug) => fetchContentOrNull(`/services/${encodeURIComponent(slug)}`);
export const listCmsIndustries = () => fetchContent('/industries');
export const getCmsIndustry = (slug) => fetchContentOrNull(`/industries/${encodeURIComponent(slug)}`);
export const listCmsServiceAreas = () => fetchContent('/service-areas');
export const listCmsFaqs = () => fetchContent('/faqs');
export const listCmsTestimonials = () => fetchContent('/testimonials');
