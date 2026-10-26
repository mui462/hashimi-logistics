/**
 * schema.org structured data builders and the build-time prerender output. Pure functions: no DOM, no network.
 */
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

describe('structured data', () => {
  let vite;
  let mod;
  before(async () => {
    vite = await createServer({ root: ROOT, logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' });
    mod = await vite.ssrLoadModule('/src/components/seo/JsonLd.jsx');
  });
  after(async () => { await vite.close(); });

  test('emits nothing without a site address', () => {
    assert.deepEqual(mod.buildSiteSchema({ settings: { phone: '555' }, baseUrl: '', siteName: 'Acme' }), []);
  });

  test('Organization and WebSite include only the details that were entered', () => {
    const [org, site] = mod.buildSiteSchema({ settings: {}, baseUrl: 'https://www.example.com', siteName: 'Acme Freight' });
    assert.equal(org['@type'], 'Organization');
    assert.equal(org.name, 'Acme Freight');
    for (const key of ['telephone', 'email', 'address', 'sameAs', 'logo']) assert.ok(!(key in org), `${key} must not be invented`);
    assert.equal(site['@type'], 'WebSite');
    assert.equal(site.publisher['@id'], 'https://www.example.com/#organization');
  });

  test('entered phone, e-mail, address, logo and social profiles are used; non-http social links are dropped', () => {
    const [org] = mod.buildSiteSchema({
      baseUrl: 'https://www.example.com',
      siteName: 'Acme',
      settings: {
        phone: '+1 555 0100', email: 'hi@example.com',
        address: { street: '1 Main St', city: 'Chicago', state: 'IL', zipCode: '60601', country: 'US' },
        logo: { url: '/logo.png' },
        socialLinks: [{ platform: 'linkedin', url: 'https://linkedin.com/company/acme' }, { platform: 'x', url: 'javascript:alert(1)' }],
      },
    });
    assert.equal(org.telephone, '+1 555 0100');
    assert.equal(org.address.addressLocality, 'Chicago');
    assert.equal(org.logo, 'https://www.example.com/logo.png');
    assert.deepEqual(org.sameAs, ['https://linkedin.com/company/acme']);
  });

  test('BlogPosting carries the article fields and nothing missing', () => {
    const [post] = mod.buildArticleSchema({ baseUrl: 'https://www.example.com', path: '/resources/a', article: { title: 'A', excerpt: 'E', publishedAt: '2026-01-01T00:00:00.000Z' } });
    assert.equal(post['@type'], 'BlogPosting');
    assert.equal(post.headline, 'A');
    assert.equal(post.mainEntityOfPage, 'https://www.example.com/resources/a');
    assert.ok(!('author' in post) && !('image' in post));
    assert.deepEqual(mod.buildArticleSchema({ baseUrl: '', path: '/x', article: { title: 'A' } }), []);
  });
});
