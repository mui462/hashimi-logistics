/**
 * Phase 10 tests: storage providers, file validation, media upload, documents, POD, secure access, ownership and leaks.
 *
 *   MONGO_TEST_URI=mongodb://127.0.0.1:27017/hashimi_storage_test npm test
 *
 * No real Cloudinary account is used: the storage service runs against an in-memory test adapter, the Cloudinary driver is
 * exercised with a mock fetch, and the local driver uses a temporary directory. The database name must end in "_test".
 */
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, mock, test } from 'node:test';

const testUri = process.env.MONGO_TEST_URI;
const skipReason = testUri ? false : 'MONGO_TEST_URI is not set; these tests require a live MongoDB';

if (testUri) {
  const databaseName = new URL(testUri).pathname.replace(/^\//, '');
  if (!databaseName.endsWith('_test')) throw new Error(`Refusing to run: database "${databaseName}" must end with "_test" because it is dropped afterwards.`);
  Object.assign(process.env, {
    NODE_ENV: 'development',
    MONGO_URI: testUri,
    JWT_SECRET: 'storage-test-secret-storage-test-secret-1234',
    CLIENT_URL: 'http://localhost:5173',
    AUTH_RATE_LIMIT_MAX: '10000',
    RESET_EMAIL_LIMIT_MAX: '100000',
    UPLOAD_RATE_LIMIT_MAX: '100000',
    QUOTE_IP_LIMIT_MAX: '100000',
    GLOBAL_RATE_LIMIT_MAX: '100000',
    LOGIN_ACCOUNT_LIMIT_MAX: '500',
  });
}

// Keep the developer's real storage settings (backend/.env) out of these tests: dotenv never overrides a variable that
// already exists, and env.js ignores empty values, so every test starts from "no storage configured".
for (const key of ['STORAGE_PROVIDER', 'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET']) process.env[key] = '';

const PASS = 'storage-test-pass-phrase-1';
const MISSING = '000000000000000000000001';

/* ---- tiny but real files (signature + dimensions) ---- */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');
const jpeg = (width = 32, height = 16) => {
  const sof = Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 255, width >> 8, width & 255, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]), sof, Buffer.alloc(64, 1), Buffer.from([0xff, 0xd9])]);
};
const webp = (width = 40, height = 20) => {
  const buffer = Buffer.alloc(40);
  buffer.write('RIFF', 0); buffer.writeUInt32LE(32, 4); buffer.write('WEBP', 8); buffer.write('VP8X', 12); buffer.writeUInt32LE(10, 16);
  buffer.writeUIntLE(width - 1, 24, 3); buffer.writeUIntLE(height - 1, 27, 3);
  return buffer;
};
const mp4 = () => {
  const ftyp = Buffer.from([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 2, 0, 0x69, 0x73, 0x6f, 0x6d, 0x6d, 0x70, 0x34, 0x31]);
  const mvhd = Buffer.alloc(32);
  mvhd.writeUInt32BE(32, 0); mvhd.write('mvhd', 4); mvhd.writeUInt32BE(1000, 20); mvhd.writeUInt32BE(5000, 24);
  return Buffer.concat([ftyp, mvhd, Buffer.alloc(64)]);
};
const webm = () => Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01]), Buffer.from('B\u0082webm'), Buffer.alloc(64)]);

describe('storage and documents (unit)', () => {
  test('file validation accepts real files and reports their metadata', async () => {
    const { inspectFile } = await import('../src/storage/fileValidation.js');
    assert.deepEqual(inspectFile(PNG, { declaredType: 'image/png', fileName: 'logo.png', purpose: 'media' }), { mimeType: 'image/png', kind: 'image', extension: 'png', fileName: 'logo.png', width: 1, height: 1 });
    const j = inspectFile(jpeg(), { declaredType: 'image/jpeg', fileName: 'Photo.JPG', purpose: 'media' });
    assert.deepEqual([j.width, j.height], [32, 16]);
    assert.equal(inspectFile(webp(), { declaredType: 'image/webp', fileName: 'a.webp', purpose: 'media' }).width, 40);
    assert.equal(inspectFile(mp4(), { declaredType: 'video/mp4', fileName: 'hero.mp4', purpose: 'media' }).duration, 5);
    assert.equal(inspectFile(webm(), { declaredType: 'video/webm', fileName: 'hero.webm', purpose: 'media' }).kind, 'video');
    assert.equal(inspectFile(PDF, { declaredType: 'application/pdf', fileName: 'BOL.pdf', purpose: 'document' }).mimeType, 'application/pdf');
  });

  test('file validation refuses executables, scripts, web files, mismatches and unknown types', async () => {
    const { inspectFile } = await import('../src/storage/fileValidation.js');
    const bad = (buffer, declaredType, fileName, purpose, status, code) => {
      assert.throws(() => inspectFile(buffer, { declaredType, fileName, purpose }), (error) => error.statusCode === status && (!code || error.code === code), `${fileName} as ${declaredType}`);
    };
    const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(200)]);
    bad(exe, 'application/pdf', 'invoice.exe', 'document', 415);
    bad(exe, 'application/pdf', 'invoice.pdf', 'document', 422, 'FILE_CONTENT_MISMATCH');
    bad(PNG, 'image/png', 'shell.php', 'media', 415);
    bad(PNG, 'image/png', 'photo.png.php', 'media', 415);
    bad(PNG, 'image/png', 'photo.php.png', 'media', 415);
    bad(PNG, 'image/png', 'run.bat', 'media', 415);
    bad(PNG, 'image/png', 'run.cmd', 'media', 415);
    bad(PNG, 'image/png', 'run.sh', 'media', 415);
    bad(PNG, 'image/png', 'noextension', 'media', 415);
    bad(PNG, 'image/png', 'pic.jpg', 'media', 415); // extension belongs to another type
    bad(Buffer.from('<html><script>alert(1)</script></html>'.padEnd(40)), 'image/png', 'page.png', 'media', 415);
    bad(Buffer.from('<?php system($_GET[1]); ?>'.padEnd(40)), 'image/jpeg', 'x.jpg', 'media', 415);
    bad(Buffer.from('#!/bin/sh\nrm -rf /\n'.padEnd(40)), 'application/pdf', 'x.pdf', 'document', 415);
    bad(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'), 'image/svg+xml', 'x.svg', 'media', 415);
    bad(PNG, 'text/html', 'x.html', 'media', 415);
    bad(PNG, 'application/octet-stream', 'x.bin', 'media', 415);
    bad(PDF, 'application/pdf', 'x.pdf', 'media', 415); // a PDF is a document, not website media
    bad(mp4(), 'video/mp4', 'x.mp4', 'document', 415); // no video as a document
    bad(PNG, 'image/gif', 'x.gif', 'document', 415);
    bad(PNG, 'image/jpeg', 'x.jpg', 'media', 422, 'FILE_CONTENT_MISMATCH'); // PNG bytes declared as JPEG
    bad(Buffer.alloc(0), 'image/png', 'x.png', 'media', 400, 'EMPTY_FILE');
  });

  test('file names are sanitized for display and never used as storage paths', async () => {
    const { sanitizeFileName } = await import('../src/storage/fileValidation.js');
    assert.equal(sanitizeFileName('../../etc/passwd'), 'passwd');
    assert.equal(sanitizeFileName('C:\\Users\\x\\scan 1.pdf'), 'scan 1.pdf');
    assert.ok(!/[<>/\\]/.test(sanitizeFileName('<script>a</script>.png')));
    assert.ok(sanitizeFileName('<script>a</script>.png').endsWith('.png'));
    assert.equal(sanitizeFileName('   '), 'file');
    assert.ok(sanitizeFileName(`${'a'.repeat(400)}.pdf`).length <= 150);
    assert.ok(sanitizeFileName(`${'a'.repeat(400)}.pdf`).endsWith('.pdf'));
  });

  test('the storage service answers 501 STORAGE_NOT_CONFIGURED with nothing configured, and never leaks provider errors', async () => {
    const { storage, setStorageDriverForTests, getStorageStatus } = await import('../src/storage/index.js');
    const { createMemoryDriver } = await import('../src/storage/memory.driver.js');
    setStorageDriverForTests(null);
    assert.equal(getStorageStatus().configured, false);
    assert.equal(getStorageStatus().message.startsWith('File storage is not configured yet.'), true);
    await assert.rejects(() => storage.upload({ buffer: PNG, mimeType: 'image/png', folder: 'x', access: 'public' }), (e) => e.statusCode === 501 && e.code === 'STORAGE_NOT_CONFIGURED');

    const driver = createMemoryDriver();
    setStorageDriverForTests(driver);
    const uploaded = await storage.upload({ buffer: PNG, mimeType: 'image/png', folder: 'x', access: 'private' });
    assert.ok(uploaded.storageKey.startsWith('private/'));
    driver.failNext('upload');
    await assert.rejects(() => storage.upload({ buffer: PNG, mimeType: 'image/png', folder: 'x', access: 'public' }), (e) => e.statusCode === 503 && !JSON.stringify(e).includes('SECRET-PROVIDER-DETAIL') && !e.message.includes('SECRET-PROVIDER-DETAIL'));
    driver.failNext('upload', { code: 'rejected' });
    await assert.rejects(() => storage.upload({ buffer: PNG, mimeType: 'image/png', folder: 'x', access: 'public' }), (e) => e.statusCode === 502 && e.code === 'STORAGE_UPLOAD_FAILED');
    driver.failNext('createSecureAccess', { code: 'not_found' });
    await assert.rejects(() => storage.createSecureAccess(uploaded.storageKey, {}), (e) => e.statusCode === 404 && e.code === 'STORAGE_FILE_MISSING');
    setStorageDriverForTests(null);
  });

  test('the status endpoint payload carries the provider name and limits, never credentials or the account name', async () => {
    const { getStorageStatus, setStorageDriverForTests } = await import('../src/storage/index.js');
    const { createCloudinaryDriver } = await import('../src/storage/cloudinary.driver.js');
    setStorageDriverForTests(createCloudinaryDriver({ cloudName: 'SECRET-CLOUD-NAME', apiKey: 'SECRET-API-KEY', apiSecret: 'SECRET-API-SECRET' }));
    const status = JSON.stringify(getStorageStatus());
    assert.ok(status.includes('"provider":"cloudinary"'));
    for (const secret of ['SECRET-CLOUD-NAME', 'SECRET-API-KEY', 'SECRET-API-SECRET']) assert.ok(!status.includes(secret));
    assert.deepEqual(JSON.parse(status).limits, { imageMB: 10, videoMB: 200, documentMB: 25 });
    setStorageDriverForTests(null);
  });

  describe('Cloudinary driver (mock fetch, no network)', () => {
    const make = async (fetchImpl) => {
      const { createCloudinaryDriver } = await import('../src/storage/cloudinary.driver.js');
      return createCloudinaryDriver({ cloudName: 'demo-cloud', apiKey: '12345', apiSecret: 'topsecretvalue', fetchImpl, now: () => 1_700_000_000_000 });
    };

    test('uploads private documents as "authenticated" with a signed request that never contains the secret', async () => {
      const seen = [];
      const driver = await make(async (url, init) => {
        seen.push({ url, init });
        return new Response(JSON.stringify({ public_id: 'hashimi/private/documents/abc', secure_url: 'https://res.cloudinary.com/demo-cloud/raw/authenticated/v1/hashimi/private/documents/abc.pdf', bytes: 99, version: 1 }), { status: 200 });
      });
      const result = await driver.upload({ buffer: PDF, mimeType: 'application/pdf', fileName: 'bol.pdf', folder: 'documents', access: 'private' });
      assert.equal(seen[0].url, 'https://api.cloudinary.com/v1_1/demo-cloud/raw/upload');
      const form = seen[0].init.body;
      assert.equal(form.get('type'), 'authenticated');
      assert.equal(form.get('api_key'), '12345');
      assert.match(form.get('public_id'), /^hashimi\/private\/documents\/[0-9a-f-]{36}\.pdf$/);
      assert.match(form.get('signature'), /^[0-9a-f]{40}$/);
      for (const [, value] of form.entries()) assert.ok(typeof value !== 'string' || !value.includes('topsecretvalue'));
      assert.equal(result.storageKey, 'raw:authenticated:hashimi/private/documents/abc');
      assert.equal(result.bytes, 99);
    });

    test('signature follows the Cloudinary algorithm (sorted params + secret, SHA-1)', async () => {
      const { createHash } = await import('node:crypto');
      const driver = await make(async (_url, init) => {
        const form = init.body;
        const expected = createHash('sha1').update(`overwrite=false&public_id=${form.get('public_id')}&timestamp=1700000000&type=upload${'topsecretvalue'}`).digest('hex');
        assert.equal(form.get('signature'), expected);
        return new Response(JSON.stringify({ public_id: 'p', secure_url: 'https://res.cloudinary.com/x/image/upload/p.png', bytes: 1, width: 3, height: 4 }), { status: 200 });
      });
      const out = await driver.upload({ buffer: PNG, mimeType: 'image/png', folder: 'general', access: 'public' });
      assert.deepEqual([out.width, out.height], [3, 4]);
      assert.equal(out.storageKey, 'image:upload:p');
    });

    test('secure access is an expiring signed link for private files, and public files do not get one', async () => {
      const driver = await make(async () => new Response('{}', { status: 200 }));
      const access = await driver.createSecureAccess('image:authenticated:hashimi/private/documents/abc', { expiresInSeconds: 300, disposition: 'attachment', mimeType: 'image/png' });
      const url = new URL(access.url);
      assert.equal(url.origin + url.pathname, 'https://api.cloudinary.com/v1_1/demo-cloud/image/download');
      assert.equal(url.searchParams.get('expires_at'), String(1_700_000_000 + 300));
      assert.equal(url.searchParams.get('format'), 'png');
      assert.equal(url.searchParams.get('attachment'), 'true');
      assert.ok(url.searchParams.get('signature'));
      assert.ok(!access.url.includes('topsecretvalue'));
      assert.equal(access.expiresAt.getTime(), (1_700_000_000 + 300) * 1000);
      await assert.rejects(() => driver.createSecureAccess('image:upload:hashimi/public/x', { expiresInSeconds: 60 }));
    });

    test('provider failures become safe errors and delete/exists call the documented endpoints', async () => {
      const calls = [];
      const driver = await make(async (url, init) => {
        calls.push({ url, method: init?.method ?? 'GET' });
        if (url.includes('/destroy')) return new Response('{"result":"ok"}', { status: 200 });
        if (url.includes('/resources/')) return new Response('{"bytes":10}', { status: url.includes('missing') ? 404 : 200 });
        return new Response('{"error":{"message":"Invalid API secret topsecretvalue"}}', { status: 401 });
      });
      await driver.delete('raw:authenticated:hashimi/private/documents/abc');
      assert.ok(calls[0].url.endsWith('/v1_1/demo-cloud/raw/destroy'));
      assert.equal(await driver.exists('raw:authenticated:hashimi/private/documents/abc'), true);
      assert.equal(await driver.exists('raw:authenticated:hashimi/private/documents/missing'), false);
      await assert.rejects(
        () => driver.upload({ buffer: PNG, mimeType: 'image/png', folder: 'g', access: 'public' }),
        (error) => error.name === 'StorageError' && !error.message.includes('topsecretvalue'),
      );
      const offline = await make(async () => { throw new Error('getaddrinfo ENOTFOUND api.cloudinary.com'); });
      await assert.rejects(() => offline.upload({ buffer: PNG, mimeType: 'image/png', folder: 'g', access: 'public' }), (error) => error.code === 'unavailable');
    });
  });

  describe('local development driver', () => {
    test('stores files privately, serves only through signed expiring tokens, and refuses path tricks', async () => {
      const { createLocalDriver, signAccessToken, verifyAccessToken, isLocalKey } = await import('../src/storage/local.driver.js');
      const dir = await mkdtemp(path.join(os.tmpdir(), 'hl-storage-'));
      try {
        const driver = createLocalDriver({ directory: dir });
        const stored = await driver.upload({ buffer: PDF, mimeType: 'application/pdf', folder: 'documents', access: 'private' });
        assert.ok(isLocalKey(stored.storageKey));
        assert.equal(await driver.exists(stored.storageKey), true);
        assert.equal((await driver.getMetadata(stored.storageKey)).bytes, PDF.length);
        const access = await driver.createSecureAccess(stored.storageKey, { expiresInSeconds: 60, fileName: 'bol.pdf', disposition: 'inline' });
        const token = access.url.split('/f/')[1];
        const payload = verifyAccessToken(token);
        assert.equal(payload.k, stored.storageKey);
        assert.equal(verifyAccessToken(`${token.slice(0, -2)}xx`), null, 'a tampered signature is rejected');
        assert.equal(verifyAccessToken(signAccessToken({ k: stored.storageKey, e: Math.floor(Date.now() / 1000) - 5, d: 'inline', n: 'x' })), null, 'an expired token is rejected');
        for (const key of ['../../etc/passwd', 'private/../../x', '/etc/passwd', 'private/documents/../../../x.pdf']) {
          assert.equal(isLocalKey(key), false, key);
          await assert.rejects(() => driver.exists(key));
        }
        await driver.delete(stored.storageKey);
        assert.equal(await driver.exists(stored.storageKey), false);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
  });
});

describe('storage, media and documents API', { skip: skipReason }, () => {
  let mongoose;
  let server;
  let baseUrl;
  let M;
  let storageIndex;
  let memory;
  let hashPassword;
  const S = {};
  const D = {};

  async function request(method, urlPath, { cookie, headers = {}, body, json } = {}) {
    const response = await fetch(`${baseUrl}/api/v1${urlPath}`, {
      method,
      headers: { ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
      body: json !== undefined ? JSON.stringify(json) : body,
    });
    const text = await response.text();
    const setCookie = response.headers.get('set-cookie');
    let parsed = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { parsed = null; }
    return { status: response.status, text, body: parsed, cookie: setCookie ? setCookie.split(';')[0] : null, headers: response.headers };
  }
  const get = (p, as) => request('GET', p, { cookie: S[as] });
  const send = (method, p, as, json) => request(method, p, { cookie: S[as], json });
  /** The raw upload: file bytes as the body, its type as Content-Type, its details in the query string. */
  const upload = (p, as, buffer, type, query = {}) => {
    const qs = new URLSearchParams(query).toString();
    return request('POST', `${p}${qs ? `?${qs}` : ''}`, { cookie: S[as], headers: { 'Content-Type': type }, body: buffer });
  };
  const ok = (response, status = 200) => {
    assert.equal(response.status, status, response.text.slice(0, 500));
    assert.equal(response.body.success, true);
    return response.body.data;
  };
  const refuse = (response, status, code) => {
    assert.equal(response.status, status, response.text.slice(0, 500));
    assert.equal(response.body.success, false);
    if (code) assert.equal(response.body.code, code, response.text.slice(0, 500));
    return response.body;
  };
  const noInternals = (response, extra = []) => {
    for (const word of ['storageKey', 'fileUrl', 'storage.test', 'topsecret', 'uploadedBy', 'archivedBy', 'passwordHash', ...extra]) assert.ok(!response.text.includes(word), `response leaked "${word}"`);
  };

  async function mkUser(role, email) {
    return M.User.create({ firstName: 'Store', lastName: role, email, role, passwordHash: await hashPassword(PASS), isEmailVerified: true });
  }
  async function login(key, email, loginPath = '/auth/login') {
    const response = await request('POST', loginPath, { json: { email, password: PASS } });
    assert.equal(response.status, 200, response.text);
    S[key] = response.cookie;
  }

  before(async () => {
    const database = await import('../src/config/database.js');
    ({ default: mongoose } = await import('mongoose'));
    const { default: app } = await import('../src/app.js');
    M = await import('../src/models/index.js');
    storageIndex = await import('../src/storage/index.js');
    const { createMemoryDriver } = await import('../src/storage/memory.driver.js');
    ({ hashPassword } = await import('../src/services/password.service.js'));
    memory = createMemoryDriver();
    await database.connectDatabase();
    await mongoose.connection.dropDatabase();
    const results = await Promise.allSettled(Object.values(M.models).map((Model) => Model.init()));
    results.forEach((result) => {
      if (result.status === 'rejected' && !/partialFilterExpression/.test(result.reason?.message ?? '')) throw result.reason;
    });
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    const admin = await mkUser('super_admin', 'store.admin@example.com');
    D.adminId = admin._id;
    const people = {};
    for (const key of ['ca', 'cb']) {
      const user = await mkUser('customer', `store.${key}@example.com`);
      people[key] = { user, customer: await M.Customer.create({ userId: user._id, companyName: `Customer ${key.toUpperCase()} Inc`, status: 'active' }) };
    }
    for (const key of ['ka', 'kb']) {
      const user = await mkUser('carrier', `store.${key}@example.com`);
      people[key] = { user, carrier: await M.Carrier.create({ userId: user._id, companyName: `Carrier ${key.toUpperCase()} LLC`, status: 'active', authorityStatus: 'active', complianceStatus: 'approved', MCNumber: `MC-${key}`, DOTNumber: `DOT-${key}`, equipmentTypes: ['Dry Van'], operatingRegions: ['Nationwide'] }) };
    }
    D.people = people;
    await login('admin', 'store.admin@example.com', '/auth/admin/login');
    for (const key of ['ca', 'cb', 'ka', 'kb']) await login(key, `store.${key}@example.com`);

    let n = 0;
    const mkShipment = async (customerKey, carrierKey, status, extra = {}) => {
      n += 1;
      const customerId = people[customerKey].customer._id;
      const carrierId = people[carrierKey].carrier._id;
      const load = await M.Load.create({ loadNumber: `LD-ST-${n}`, customerId, carrierId, origin: { city: 'Chicago', state: 'IL', country: 'US' }, destination: { city: 'Dallas', state: 'TX', country: 'US' }, commodity: 'Parts', equipmentType: 'Dry Van', rate: 245000, carrierRate: 180000, brokerMargin: 65000, status: 'in_transit' });
      const shipment = await M.Shipment.create({ trackingNumber: `HL-ST${String(n).padStart(6, '0')}`, loadId: load._id, customerId, carrierId, status, ...extra });
      return { load, shipment };
    };
    D.delivered = await mkShipment('ca', 'ka', 'delivered'); // customer A / carrier A
    D.transit = await mkShipment('ca', 'ka', 'in_transit');
    D.cancelled = await mkShipment('ca', 'ka', 'cancelled');
    D.archivedShipment = await mkShipment('ca', 'ka', 'delivered', { archivedAt: new Date() });
    D.otherDelivered = await mkShipment('cb', 'kb', 'delivered'); // customer B / carrier B
    D.completed = await mkShipment('ca', 'ka', 'completed');
    D.fresh = await mkShipment('ca', 'ka', 'delivered'); // no POD yet
    D.fresh2 = await mkShipment('ca', 'ka', 'delivered'); // no POD yet
  });

  after(async () => {
    storageIndex?.setStorageDriverForTests(null);
    server?.close();
    await mongoose?.connection.dropDatabase();
    await mongoose?.disconnect();
  });

  const useStorage = () => { memory.calls.length = 0; storageIndex.setStorageDriverForTests(memory); };
  const noStorage = () => storageIndex.setStorageDriverForTests(null);
  const SHIP = (key) => String(D[key].shipment._id);

  describe('with no storage configured (honest 501, nothing pretends to upload)', () => {
    test('every upload route answers 501 STORAGE_NOT_CONFIGURED and writes nothing', async () => {
      noStorage();
      const before = [await M.Document.countDocuments({}), await M.Media.countDocuments({})];
      refuse(await upload('/admin/cms/media/upload', 'admin', PNG, 'image/png', { fileName: 'a.png' }), 501, 'STORAGE_NOT_CONFIGURED');
      refuse(await upload('/admin/documents', 'admin', PDF, 'application/pdf', { fileName: 'a.pdf', type: 'BOL', relatedEntityType: 'shipment', relatedEntityId: SHIP('delivered') }), 501, 'STORAGE_NOT_CONFIGURED');
      refuse(await upload(`/carrier/shipments/${SHIP('delivered')}/pod`, 'ka', PDF, 'application/pdf', { fileName: 'pod.pdf' }), 501, 'STORAGE_NOT_CONFIGURED');
      const body = refuse(await upload('/admin/cms/media/upload', 'admin', PNG, 'image/png', { fileName: 'a.png' }), 501, 'STORAGE_NOT_CONFIGURED');
      assert.equal(body.message, 'File storage is not configured yet.');
      assert.deepEqual([await M.Document.countDocuments({}), await M.Media.countDocuments({})], before);
      const status = ok(await get('/admin/cms/media/storage', 'admin'));
      assert.equal(status.configured, false);
      assert.equal(status.uploadsAvailable, false);
    });

    test('a legacy document record without a stored file reports DOWNLOAD_UNAVAILABLE after the ownership check', async () => {
      noStorage();
      const legacy = await M.Document.create({ name: 'legacy.pdf', type: 'BOL', fileUrl: 'https://files.example.com/x.pdf', storageKey: 'legacy/x', uploadedBy: D.adminId, relatedEntityType: 'shipment', relatedEntityId: D.delivered.shipment._id, customerId: D.people.ca.customer._id, carrierId: D.people.ka.carrier._id, visibility: 'shared' });
      D.legacy = legacy;
      refuse(await get(`/customer/documents/${legacy._id}/download`, 'ca'), 501, 'DOWNLOAD_UNAVAILABLE');
      refuse(await get(`/carrier/documents/${legacy._id}/download`, 'ka'), 501, 'DOWNLOAD_UNAVAILABLE');
      refuse(await get(`/customer/documents/${legacy._id}/download`, 'cb'), 404);
      refuse(await get(`/carrier/documents/${legacy._id}/download`, 'kb'), 404);
      const detail = ok(await get(`/admin/documents/${legacy._id}`, 'admin')).document;
      assert.equal(detail.download.available, false);
      assert.equal(ok(await get('/customer/documents', 'ca')).capabilities.download, false);
    });
  });

  describe('website media library', () => {
    test('uploads an image: validated, stored publicly, recorded with real metadata and audited', async () => {
      useStorage();
      const media = ok(await upload('/admin/cms/media/upload', 'admin', jpeg(64, 48), 'image/jpeg', { fileName: 'Hero Photo.jpg', folder: 'hero', altText: 'Trucks at dawn', caption: 'Morning' }), 201);
      D.media = media;
      assert.equal(media.type, 'image');
      assert.equal(media.mimeType, 'image/jpeg');
      assert.deepEqual([media.width, media.height], [64, 48]);
      assert.equal(media.provider, 'memory');
      assert.equal(media.folder, 'hero');
      assert.equal(media.altText, 'Trucks at dawn');
      assert.equal(media.isStored, true);
      assert.ok(media.url.startsWith('https://storage.test/public/hero/'));
      assert.equal(memory.calls.find((call) => call.operation === 'upload').access, 'public');
      const record = await M.Media.findById(media.id).select('+storageKey');
      assert.equal(record.uploadedBy.toString(), String(D.adminId));
      assert.ok(memory.objects.has(record.storageKey));
      const audit = await M.ActivityLog.findOne({ action: 'media.uploaded', entityId: media.id });
      assert.ok(audit);
      assert.ok(!JSON.stringify(audit.toObject()).includes('storage.test'), 'no URL in the audit entry');
      const detail = await get(`/admin/cms/media/${media.id}`, 'admin');
      for (const word of ['storageKey', 'uploadedBy', 'archivedBy', 'previousVersions']) assert.ok(!detail.text.includes(word), `media detail leaked "${word}"`);
      const listing = ok(await get('/admin/cms/media', 'admin'));
      assert.equal(listing.items[0].uploaderName, 'Store super_admin');
    });

    test('uploads a video with its duration', async () => {
      useStorage();
      const media = ok(await upload('/admin/cms/media/upload', 'admin', mp4(), 'video/mp4', { fileName: 'hero.mp4' }), 201);
      assert.equal(media.type, 'video');
      assert.equal(media.duration, 5);
    });

    test('only the Super Admin may upload; guests get 401 and customers and carriers 403', async () => {
      useStorage();
      for (const [as, status] of [[undefined, 401], ['ca', 403], ['ka', 403]]) {
        refuse(await upload('/admin/cms/media/upload', as, PNG, 'image/png', { fileName: 'a.png' }), status);
      }
      assert.equal(memory.calls.filter((call) => call.operation === 'upload').length, 0);
    });

    test('rejects dangerous or mismatched files before anything is stored', async () => {
      useStorage();
      const attempts = [
        [Buffer.concat([Buffer.from('MZ'), Buffer.alloc(300)]), 'application/octet-stream', 'tool.exe', 415, 'UNSUPPORTED_FILE_TYPE'],
        [Buffer.from('<html><script>alert(1)</script></html>'.padEnd(64)), 'text/html', 'page.html', 415, 'UNSUPPORTED_FILE_TYPE'],
        [Buffer.from('<html><script>alert(1)</script></html>'.padEnd(64)), 'image/png', 'page.png', 415, 'UNSUPPORTED_FILE_TYPE'],
        [PNG, 'image/png', 'shell.php', 415, 'UNSUPPORTED_FILE_TYPE'],
        [PNG, 'image/png', 'logo.png.sh', 415, 'UNSUPPORTED_FILE_TYPE'],
        [PNG, 'image/jpeg', 'logo.jpg', 422, 'FILE_CONTENT_MISMATCH'],
        [PDF, 'application/pdf', 'doc.pdf', 415, 'UNSUPPORTED_FILE_TYPE'],
        [Buffer.alloc(0), 'image/png', 'empty.png', 400, 'EMPTY_FILE'],
      ];
      for (const [buffer, type, fileName, status, code] of attempts) refuse(await upload('/admin/cms/media/upload', 'admin', buffer, type, { fileName }), status, code);
      refuse(await request('POST', '/admin/cms/media/upload?fileName=a.png', { cookie: S.admin, json: { hello: 'world' } }), 415, 'UNSUPPORTED_FILE_TYPE');
      assert.equal(memory.calls.filter((call) => call.operation === 'upload').length, 0, 'nothing reached storage');
      assert.equal(await M.Media.countDocuments({ fileName: /exe|php|html|empty/ }), 0);
    });

    test('enforces size limits (image 10 MB) and strict query keys', async () => {
      useStorage();
      const big = Buffer.concat([PNG, Buffer.alloc(10 * 1024 * 1024)]);
      refuse(await upload('/admin/cms/media/upload', 'admin', big, 'image/png', { fileName: 'big.png' }), 413, 'FILE_TOO_LARGE');
      refuse(await upload('/admin/cms/media/upload', 'admin', PNG, 'image/png', { fileName: 'a.png', uploadedBy: String(D.adminId) }), 400);
      refuse(await upload('/admin/cms/media/upload', 'admin', PNG, 'image/png', { fileName: 'a.png', storageKey: 'private/x/y.png' }), 400);
      refuse(await upload('/admin/cms/media/upload', 'admin', PNG, 'image/png', { fileName: 'a.png', provider: 'cloudinary' }), 400);
      refuse(await upload('/admin/cms/media/upload', 'admin', PNG, 'image/png', { fileName: 'a.png', $where: '1' }), 400);
      refuse(await upload('/admin/cms/media/upload', 'admin', PNG, 'image/png', { fileName: 'a.png', folder: '../../etc' }), 400);
      refuse(await upload('/admin/cms/media/upload', 'admin', PNG, 'image/png', {}), 400);
      assert.equal(memory.calls.filter((call) => call.operation === 'upload').length, 0);
    });

    test('a failed upload to storage or a failed database write leaves nothing behind', async () => {
      useStorage();
      const before = await M.Media.countDocuments({});
      const objectsBefore = memory.objects.size;
      memory.failNext('upload');
      const failed = refuse(await upload('/admin/cms/media/upload', 'admin', PNG, 'image/png', { fileName: 'a.png' }), 503, 'STORAGE_UNAVAILABLE');
      assert.ok(!failed.message.includes('SECRET-PROVIDER-DETAIL'));
      assert.equal(await M.Media.countDocuments({}), before);

      const save = mock.method(M.Media.prototype, 'save', async () => { throw new Error('database is down'); });
      try {
        refuse(await upload('/admin/cms/media/upload', 'admin', PNG, 'image/png', { fileName: 'a.png' }), 500);
      } finally {
        save.mock.restore();
      }
      assert.equal(memory.objects.size, objectsBefore, 'the stored file was removed again');
      assert.ok(memory.calls.some((call) => call.operation === 'delete'));
      assert.equal(await M.Media.countDocuments({}), before);
    });

    test('replacing a file keeps the old stored object and never breaks the item when storage fails', async () => {
      useStorage();
      const first = ok(await upload('/admin/cms/media/upload', 'admin', PNG, 'image/png', { fileName: 'logo.png', folder: 'branding' }), 201);
      const oldKey = (await M.Media.findById(first.id).select('+storageKey')).storageKey;
      memory.failNext('upload');
      refuse(await upload(`/admin/cms/media/${first.id}/replace`, 'admin', jpeg(), 'image/jpeg', { fileName: 'logo2.jpg' }), 503);
      assert.equal((await M.Media.findById(first.id)).fileName, 'logo.png', 'unchanged after a failed replace');

      const replaced = ok(await upload(`/admin/cms/media/${first.id}/replace`, 'admin', jpeg(10, 20), 'image/jpeg', { fileName: 'logo2.jpg' }));
      assert.equal(replaced.fileName, 'logo2.jpg');
      assert.equal(replaced.mimeType, 'image/jpeg');
      assert.equal(replaced.id, first.id);
      assert.equal(replaced.altText, null);
      const record = await M.Media.findById(first.id).select('+storageKey +previousVersions');
      assert.notEqual(record.storageKey, oldKey);
      assert.equal(record.previousVersions.length, 1);
      assert.equal(record.previousVersions[0].storageKey, oldKey);
      assert.ok(memory.objects.has(oldKey), 'the old file is preserved');
      assert.ok(await M.ActivityLog.findOne({ action: 'media.replaced', entityId: first.id }));
      refuse(await upload(`/admin/cms/media/${first.id}/replace`, 'admin', mp4(), 'video/mp4', { fileName: 'v.mp4' }), 422);
      refuse(await upload(`/admin/cms/media/${MISSING}/replace`, 'admin', PNG, 'image/png', { fileName: 'a.png' }), 404);
      assert.ok(!(await get(`/admin/cms/media/${first.id}`, 'admin')).text.includes('previousVersions'));
    });

    test('deleting a media item removes its stored file, any earlier version, and the record for good', async () => {
      useStorage();
      const item = ok(await upload('/admin/cms/media/upload', 'admin', PNG, 'image/png', { fileName: 'old.png' }), 201);
      const first = (await M.Media.findById(item.id).select('+storageKey')).storageKey;
      ok(await upload(`/admin/cms/media/${item.id}/replace`, 'admin', PNG, 'image/png', { fileName: 'new.png' }));
      const current = (await M.Media.findById(item.id).select('+storageKey')).storageKey;
      assert.notEqual(current, first);
      assert.ok(memory.objects.has(first) && memory.objects.has(current), 'replace keeps the earlier stored file until the item is deleted');
      ok(await send('DELETE', `/admin/cms/media/${item.id}`, 'admin'));
      assert.ok(!memory.objects.has(first) && !memory.objects.has(current), 'both stored files are removed from storage');
      assert.equal(await M.Media.countDocuments({ _id: item.id }), 0, 'and the record is gone from the database');
      refuse(await send('DELETE', `/admin/cms/media/${item.id}`, 'admin'), 404);
      refuse(await send('POST', `/admin/cms/media/${item.id}/archive`, 'admin'), 404);
    });
  });

  describe('POD upload by the carrier', () => {
    test('carrier A uploads a POD for an own delivered shipment: shared document, derived owners, audit, notifications', async () => {
      useStorage();
      const data = ok(await upload(`/carrier/shipments/${SHIP('delivered')}/pod`, 'ka', PDF, 'application/pdf', { fileName: 'signed-pod.pdf' }), 201);
      D.pod = data.document;
      assert.equal(data.document.type, 'POD');
      assert.equal(data.document.isPrimary, true);
      assert.equal(data.document.name, 'signed-pod.pdf');
      assert.equal(data.document.relatedEntityId, SHIP('delivered'));
      const record = await M.Document.findById(data.document.id).select('+storageKey');
      assert.equal(record.visibility, 'shared');
      assert.equal(String(record.customerId), String(D.people.ca.customer._id), 'customer derived from the shipment');
      assert.equal(String(record.carrierId), String(D.people.ka.carrier._id), 'carrier derived from the session');
      assert.equal(String(record.uploadedBy), String(D.people.ka.user._id));
      assert.equal(record.uploadedByRole, 'carrier');
      assert.equal(record.storageProvider, 'memory');
      assert.ok(record.storageKey.startsWith('private/documents/'), 'stored privately');
      assert.equal(memory.calls.find((call) => call.operation === 'upload').access, 'private');
      noInternals({ text: JSON.stringify(data) });

      const audit = await M.ActivityLog.findOne({ action: 'document.pod_uploaded', entityId: record._id });
      assert.ok(audit);
      assert.equal(String(audit.userId), String(D.people.ka.user._id));
      assert.ok(!JSON.stringify(audit.toObject()).match(/storage\.test|private\/documents/));

      const customerNote = await M.Notification.findOne({ recipientId: D.people.ca.user._id, type: 'document' });
      assert.ok(customerNote);
      assert.match(customerNote.message, /Proof of delivery was uploaded for shipment HL-ST/);
      assert.ok(!/Carrier|KA|MC-/.test(customerNote.message + customerNote.title), 'the notification does not name the carrier');
      assert.ok(await M.Notification.findOne({ recipientId: D.adminId, type: 'document' }));
      assert.equal(await M.Notification.countDocuments({ recipientId: D.people.cb.user._id }), 0);
    });

    test('customer A sees the POD (and can open it); customer B and carrier B do not and get plain 404s', async () => {
      useStorage();
      await upload(`/carrier/shipments/${SHIP('completed')}/pod`, 'ka', PDF, 'application/pdf', { fileName: 'c.pdf' }); // seed another
      const list = ok(await get('/customer/documents', 'ca'));
      assert.ok(list.items.some((item) => item.id === D.pod.id && item.type === 'POD'));
      assert.equal(list.capabilities.download, true);
      noInternals(await get('/customer/documents', 'ca'), ['carrierId', 'Carrier KA']);
      const shipment = ok(await get(`/customer/shipments/${SHIP('delivered')}`, 'ca')).shipment;
      assert.ok(shipment.documents.some((item) => item.id === D.pod.id));
      assert.equal(ok(await get('/customer/documents', 'cb')).items.length, 0);
      refuse(await get(`/customer/documents/${D.pod.id}`, 'cb'), 404);
      refuse(await get(`/customer/documents/${D.pod.id}/download`, 'cb'), 404);
      refuse(await get(`/carrier/documents/${D.pod.id}`, 'kb'), 404);
      refuse(await get(`/carrier/documents/${D.pod.id}/download`, 'kb'), 404);
      assert.ok(ok(await get('/carrier/documents', 'ka')).items.some((item) => item.id === D.pod.id));
      const carrierShipment = ok(await get(`/carrier/shipments/${SHIP('delivered')}`, 'ka')).shipment;
      assert.equal(carrierShipment.proofOfDelivery.onFile, true);
      assert.equal(carrierShipment.proofOfDelivery.canReplace, true);
      assert.deepEqual(carrierShipment.documentUploadTypes, ['BOL', 'Other']);
    });

    test('a carrier cannot upload to another carrier\'s shipment, a missing one or an archived one', async () => {
      useStorage();
      const before = await M.Document.countDocuments({});
      refuse(await upload(`/carrier/shipments/${SHIP('otherDelivered')}/pod`, 'ka', PDF, 'application/pdf', { fileName: 'x.pdf' }), 404);
      refuse(await upload(`/carrier/shipments/${SHIP('delivered')}/pod`, 'kb', PDF, 'application/pdf', { fileName: 'x.pdf' }), 404);
      refuse(await upload(`/carrier/shipments/${MISSING}/pod`, 'ka', PDF, 'application/pdf', { fileName: 'x.pdf' }), 404);
      refuse(await upload(`/carrier/shipments/${SHIP('archivedShipment')}/pod`, 'ka', PDF, 'application/pdf', { fileName: 'x.pdf' }), 404);
      assert.equal(await M.Document.countDocuments({}), before);
      assert.equal(memory.calls.filter((call) => call.operation === 'upload').length, 0, 'nothing was stored for any of them');
    });

    test('guests, customers and the admin route are not allowed on the carrier upload routes', async () => {
      useStorage();
      refuse(await upload(`/carrier/shipments/${SHIP('delivered')}/pod`, undefined, PDF, 'application/pdf', { fileName: 'x.pdf' }), 401);
      refuse(await upload(`/carrier/shipments/${SHIP('delivered')}/pod`, 'ca', PDF, 'application/pdf', { fileName: 'x.pdf' }), 403);
      refuse(await upload(`/carrier/shipments/${SHIP('delivered')}/documents`, 'ca', PDF, 'application/pdf', { fileName: 'x.pdf', type: 'BOL' }), 403);
      refuse(await upload(`/carrier/shipments/${SHIP('delivered')}/pod`, 'admin', PDF, 'application/pdf', { fileName: 'x.pdf' }), 403);
    });

    test('POD rules: not before the delivery stage, never on a cancelled shipment, and no silent overwrite', async () => {
      useStorage();
      refuse(await upload(`/carrier/shipments/${SHIP('transit')}/pod`, 'ka', PDF, 'application/pdf', { fileName: 'x.pdf' }), 409, 'POD_NOT_ALLOWED_YET');
      refuse(await upload(`/carrier/shipments/${SHIP('cancelled')}/pod`, 'ka', PDF, 'application/pdf', { fileName: 'x.pdf' }), 409, 'POD_NOT_ALLOWED_YET');
      const second = refuse(await upload(`/carrier/shipments/${SHIP('delivered')}/pod`, 'ka', PDF, 'application/pdf', { fileName: 'again.pdf' }), 409, 'POD_ALREADY_EXISTS');
      assert.match(second.message, /Replace/);
      assert.equal(await M.Document.countDocuments({ type: 'POD', relatedEntityId: D.delivered.shipment._id, archivedAt: null }), 1);
      const detail = ok(await get(`/carrier/shipments/${SHIP('transit')}`, 'ka')).shipment;
      assert.equal(detail.proofOfDelivery.uploadAllowed, false);
      assert.match(detail.proofOfDelivery.reason, /out for delivery or delivered/);
    });

    test('explicit replacement archives the previous POD (kept in storage), links the new one and audits both', async () => {
      useStorage();
      const oldKey = (await M.Document.findById(D.pod.id).select('+storageKey')).storageKey;
      const replacement = ok(await upload(`/carrier/shipments/${SHIP('delivered')}/pod`, 'ka', jpeg(), 'image/jpeg', { fileName: 'better-scan.jpg', replace: 'true' }), 201).document;
      assert.equal(replacement.isPrimary, true);
      const old = await M.Document.findById(D.pod.id).select('+storageKey');
      assert.ok(old.archivedAt, 'the old POD is archived');
      assert.equal(old.isPrimary, false);
      assert.ok(memory.objects.has(oldKey), 'the old file is not deleted from storage');
      const fresh = await M.Document.findById(replacement.id);
      assert.equal(String(fresh.replacesDocumentId), D.pod.id);
      assert.ok(await M.ActivityLog.findOne({ action: 'document.pod_replaced', entityId: fresh._id }));
      assert.ok(await M.ActivityLog.findOne({ action: 'document.archived', entityId: old._id }));
      refuse(await get(`/customer/documents/${D.pod.id}`, 'ca'), 404);
      refuse(await get(`/carrier/documents/${D.pod.id}`, 'ka'), 404);
      assert.ok(ok(await get('/customer/documents', 'ca')).items.every((item) => item.id !== D.pod.id));
      D.pod = replacement;
    });

    test('Phase 13: a carrier cannot archive or replace a POD that the Super Admin uploaded', async () => {
      useStorage();
      const adminPod = ok(await upload('/admin/documents', 'admin', PDF, 'application/pdf', { fileName: 'office-pod.pdf', type: 'POD', relatedEntityType: 'shipment', relatedEntityId: SHIP('fresh2'), visibility: 'shared' }), 201).document;
      assert.equal(adminPod.isPrimary, true);
      refuse(await upload(`/carrier/shipments/${SHIP('fresh2')}/pod`, 'ka', PDF, 'application/pdf', { fileName: 'mine.pdf', replace: 'true' }), 409, 'POD_NOT_REPLACEABLE');
      refuse(await upload(`/carrier/shipments/${SHIP('fresh2')}/pod`, 'ka', PDF, 'application/pdf', { fileName: 'mine.pdf' }), 409, 'POD_ALREADY_EXISTS');
      const row = await M.Document.findById(adminPod.id);
      assert.equal(row.archivedAt ?? null, null, 'the office document was not archived');
      assert.equal(row.isPrimary, true);
    });

    test('validation: executables, wrong types, oversized files and forged owners are rejected', async () => {
      useStorage();
      const url = `/carrier/shipments/${SHIP('fresh')}/pod`;
      refuse(await upload(url, 'ka', Buffer.concat([Buffer.from('MZ'), Buffer.alloc(300)]), 'application/pdf', { fileName: 'pod.pdf' }), 422, 'FILE_CONTENT_MISMATCH');
      refuse(await upload(url, 'ka', PDF, 'application/pdf', { fileName: 'pod.exe' }), 415);
      refuse(await upload(url, 'ka', mp4(), 'video/mp4', { fileName: 'pod.mp4' }), 415);
      refuse(await upload(url, 'ka', Buffer.from('MZ'), 'application/x-msdownload', { fileName: 'pod.exe' }), 415);
      refuse(await upload(url, 'ka', Buffer.concat([PDF, Buffer.alloc(25 * 1024 * 1024)]), 'application/pdf', { fileName: 'pod.pdf' }), 413, 'FILE_TOO_LARGE');
      for (const extra of [{ role: 'super_admin' }, { customerId: String(D.people.cb.customer._id) }, { carrierId: String(D.people.kb.carrier._id) }, { shipmentId: SHIP('otherDelivered') }, { storageKey: 'private/documents/x.pdf' }, { visibility: 'customer' }, { uploadedBy: String(D.adminId) }, { $where: '1' }, { 'type[$ne]': 'x' }]) {
        refuse(await upload(url, 'ka', PDF, 'application/pdf', { fileName: 'pod.pdf', ...extra }), 400);
      }
      refuse(await request('POST', `${url}?fileName=a.pdf`, { cookie: S.ka, json: { role: 'super_admin', $where: '1' } }), 415, 'UNSUPPORTED_FILE_TYPE');
      assert.equal(memory.calls.filter((call) => call.operation === 'upload').length, 0);
      assert.equal(await M.Document.countDocuments({ type: 'POD', relatedEntityId: D.fresh.shipment._id }), 0);
    });

    test('a failed database write after the file was stored removes the file again', async () => {
      useStorage();
      const objectsBefore = memory.objects.size;
      const create = mock.method(M.Document, 'create', async () => { throw new Error('database is down'); });
      try {
        refuse(await upload(`/carrier/shipments/${SHIP('fresh')}/pod`, 'ka', PDF, 'application/pdf', { fileName: 'pod.pdf' }), 500);
      } finally {
        create.mock.restore();
      }
      assert.equal(memory.objects.size, objectsBefore);
      assert.deepEqual(memory.calls.map((call) => call.operation), ['upload', 'delete']);
      assert.equal(await M.Document.countDocuments({ type: 'POD', relatedEntityId: D.fresh.shipment._id }), 0, 'no record was created');
    });

    test('a storage outage returns a safe 503 and creates no record', async () => {
      useStorage();
      const before = await M.Document.countDocuments({});
      memory.failNext('upload');
      const body = refuse(await upload(`/carrier/shipments/${SHIP('completed')}/documents`, 'ka', PDF, 'application/pdf', { fileName: 'bol.pdf', type: 'BOL' }), 503, 'STORAGE_UNAVAILABLE');
      assert.ok(!body.message.includes('SECRET'));
      assert.equal(await M.Document.countDocuments({}), before);
    });
  });

  describe('carrier supporting documents', () => {
    test('a carrier can attach a BOL/Other to its own shipment; it is carrier-visible only', async () => {
      useStorage();
      const doc = ok(await upload(`/carrier/shipments/${SHIP('transit')}/documents`, 'ka', PDF, 'application/pdf', { fileName: 'signed-bol.pdf', type: 'BOL', name: 'Signed BOL' }), 201).document;
      D.carrierBol = doc;
      assert.equal(doc.name, 'Signed BOL');
      const record = await M.Document.findById(doc.id);
      assert.equal(record.visibility, 'carrier');
      assert.equal(record.isPrimary, false);
      assert.ok(await M.ActivityLog.findOne({ action: 'document.uploaded', entityId: record._id }));
      assert.ok(ok(await get('/carrier/documents', 'ka')).items.some((item) => item.id === doc.id));
      assert.ok(ok(await get('/customer/documents', 'ca')).items.every((item) => item.id !== doc.id), 'not shown to the customer');
      refuse(await get(`/customer/documents/${doc.id}`, 'ca'), 404);
      refuse(await get(`/carrier/documents/${doc.id}`, 'kb'), 404);
    });

    test('only allowed types: POD has its own route, and arbitrary or injected types are refused', async () => {
      useStorage();
      const url = `/carrier/shipments/${SHIP('transit')}/documents`;
      for (const type of ['POD', 'Invoice', 'W9', 'Nope', '$ne']) refuse(await upload(url, 'ka', PDF, 'application/pdf', { fileName: 'x.pdf', type }), 400);
      refuse(await upload(url, 'ka', PDF, 'application/pdf', { fileName: 'x.pdf' }), 400);
      refuse(await upload(`/carrier/shipments/${SHIP('otherDelivered')}/documents`, 'ka', PDF, 'application/pdf', { fileName: 'x.pdf', type: 'BOL' }), 404);
      refuse(await upload(`/carrier/shipments/${SHIP('cancelled')}/documents`, 'ka', PDF, 'application/pdf', { fileName: 'x.pdf', type: 'BOL' }), 409, 'SHIPMENT_CLOSED');
    });
  });

  describe('secure download and preview (IDOR, expiry, no leaks)', () => {
    test('authorized users receive an expiring link generated server-side; it is never stored or logged', async () => {
      useStorage();
      const customerAccess = ok(await get(`/customer/documents/${D.pod.id}/download`, 'ca')).access;
      assert.ok(customerAccess.url.startsWith('https://storage.test/secure/'));
      assert.equal(customerAccess.disposition, 'attachment');
      assert.equal(customerAccess.expiresInSeconds, 300);
      const seconds = (new Date(customerAccess.expiresAt).getTime() - Date.now()) / 1000;
      assert.ok(seconds > 250 && seconds <= 300, `expires in ${seconds}s`);
      assert.equal(customerAccess.fileName, 'better-scan.jpg');
      assert.equal(memory.calls.find((call) => call.operation === 'createSecureAccess').expiresInSeconds, 300);

      const inline = ok(await get(`/carrier/documents/${D.pod.id}/download?disposition=inline`, 'ka')).access;
      assert.equal(inline.disposition, 'inline');
      ok(await get(`/admin/documents/${D.pod.id}/download`, 'admin'));

      const stored = await M.Document.findById(D.pod.id).select('+storageKey');
      assert.ok(!stored.fileUrl.includes('/secure/'), 'the signed link is not saved on the record');
      for (const entry of await M.ActivityLog.find({ action: /document\.(downloaded|previewed)/ })) {
        assert.ok(!JSON.stringify(entry.toObject()).includes('storage.test'), 'no link in the audit trail');
      }
      assert.ok(await M.ActivityLog.findOne({ action: 'document.downloaded', userId: D.people.ca.user._id }));
      assert.ok(await M.ActivityLog.findOne({ action: 'document.previewed', userId: D.people.ka.user._id }));
      refuse(await get(`/customer/documents/${D.pod.id}/download?disposition=evil`, 'ca'), 400);
      refuse(await get(`/customer/documents/${D.pod.id}/download?storageKey=private/documents/x.pdf`, 'ca'), 400);
      refuse(await get(`/customer/documents/${D.pod.id}/download?url=https://evil.example`, 'ca'), 400);
    });

    test('Carrier A cannot download Carrier B documents and Customer A cannot download Customer B documents', async () => {
      useStorage();
      const theirs = ok(await upload(`/carrier/shipments/${SHIP('otherDelivered')}/pod`, 'kb', PDF, 'application/pdf', { fileName: 'b-pod.pdf' }), 201).document;
      refuse(await get(`/carrier/documents/${theirs.id}/download`, 'ka'), 404);
      refuse(await get(`/carrier/documents/${theirs.id}`, 'ka'), 404);
      refuse(await get(`/customer/documents/${theirs.id}/download`, 'ca'), 404);
      refuse(await get(`/customer/documents/${theirs.id}`, 'ca'), 404);
      ok(await get(`/customer/documents/${theirs.id}/download`, 'cb'));
      ok(await get(`/carrier/documents/${theirs.id}/download`, 'kb'));
      assert.deepEqual(memory.calls.filter((call) => call.operation === 'createSecureAccess').length, 2, 'links are created only after the owner check');
      refuse(await get(`/carrier/documents/${MISSING}/download`, 'ka'), 404);
    });

    test('a customer cannot reach a carrier-only document; a carrier cannot reach customer-only or admin-only documents', async () => {
      useStorage();
      const mk = (visibility, extra = {}) => M.Document.create({ name: `${visibility}.pdf`, type: 'Other', fileUrl: 'https://storage.test/x', storageKey: 'private/documents/x.pdf', storageProvider: 'memory', uploadedBy: D.adminId, relatedEntityType: 'shipment', relatedEntityId: D.delivered.shipment._id, customerId: D.people.ca.customer._id, carrierId: D.people.ka.carrier._id, visibility, mimeType: 'application/pdf', ...extra });
      const customerOnly = await mk('customer');
      const carrierOnly = await mk('carrier');
      const adminOnly = await mk('admin');
      const priv = await mk('private');
      refuse(await get(`/customer/documents/${carrierOnly._id}`, 'ca'), 404);
      refuse(await get(`/customer/documents/${carrierOnly._id}/download`, 'ca'), 404);
      refuse(await get(`/carrier/documents/${customerOnly._id}`, 'ka'), 404);
      refuse(await get(`/carrier/documents/${customerOnly._id}/download`, 'ka'), 404);
      for (const doc of [adminOnly, priv]) {
        refuse(await get(`/customer/documents/${doc._id}/download`, 'ca'), 404);
        refuse(await get(`/carrier/documents/${doc._id}/download`, 'ka'), 404);
      }
    });

    test('a record stored by a different provider than the configured one is not opened', async () => {
      useStorage();
      const doc = await M.Document.create({ name: 'other-provider.pdf', type: 'Other', fileUrl: 'https://res.cloudinary.com/x', storageKey: 'raw:authenticated:abc', storageProvider: 'cloudinary', uploadedBy: D.adminId, relatedEntityType: 'shipment', relatedEntityId: D.delivered.shipment._id, customerId: D.people.ca.customer._id, carrierId: D.people.ka.carrier._id, visibility: 'shared', mimeType: 'application/pdf' });
      refuse(await get(`/customer/documents/${doc._id}/download`, 'ca'), 501, 'DOWNLOAD_UNAVAILABLE');
      assert.equal(ok(await get(`/admin/documents/${doc._id}`, 'admin')).document.download.available, false);
    });

    test('a missing stored object or a storage outage gives a safe error, not a link', async () => {
      useStorage();
      memory.failNext('createSecureAccess', { code: 'not_found' });
      refuse(await get(`/customer/documents/${D.pod.id}/download`, 'ca'), 404, 'STORAGE_FILE_MISSING');
      memory.failNext('createSecureAccess');
      const body = refuse(await get(`/customer/documents/${D.pod.id}/download`, 'ca'), 503, 'STORAGE_UNAVAILABLE');
      assert.ok(!body.message.includes('SECRET'));
    });

    test('responses to customers and carriers never contain storage references, URLs or internal fields', async () => {
      useStorage();
      for (const [p, as] of [['/customer/documents', 'ca'], [`/customer/documents/${D.pod.id}`, 'ca'], [`/customer/shipments/${SHIP('delivered')}`, 'ca'], ['/carrier/documents', 'ka'], [`/carrier/documents/${D.pod.id}`, 'ka'], [`/carrier/shipments/${SHIP('delivered')}`, 'ka']]) {
        const response = await get(p, as);
        assert.equal(response.status, 200, p);
        noInternals(response, ['storageProvider', 'memory', 'originalFileName', 'private/documents', 'uploadedByRole']);
      }
      const customerView = await get('/customer/documents', 'ca');
      for (const word of ['carrierId', 'carrierRate', 'brokerMargin', 'Carrier KA', 'MC-ka']) assert.ok(!customerView.text.includes(word), word);
      const carrierView = await get('/carrier/documents', 'ka');
      for (const word of ['customerId', 'Customer CA', 'brokerMargin', '245000']) assert.ok(!carrierView.text.includes(word), word);
    });
  });

  describe('Super Admin document management', () => {
    test('uploads a document with owners derived from the related record, and presents it without internals', async () => {
      useStorage();
      const created = ok(await upload('/admin/documents', 'admin', PDF, 'application/pdf', { fileName: 'invoice-42.pdf', type: 'Invoice', relatedEntityType: 'shipment', relatedEntityId: SHIP('delivered'), visibility: 'customer', name: 'Invoice 42' }), 201).document;
      D.adminDoc = created;
      assert.equal(created.name, 'Invoice 42');
      assert.equal(created.status, 'uploaded');
      assert.equal(created.visibility, 'customer');
      assert.equal(created.customer.companyName, 'Customer CA Inc');
      assert.equal(created.carrier.companyName, 'Carrier KA LLC');
      assert.equal(created.related.label, D.delivered.shipment.trackingNumber);
      assert.equal(created.related.path, `/admin/shipments/${SHIP('delivered')}`);
      assert.equal(created.uploadedByRole, 'super_admin');
      assert.equal(created.download.available, true);
      assert.equal(created.previewable, true);
      for (const word of ['storageKey', 'fileUrl', 'storage.test']) assert.ok(!JSON.stringify(created).includes(word), word);
      assert.ok(await M.ActivityLog.findOne({ action: 'document.uploaded', entityId: created.id }));
      assert.ok(ok(await get('/customer/documents', 'ca')).items.some((item) => item.id === created.id));
      assert.ok(ok(await get('/carrier/documents', 'ka')).items.every((item) => item.id !== created.id), 'customer-only invoice is not a carrier document');
    });

    test('only the Super Admin: guests 401, customers and carriers 403 on every document write', async () => {
      useStorage();
      const target = D.adminDoc.id;
      for (const [as, status] of [[undefined, 401], ['ca', 403], ['ka', 403]]) {
        refuse(await upload('/admin/documents', as, PDF, 'application/pdf', { fileName: 'x.pdf', type: 'BOL', relatedEntityType: 'shipment', relatedEntityId: SHIP('delivered') }), status);
        refuse(await send('PATCH', `/admin/documents/${target}`, as, { name: 'x' }), status);
        refuse(await send('POST', `/admin/documents/${target}/archive`, as), status);
        refuse(await send('POST', `/admin/documents/${target}/restore`, as), status);
        refuse(await get(`/admin/documents/${target}/download`, as), status);
      }
    });

    test('association attacks: forged owners are a 400, a record that does not exist is a 404, visibility must fit the record', async () => {
      useStorage();
      const base = { fileName: 'x.pdf', type: 'BOL', relatedEntityType: 'shipment', relatedEntityId: SHIP('delivered') };
      for (const extra of [{ customerId: String(D.people.cb.customer._id) }, { carrierId: String(D.people.kb.carrier._id) }, { storageKey: 'private/documents/other.pdf' }, { uploadedBy: String(D.people.ca.user._id) }, { role: 'super_admin' }, { $where: '1' }]) {
        refuse(await upload('/admin/documents', 'admin', PDF, 'application/pdf', { ...base, ...extra }), 400);
      }
      refuse(await upload('/admin/documents', 'admin', PDF, 'application/pdf', { ...base, relatedEntityId: MISSING }), 404, 'RELATED_RECORD_NOT_FOUND');
      refuse(await upload('/admin/documents', 'admin', PDF, 'application/pdf', { ...base, relatedEntityId: SHIP('archivedShipment') }), 404, 'RELATED_RECORD_NOT_FOUND');
      refuse(await upload('/admin/documents', 'admin', PDF, 'application/pdf', { ...base, relatedEntityType: 'carrier_application' }), 400);
      refuse(await upload('/admin/documents', 'admin', PDF, 'application/pdf', { ...base, type: 'NOPE' }), 400);
      refuse(await upload('/admin/documents', 'admin', PDF, 'application/pdf', { ...base, visibility: 'public' }), 400);
      // A customer-owned record has no carrier, so a carrier-visible document on it cannot be created.
      refuse(await upload('/admin/documents', 'admin', PDF, 'application/pdf', { ...base, relatedEntityType: 'customer', relatedEntityId: String(D.people.ca.customer._id), visibility: 'carrier' }), 422);
      refuse(await upload('/admin/documents', 'admin', PDF, 'application/pdf', { ...base, relatedEntityType: 'carrier', relatedEntityId: String(D.people.ka.carrier._id), visibility: 'customer' }), 422);
      const ok1 = ok(await upload('/admin/documents', 'admin', PDF, 'application/pdf', { ...base, type: 'W9', relatedEntityType: 'carrier', relatedEntityId: String(D.people.ka.carrier._id), visibility: 'carrier' }), 201).document;
      assert.equal(ok1.carrier.companyName, 'Carrier KA LLC');
      assert.equal(ok1.customer, null);
      assert.equal(memory.calls.filter((call) => call.operation === 'upload').length, 1, 'only the valid request reached storage');
    });

    test('update: name, type, visibility and association are validated against real records; owners are re-derived', async () => {
      useStorage();
      const id = D.adminDoc.id;
      const renamed = ok(await send('PATCH', `/admin/documents/${id}`, 'admin', { name: 'Invoice 42 (final)', type: 'Invoice', visibility: 'shared' })).document;
      assert.equal(renamed.name, 'Invoice 42 (final)');
      assert.equal(renamed.visibility, 'shared');
      assert.ok(ok(await get('/carrier/documents', 'ka')).items.some((item) => item.id === id), 'now shared with the carrier');
      const moved = ok(await send('PATCH', `/admin/documents/${id}`, 'admin', { relatedEntityType: 'shipment', relatedEntityId: SHIP('otherDelivered') })).document;
      assert.equal(moved.customer.companyName, 'Customer CB Inc', 'owner re-derived from the new record');
      assert.equal(moved.carrier.companyName, 'Carrier KB LLC');
      assert.ok(ok(await get('/customer/documents', 'ca')).items.every((item) => item.id !== id));
      assert.ok(ok(await get('/customer/documents', 'cb')).items.some((item) => item.id === id));
      for (const body of [{}, { relatedEntityType: 'shipment' }, { relatedEntityId: SHIP('delivered') }, { customerId: String(D.people.ca.customer._id) }, { storageKey: 'x' }, { role: 'super_admin' }, { $where: '1' }, { visibility: 'public' }, { name: '<b>x</b>' }, { type: 'Nope' }]) {
        const response = await send('PATCH', `/admin/documents/${id}`, 'admin', body);
        assert.ok([400, 422].includes(response.status), `${JSON.stringify(body)} -> ${response.status}`);
      }
      refuse(await send('PATCH', `/admin/documents/${id}`, 'admin', { relatedEntityType: 'shipment', relatedEntityId: MISSING }), 404);
      refuse(await send('PATCH', `/admin/documents/${MISSING}`, 'admin', { name: 'x' }), 404);
      assert.ok(await M.ActivityLog.findOne({ action: 'document.updated', entityId: id }));
      await send('PATCH', `/admin/documents/${id}`, 'admin', { relatedEntityType: 'shipment', relatedEntityId: SHIP('delivered'), visibility: 'customer' });
    });

    test('list filters: type, status, visibility, customer, carrier, shipment, load, uploader, dates, search and pagination', async () => {
      useStorage();
      const total = ok(await get('/admin/documents?limit=100', 'admin')).items.length;
      assert.ok(total >= 6);
      const page = ok(await get('/admin/documents?limit=2&page=2', 'admin'));
      assert.equal(page.pagination.page, 2);
      assert.equal(page.items.length, 2);
      assert.ok(ok(await get('/admin/documents?type=POD', 'admin')).items.every((item) => item.type === 'POD'));
      assert.ok(ok(await get('/admin/documents?visibility=shared', 'admin')).items.every((item) => item.visibility === 'shared'));
      assert.ok(ok(await get(`/admin/documents?customerId=${D.people.cb.customer._id}`, 'admin')).items.every((item) => item.customer?.companyName === 'Customer CB Inc'));
      assert.ok(ok(await get(`/admin/documents?carrierId=${D.people.ka.carrier._id}`, 'admin')).items.length > 0);
      const byShipment = ok(await get(`/admin/documents?shipmentId=${SHIP('delivered')}&limit=100`, 'admin')).items;
      assert.ok(byShipment.length >= 3 && byShipment.every((item) => item.related?.id === SHIP('delivered') || item.related?.type === 'load'));
      const byLoad = ok(await get(`/admin/documents?loadId=${D.delivered.load._id}&limit=100`, 'admin')).items;
      assert.ok(byLoad.some((item) => item.relatedEntityType === 'shipment' && item.relatedEntityId === SHIP('delivered')), 'a load filter finds its shipment documents');
      assert.ok(ok(await get(`/admin/documents?uploadedBy=${D.people.ka.user._id}`, 'admin')).items.every((item) => item.uploadedBy.role === 'carrier'));
      assert.equal(ok(await get('/admin/documents?createdFrom=2000-01-01&createdTo=2000-01-02', 'admin')).items.length, 0);
      assert.ok(ok(await get(`/admin/documents?createdFrom=2020-01-01&createdTo=2099-12-31&limit=100`, 'admin')).items.length >= total);
      assert.ok(ok(await get('/admin/documents?q=better-scan', 'admin')).items.length === 1);
      const archived = ok(await get('/admin/documents?status=archived', 'admin')).items;
      assert.ok(archived.length >= 1 && archived.every((item) => item.status === 'archived' && item.isArchived));
      assert.ok(ok(await get('/admin/documents?status=uploaded&limit=100', 'admin')).items.every((item) => item.status === 'uploaded'));
      for (const bad of ['status=weird', 'shipmentId=zzz', 'uploadedBy[$ne]=x', 'createdFrom=yesterday', 'role=super_admin', 'storageKey=x']) refuse(await get(`/admin/documents?${bad}`, 'admin'), 400);
    });

    test('archive hides it from customers and carriers (404) but keeps the stored file; admin can still see it and restore it', async () => {
      useStorage();
      const id = D.adminDoc.id;
      await send('PATCH', `/admin/documents/${id}`, 'admin', { visibility: 'shared' });
      const key = (await M.Document.findById(id).select('+storageKey')).storageKey;
      assert.equal(ok(await send('POST', `/admin/documents/${id}/archive`, 'admin')).document.status, 'archived');
      assert.ok(memory.objects.has(key), 'archiving never deletes the object');
      refuse(await send('POST', `/admin/documents/${id}/archive`, 'admin'), 409, 'ALREADY_IN_STATE');
      refuse(await get(`/customer/documents/${id}`, 'ca'), 404);
      refuse(await get(`/customer/documents/${id}/download`, 'ca'), 404);
      refuse(await get(`/carrier/documents/${id}/download`, 'ka'), 404);
      assert.equal(ok(await get(`/admin/documents/${id}`, 'admin')).document.isArchived, true);
      refuse(await send('PATCH', `/admin/documents/${id}`, 'admin', { name: 'x' }), 404, undefined);
      assert.equal(ok(await send('POST', `/admin/documents/${id}/restore`, 'admin')).document.status, 'uploaded');
      refuse(await send('POST', `/admin/documents/${id}/restore`, 'admin'), 409, 'ALREADY_IN_STATE');
      ok(await get(`/customer/documents/${id}/download`, 'ca'));
      assert.ok(await M.ActivityLog.findOne({ action: 'document.archived', entityId: id, userId: D.adminId }));
      assert.ok(await M.ActivityLog.findOne({ action: 'document.restored', entityId: id, userId: D.adminId }));
      refuse(await send('POST', `/admin/documents/${MISSING}/archive`, 'admin'), 404);
    });

    test('admin shipment view reports proof of delivery from real documents', async () => {
      const operations = ok(await get(`/operations/shipments/${SHIP('delivered')}`, 'admin')).shipment;
      assert.equal(operations.proofOfDelivery.recorded, true);
      assert.ok(operations.proofOfDelivery.documentId);
      const none = ok(await get(`/operations/shipments/${SHIP('transit')}`, 'admin')).shipment;
      assert.equal(none.proofOfDelivery.recorded, false);
    });

    test('operator and prototype payloads on document routes are rejected', async () => {
      useStorage();
      const id = D.adminDoc.id;
      refuse(await request('PATCH', `/admin/documents/${id}`, { cookie: S.admin, json: { $where: 'sleep(1000)' } }), 400, 'OPERATOR_NOT_ALLOWED');
      refuse(await request('PATCH', `/admin/documents/${id}`, { cookie: S.admin, json: { name: { $ne: null } } }), 400, 'OPERATOR_NOT_ALLOWED');
      refuse(await request('PATCH', `/admin/documents/${id}`, { cookie: S.admin, body: '{"__proto__":{"role":"super_admin"},"name":"x"}', headers: { 'Content-Type': 'application/json' } }), 422);
      refuse(await get(`/admin/documents?type[$ne]=BOL`, 'admin'), 400, 'OPERATOR_NOT_ALLOWED');
      refuse(await get(`/admin/documents/${id}`, undefined), 401);
      refuse(await get('/admin/documents/not-an-id', 'admin'), 400);
    });
  });

  describe('local development provider through the real file route', () => {
    test('signed links serve the private file once valid; tampered, expired and unrelated requests are 404', async () => {
      const { createLocalDriver, signAccessToken } = await import('../src/storage/local.driver.js');
      const dir = await mkdtemp(path.join(os.tmpdir(), 'hl-local-'));
      try {
        storageIndex.setStorageDriverForTests(createLocalDriver({ directory: dir }));
        const pod = ok(await upload(`/carrier/shipments/${SHIP('completed')}/documents`, 'ka', PDF, 'application/pdf', { fileName: 'local.pdf', type: 'BOL' }), 201).document;
        const access = ok(await get(`/carrier/documents/${pod.id}/download?disposition=inline`, 'ka')).access;
        const token = access.url.split('/f/')[1];
        const served = await fetch(`${baseUrl}/api/v1/storage/local/f/${token}`);
        assert.equal(served.status, 200);
        assert.equal(served.headers.get('content-type')?.split(';')[0], 'application/pdf');
        assert.match(served.headers.get('content-disposition'), /^inline; filename="local.pdf"/);
        assert.equal(served.headers.get('x-content-type-options'), 'nosniff');
        assert.equal(served.headers.get('cache-control'), 'private, no-store');
        assert.equal(served.headers.get('x-frame-options'), null);
        assert.deepEqual(Buffer.from(await served.arrayBuffer()), PDF);
        assert.equal((await fetch(`${baseUrl}/api/v1/storage/local/f/${token.slice(0, -3)}abc`)).status, 404);
        const stored = await M.Document.findById(pod.id).select('+storageKey');
        const expired = signAccessToken({ k: stored.storageKey, e: Math.floor(Date.now() / 1000) - 1, d: 'inline', n: 'x' });
        assert.equal((await fetch(`${baseUrl}/api/v1/storage/local/f/${expired}`)).status, 404);
        assert.equal((await fetch(`${baseUrl}/api/v1/storage/local/p/private/${stored.storageKey.split('/')[2]}`)).status, 404, 'private files are not served from the public route');
        assert.equal((await fetch(`${baseUrl}/api/v1/storage/local/p/${encodeURIComponent('..')}/x.png`)).status, 404);
        const media = ok(await upload('/admin/cms/media/upload', 'admin', PNG, 'image/png', { fileName: 'pub.png', folder: 'general' }), 201);
        const publicFile = await fetch(`${baseUrl}${new URL(media.url).pathname}`);
        assert.equal(publicFile.status, 200, 'the public media URL is served');
        assert.equal(publicFile.headers.get('content-type')?.split(';')[0], 'image/png');
        assert.equal(publicFile.headers.get('x-content-type-options'), 'nosniff');
        assert.deepEqual(Buffer.from(await publicFile.arrayBuffer()), PNG);
      } finally {
        storageIndex.setStorageDriverForTests(null);
        await rm(dir, { recursive: true, force: true });
      }
    });
  });

  describe('storage routes when another provider is configured', () => {
    test('the local file route is inert without the local provider', async () => {
      useStorage();
      assert.equal((await fetch(`${baseUrl}/api/v1/storage/local/f/anything.sig`)).status, 404);
      assert.equal((await fetch(`${baseUrl}/api/v1/storage/local/p/public/x.png`)).status, 404);
    });
  });
});
