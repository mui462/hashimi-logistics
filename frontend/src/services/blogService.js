import { fetchContent, fetchContentOrNull } from './contentService';

// GET /content/blog. Only published posts whose time has come are returned (the server enforces it). The CMS shape is
// adapted to the article shape the Phase 4 components already render.
const toArticle = (post) => ({
  slug: post.slug,
  title: post.title,
  excerpt: post.excerpt,
  category: post.category,
  tags: post.tags ?? [],
  author: post.authorName,
  publishedAt: post.publishedAt,
  featuredImage: post.featuredImage?.url ?? null,
  featuredImageAlt: post.featuredImage?.altText ?? '',
  isFeatured: Boolean(post.isFeatured),
  ...(post.content !== undefined ? { content: post.content, seo: post.seo } : {}),
});

export async function listArticles({ page = 1, search = '', category = '' } = {}) {
  const data = await fetchContent('/blog', { page, limit: 9, q: search.length >= 2 ? search : undefined, category: category || undefined });
  return { items: data.items.map(toArticle), page: data.page ?? page, totalPages: data.totalPages ?? 1, total: data.total ?? data.items.length, categories: data.categories ?? [] };
}

// Returns null when the article does not exist (or is not live yet).
export async function getArticle(slug) {
  const post = await fetchContentOrNull(`/blog/${encodeURIComponent(slug)}`);
  return post ? toArticle(post) : null;
}
