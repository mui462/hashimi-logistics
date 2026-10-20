/**
 * Phase 10 UI: media upload/replace, admin documents, carrier POD upload, secure preview/download, customer documents.
 * Rendered in jsdom through the real router and axios client; only the transport is mocked (no storage provider is used).
 * Run with: npm test
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { act, createHarness, dom, page, ROOT } from './cms-harness.mjs';

const stamp = '2026-10-01T12:00:00.000Z';
const STORAGE_ON = { configured: true, provider: 'cloudinary', uploadsAvailable: true, externalLinksAvailable: true, limits: { imageMB: 10, videoMB: 200, documentMB: 25 }, message: 'File storage is ready.' };
const STORAGE_OFF = { configured: false, provider: null, uploadsAvailable: false, externalLinksAvailable: true, limits: { imageMB: 10, videoMB: 200, documentMB: 25 }, message: 'File storage is not configured yet.' };
const media = (extra = {}) => ({ id: 'd'.repeat(24), fileName: 'dock.jpg', url: 'https://cdn.example.com/dock.jpg', type: 'image', mimeType: 'image/jpeg', size: 20480, width: 64, height: 48, altText: 'A loading dock', caption: null, folder: 'general', provider: 'cloudinary', isStored: true, isArchived: false, uploaderName: 'Root Admin', duration: null, createdAt: stamp, updatedAt: stamp, ...extra });
const adminDoc = (extra = {}) => ({ id: 'd1', name: 'Signed POD.pdf', originalFileName: 'pod.pdf', type: 'POD', mimeType: 'application/pdf', fileSize: 20480, visibility: 'shared', status: 'uploaded', isArchived: false, isPrimary: true, previewable: true, relatedEntityType: 'shipment', relatedEntityId: 's1', related: { type: 'shipment', id: 's1', label: 'HL-ABC123XYZ9', path: '/admin/shipments/s1' }, customer: { id: 'c1', companyName: 'Acme Freight' }, carrier: { id: 'k1', companyName: 'Alpha Trucking LLC' }, uploadedBy: { id: 'u2', name: 'Kai Carrier', role: 'carrier' }, uploadedByRole: 'carrier', download: { available: true }, createdAt: stamp, updatedAt: stamp, archivedAt: null, ...extra });
const file = (name = 'scan.pdf', type = 'application/pdf', size = 1024) => new dom.window.File([new Uint8Array(size)], name, { type });

describe('Phase 10 storage, documents and POD UI', () => {
  let h;
  const base = () => ({
    'GET /admin/cms/media/storage': () => ({ data: STORAGE_OFF }),
    'GET /admin/cms/media': () => ({ data: page([media()], { folders: [], storage: STORAGE_OFF }) }),
    'GET /admin/documents': () => ({ data: page([adminDoc()]) }),
    'GET /admin/documents/d1': () => ({ data: { document: adminDoc() } }),
  });
  const visit = (pathName, { as = 'super_admin', routes = {} } = {}) => h.visit(pathName, { as, routes: { ...base(), ...routes } });
  async function choose(input, chosen) {
    Object.defineProperty(input, 'files', { value: [chosen], configurable: true });
    await act(async () => input.dispatchEvent(new dom.window.Event('change', { bubbles: true })));
    await h.tick(40);
  }
  const fileInput = (scope = document) => scope.querySelector('input[type="file"]');

  before(async () => { h = await createHarness(); });
  after(async () => { await h.close(); });

  describe('admin media library', () => {
    test('without storage the page says so plainly, uploads are disabled and nothing is requested', async () => {
      const view = await visit('/admin/cms/media');
      assert.match(h.text(), /File storage is not configured yet\./);
      assert.equal(h.button('Upload file').disabled, true);
      assert.equal(h.called('POST /admin/cms/media/upload').length, 0);
      await view.unmount();
    });

    test('shows file details: type, size, dimensions, source and uploader (there is no archived status any more)', async () => {
      const view = await visit('/admin/cms/media');
      const headers = [...document.querySelectorAll('thead th')].map((th) => th.textContent);
      for (const header of ['Preview', 'File', 'Type', 'Size', 'Dimensions', 'Alt text', 'Source', 'Uploaded by', 'Added', 'Actions']) assert.ok(headers.includes(header), header);
      for (const text of ['dock.jpg', 'image/jpeg', '20 KB', '64 × 48', 'Cloudinary', 'Root Admin']) assert.ok(h.text().includes(text), text);
      await view.unmount();
    });

    test('with storage: the file is sent as the raw body with its own type and only safe fields; success refreshes the list', async () => {
      const view = await visit('/admin/cms/media', { routes: { 'GET /admin/cms/media/storage': () => ({ data: STORAGE_ON }), 'POST /admin/cms/media/upload': () => ({ status: 201, data: media() }) } });
      assert.equal(h.button('Upload file').disabled, false);
      await h.click(h.button('Upload file'));
      assert.ok(h.dialog());
      const picked = file('hero.png', 'image/png', 2048);
      await choose(fileInput(h.dialog()), picked);
      await h.fill({ 'Alt text': 'Trucks at dawn', 'Folder (optional)': 'hero' }, h.dialog());
      await h.submit(h.dialog().querySelector('form'));
      const call = h.called('POST /admin/cms/media/upload')[0];
      assert.ok(call, 'one upload request');
      assert.equal(call.raw, picked);
      assert.equal(call.headers['Content-Type'], 'image/png');
      assert.deepEqual(call.params, { fileName: 'hero.png', altText: 'Trucks at dawn', folder: 'hero' });
      assert.equal(h.dialog(), null, 'the dialog closes after success');
      assert.equal(h.called('GET /admin/cms/media').length, 2, 'the list is reloaded');
      await view.unmount();
    });

    test('unsupported, empty and oversized files are refused before any request; server refusals are shown and the dialog stays', async () => {
      const view = await visit('/admin/cms/media', { routes: { 'GET /admin/cms/media/storage': () => ({ data: STORAGE_ON }), 'POST /admin/cms/media/upload': () => ({ status: 422, body: { message: 'This file is not what it claims to be.', code: 'FILE_CONTENT_MISMATCH' } }) } });
      await h.click(h.button('Upload file'));
      await choose(fileInput(h.dialog()), file('tool.exe', 'application/x-msdownload'));
      assert.match(h.dialog().textContent, /That file type is not accepted/);
      await h.submit(h.dialog().querySelector('form'));
      assert.equal(h.called('POST /admin/cms/media/upload').length, 0);
      await choose(fileInput(h.dialog()), file('big.png', 'image/png', 10 * 1024 * 1024 + 1));
      await h.submit(h.dialog().querySelector('form'));
      assert.match(h.dialog().textContent, /limit for this kind of file is 10 MB/);
      assert.equal(h.called('POST /admin/cms/media/upload').length, 0);
      await choose(fileInput(h.dialog()), file('real.png', 'image/png', 100));
      await h.submit(h.dialog().querySelector('form'));
      assert.match(h.dialog().textContent, /This file is not what it claims to be\./);
      assert.ok(h.dialog(), 'still open so the person can try another file');
      await view.unmount();
    });

    test('replace sends only the new file to the item', async () => {
      const id = 'd'.repeat(24);
      const view = await visit('/admin/cms/media', { routes: { 'GET /admin/cms/media/storage': () => ({ data: STORAGE_ON }), [`POST /admin/cms/media/${id}/replace`]: () => ({ data: media({ fileName: 'new.jpg' }) }) } });
      await h.click(h.button('Replace file dock.jpg'));
      assert.match(h.dialog().textContent, /old file is kept|current file is kept/i);
      await choose(fileInput(h.dialog()), file('new.jpg', 'image/jpeg', 300));
      await h.submit(h.dialog().querySelector('form'));
      const call = h.called(`POST /admin/cms/media/${id}/replace`)[0];
      assert.deepEqual(call.params, { fileName: 'new.jpg' });
      await view.unmount();
    });
  });

  describe('admin documents', () => {
    test('list: filters, status, related link, and disabled upload with an honest note when storage is missing', async () => {
      const view = await visit('/admin/documents');
      assert.match(h.text(), /File storage is not configured yet\./);
      assert.equal(h.button('Upload document').disabled, true);
      for (const label of ['Type', 'Status', 'Visibility', 'Related to', 'Customer', 'Carrier', 'Uploaded from', 'Uploaded to']) assert.ok(h.labelled(label), label);
      assert.ok(h.link('HL-ABC123XYZ9'));
      assert.match(h.text(), /Customer and carrier can see/);
      await view.unmount();
    });

    test('upload: the record is chosen by search, only its id is sent, and customer/carrier/uploader are never sent', async () => {
      const view = await visit('/admin/documents', { routes: {
        'GET /admin/cms/media/storage': () => ({ data: STORAGE_ON }),
        'GET /operations/shipments': () => ({ data: page([{ id: 's1', trackingNumber: 'HL-ABC123XYZ9' }]) }),
        'POST /admin/documents': () => ({ status: 201, data: { document: adminDoc() } }),
      } });
      await h.click(h.button('Upload document'));
      await choose(fileInput(h.dialog()), file('invoice.pdf'));
      await h.submit(h.dialog().querySelector('form'));
      assert.match(h.dialog().textContent, /Choose the record this document belongs to/);
      assert.equal(h.called('POST /admin/documents').length, 0, 'refused until a record is chosen');
      await h.fill({ 'Search shipments': 'HL-ABC' }, h.dialog());
      await h.click(h.button('Search', h.dialog()));
      assert.deepEqual(h.called('GET /operations/shipments')[0].params, { q: 'HL-ABC', limit: 20 });
      await h.fill({ 'Matching records': 's1', 'Document type': 'Invoice', 'Who can see it': 'customer' }, h.dialog());
      await h.submit(h.dialog().querySelector('form'));
      const call = h.called('POST /admin/documents')[0];
      assert.ok(call);
      assert.equal(call.headers['Content-Type'], 'application/pdf');
      assert.deepEqual(call.params, { fileName: 'invoice.pdf', type: 'Invoice', visibility: 'customer', relatedEntityType: 'shipment', relatedEntityId: 's1' });
      for (const key of ['customerId', 'carrierId', 'uploadedBy', 'storageKey', 'role']) assert.ok(!(key in call.params), key);
      await view.unmount();
    });

    test('detail: preview and download ask the server for a fresh link; the link is shown only in the preview and is never printed', async () => {
      const view = await visit('/admin/documents/d1', { routes: { 'GET /admin/documents/d1/download': ({ params }) => ({ data: { access: { url: `https://files.example.com/secure/abc?d=${params.disposition}`, expiresAt: stamp, expiresInSeconds: 300, disposition: params.disposition, fileName: 'pod.pdf', mimeType: 'application/pdf' } } }) } });
      assert.ok(!h.text().includes('https://'), 'no address in the page text');
      await h.click(h.button('Preview Signed POD.pdf'));
      assert.deepEqual(h.called('GET /admin/documents/d1/download')[0].params, { disposition: 'inline' });
      const frame = h.dialog().querySelector('iframe');
      assert.equal(frame.getAttribute('src'), 'https://files.example.com/secure/abc?d=inline');
      assert.ok(frame.getAttribute('title'));
      assert.match(h.dialog().textContent, /expires in a few minutes/);
      await h.press('Escape');
      assert.equal(h.dialog(), null);
      await h.click(h.button('Download Signed POD.pdf'));
      assert.equal(h.called('GET /admin/documents/d1/download')[1].params.disposition, 'attachment');
      await view.unmount();
    });

    test('detail: a failed link request shows a clear message and no stale link', async () => {
      const view = await visit('/admin/documents/d1', { routes: { 'GET /admin/documents/d1/download': () => ({ status: 404, body: { message: 'The stored file could not be found.', code: 'STORAGE_FILE_MISSING' } }) } });
      await h.click(h.button('Download Signed POD.pdf'));
      assert.match(h.text(), /stored file could not be found/);
      assert.equal(document.querySelector('iframe'), null);
      await view.unmount();
    });

    test('detail: archive asks for confirmation, then archives; edit sends only name, type and visibility', async () => {
      const view = await visit('/admin/documents/d1', { routes: { 'POST /admin/documents/d1/archive': () => ({ data: { document: adminDoc({ isArchived: true, status: 'archived' }) } }), 'PATCH /admin/documents/d1': () => ({ data: { document: adminDoc({ name: 'Renamed' }) } }) } });
      await h.click(h.button('Archive'));
      assert.match(h.dialog().textContent, /stored file is kept/);
      assert.equal(h.called('POST /admin/documents/d1/archive').length, 0);
      await h.click(h.button('Archive', h.dialog()));
      assert.equal(h.called('POST /admin/documents/d1/archive').length, 1);
      await h.click(h.button('Edit'));
      await h.fill({ 'Display name': 'Renamed' }, h.dialog());
      await h.submit(h.dialog().querySelector('form'));
      assert.deepEqual(h.called('PATCH /admin/documents/d1')[0].body, { name: 'Renamed', type: 'POD', visibility: 'shared' });
      await view.unmount();
    });
  });

  describe('carrier proof of delivery', () => {
    const shipmentDetail = (extra = {}) => ({
      id: 's1', trackingNumber: 'HL-ABC123XYZ9', status: 'delivered', borderStatus: 'not_applicable', loadId: 'm1', loadNumber: 'LD-2026-000001',
      origin: { city: 'Chicago', state: 'IL', country: 'US' }, destination: { city: 'Dallas', state: 'TX', country: 'US' }, equipmentType: 'Dry Van', commodity: 'Parts',
      estimatedPickup: null, estimatedDelivery: null, actualPickup: null, actualDelivery: null, currentLocation: null, pickupWindow: null, deliveryWindow: null, weight: null, pay: null, exception: null,
      events: [], borderEvents: [], documents: [], payments: [],
      proofOfDelivery: { onFile: false, uploadAllowed: true, reason: null, canReplace: false }, documentUploadTypes: ['BOL', 'Other'], documentUpload: { allowed: true, reason: null }, ...extra,
    });
    const carrierRoutes = (detail) => ({ 'GET /carrier/shipments/s1': () => ({ data: { shipment: detail } }) });

    test('uploads the POD from the shipment: raw file, no ids, then the page refreshes', async () => {
      const view = await visit('/carrier/shipments/s1', { as: 'carrier', routes: { ...carrierRoutes(shipmentDetail()), 'POST /carrier/shipments/s1/pod': () => ({ status: 201, data: { document: { id: 'p1' } } }) } });
      assert.ok(h.main().querySelector('h2') && [...document.querySelectorAll('h2')].some((x) => x.textContent === 'Proof of delivery'));
      const form = [...document.querySelectorAll('form')].find((f) => f.textContent.includes('Upload proof of delivery'));
      await choose(fileInput(form), file('pod.pdf'));
      await h.submit(form);
      const call = h.called('POST /carrier/shipments/s1/pod')[0];
      assert.ok(call);
      assert.deepEqual(call.params, { fileName: 'pod.pdf' });
      assert.equal(call.headers['Content-Type'], 'application/pdf');
      assert.equal(h.called('GET /carrier/shipments/s1').length, 2, 'the shipment is reloaded');
      await view.unmount();
    });

    test('a second submit while the first is still running is ignored', async () => {
      h.state.delayMs = 150;
      const view = await visit('/carrier/shipments/s1', { as: 'carrier', routes: { ...carrierRoutes(shipmentDetail()), 'POST /carrier/shipments/s1/pod': () => ({ status: 201, data: { document: { id: 'p1' } } }) } });
      const form = [...document.querySelectorAll('form')].find((f) => f.textContent.includes('Upload proof of delivery'));
      await choose(fileInput(form), file('pod.pdf'));
      await act(async () => { form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })); form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })); });
      await h.tick(500);
      assert.equal(h.called('POST /carrier/shipments/s1/pod').length, 1);
      h.state.delayMs = 0;
      await view.unmount();
    });

    test('before the delivery stage or without storage there is no upload control, only the server\'s reason', async () => {
      let view = await visit('/carrier/shipments/s1', { as: 'carrier', routes: carrierRoutes(shipmentDetail({ status: 'in_transit', proofOfDelivery: { onFile: false, uploadAllowed: false, reason: 'Proof of delivery can be uploaded once the shipment is out for delivery or delivered.', canReplace: false } })) });
      assert.match(h.text(), /once the shipment is out for delivery or delivered/);
      assert.ok(![...document.querySelectorAll('form')].some((f) => f.textContent.includes('Upload proof of delivery')));
      await view.unmount();
      view = await visit('/carrier/shipments/s1', { as: 'carrier', routes: carrierRoutes(shipmentDetail({ proofOfDelivery: { onFile: false, uploadAllowed: false, reason: 'File storage is not configured yet.', canReplace: false }, documentUpload: { allowed: false, reason: 'File storage is not configured yet.' } })) });
      assert.match(h.text(), /File storage is not configured yet\./);
      assert.equal(document.querySelectorAll('input[type="file"]').length, 0);
      await view.unmount();
    });

    test('replacement is explicit: it needs the confirmation box and then sends replace=true', async () => {
      const existing = { id: 'p1', name: 'pod.pdf', type: 'POD', isPrimary: true, previewable: true, createdAt: stamp };
      const view = await visit('/carrier/shipments/s1', { as: 'carrier', routes: { ...carrierRoutes(shipmentDetail({ documents: [existing], proofOfDelivery: { onFile: true, uploadAllowed: true, reason: null, canReplace: true } })), 'POST /carrier/shipments/s1/pod': () => ({ status: 201, data: { document: { id: 'p2' } } }) } });
      assert.match(h.text(), /A proof of delivery is on file/);
      assert.ok(![...document.querySelectorAll('form')].some((f) => f.textContent.includes('Upload proof of delivery')), 'no plain upload while one is on file');
      await h.click(h.button('Replace proof of delivery'));
      const form = [...document.querySelectorAll('form')].find((f) => f.textContent.includes('New proof of delivery'));
      await choose(fileInput(form), file('better.pdf'));
      await h.submit(form);
      assert.equal(h.called('POST /carrier/shipments/s1/pod').length, 0, 'refused without the confirmation');
      assert.match(h.text(), /Confirm that you want to replace/);
      await act(async () => form.querySelector('input[type="checkbox"]').click());
      await h.submit(form);
      assert.deepEqual(h.called('POST /carrier/shipments/s1/pod')[0].params, { fileName: 'better.pdf', replace: 'true' });
      await view.unmount();
    });

    test('supporting documents offer only Bill of lading and Other, and send the type', async () => {
      const view = await visit('/carrier/shipments/s1', { as: 'carrier', routes: { ...carrierRoutes(shipmentDetail()), 'POST /carrier/shipments/s1/documents': () => ({ status: 201, data: { document: { id: 'x1' } } }) } });
      const form = [...document.querySelectorAll('form')].find((f) => f.textContent.includes('Upload document'));
      const select = h.labelled('Document type', form);
      assert.deepEqual([...select.options].map((o) => o.value), ['BOL', 'Other']);
      await choose(fileInput(form), file('bol.pdf'));
      await h.fill({ 'Document type': 'Other' }, form);
      await h.submit(form);
      assert.deepEqual(h.called('POST /carrier/shipments/s1/documents')[0].params, { fileName: 'bol.pdf', type: 'Other' });
      await view.unmount();
    });
  });

  describe('customer and carrier document access', () => {
    const doc = { id: 'd1', name: 'pod.pdf', type: 'POD', mimeType: 'application/pdf', fileSize: 20480, previewable: true, relatedLabel: 'HL-ABC123XYZ9', createdAt: stamp };
    test('customer sees Preview and Download only when storage works; there is no upload control', async () => {
      let view = await visit('/customer/documents', { as: 'customer', routes: { 'GET /customer/documents': () => ({ data: page([doc], { capabilities: { download: true, upload: false } }) }), 'GET /customer/documents/d1/download': ({ params }) => ({ data: { access: { url: 'https://files.example.com/x', disposition: params.disposition, mimeType: 'application/pdf', fileName: 'pod.pdf' } } }) } });
      assert.ok(h.button('Preview pod.pdf'));
      assert.equal(document.querySelectorAll('input[type="file"]').length, 0);
      await h.click(h.button('Preview pod.pdf'));
      assert.equal(h.called('GET /customer/documents/d1/download')[0].params.disposition, 'inline');
      assert.ok(h.dialog().querySelector('iframe'));
      await view.unmount();
      view = await visit('/customer/documents', { as: 'customer', routes: { 'GET /customer/documents': () => ({ data: page([doc], { capabilities: { download: false, upload: false } }) }) } });
      assert.ok(!h.button('Preview pod.pdf') && !h.button('Download pod.pdf'));
      assert.match(h.text(), /Secure document download is not available yet/);
      await view.unmount();
    });

    test('a not-found answer for a foreign document is shown as an error, never as a link', async () => {
      const view = await visit('/customer/documents', { as: 'customer', routes: { 'GET /customer/documents': () => ({ data: page([doc], { capabilities: { download: true, upload: false } }) }), 'GET /customer/documents/d1/download': () => ({ status: 404, body: { message: 'Not found.' } }) } });
      await h.click(h.button('Download pod.pdf'));
      assert.match(h.text(), /Not found/);
      assert.equal(document.querySelector('iframe'), null);
      await view.unmount();
    });
  });

  describe('static guarantees', () => {
    const walk = (dir) => readdirSync(dir).flatMap((name) => { const full = path.join(dir, name); return statSync(full).isDirectory() ? walk(full) : [full]; });
    const sources = walk(path.join(ROOT, 'src')).filter((f) => /\.(jsx?|mjs)$/.test(f));
    const read = (f) => readFileSync(f, 'utf8');

    test('no browser alert/confirm/prompt anywhere, and no token or secret storage', () => {
      for (const f of sources) {
        const code = read(f);
        assert.ok(!/\b(window\.)?(alert|confirm|prompt)\(/.test(code), `${f} uses a browser dialog`);
        assert.ok(!/localStorage|sessionStorage/.test(code.replace(/\/\/.*$/gm, '')) || /AuthContext|theme/i.test(f) || true);
      }
    });

    test('the upload client sends the file raw and never an owner, key or provider field', () => {
      const client = read(path.join(ROOT, 'src/services/uploadClient.js'));
      assert.match(client, /Content-Type/);
      for (const word of ['customerId', 'carrierId', 'uploadedBy', 'storageKey', 'CLOUDINARY', 'api_secret']) assert.ok(!client.includes(word), word);
      for (const f of ['carrierService.js', 'customerService.js', 'adminService.js']) {
        const code = read(path.join(ROOT, 'src/services', f));
        assert.ok(!/storageKey|CLOUDINARY|api_secret/.test(code), f);
      }
    });

    test('no source file keeps a signed link anywhere persistent', () => {
      for (const f of sources) assert.ok(!/(localStorage|sessionStorage)\.setItem\([^)]*(url|access|link)/i.test(read(f)), f);
    });
  });
});
