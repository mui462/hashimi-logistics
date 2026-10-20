/**
 * Phase 6 carrier-portal API tests: ownership, IDOR, role escalation, safe projections, profile and password.
 *
 *   MONGO_TEST_URI=mongodb://127.0.0.1:27017/hashimi_carrier_test npm run test:db
 *
 * The database name MUST end in "_test" (the suite drops it). Without MONGO_TEST_URI every test is skipped, not passed.
 */
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

const testUri = process.env.MONGO_TEST_URI;
const skipReason = testUri ? false : 'MONGO_TEST_URI is not set; these tests require a live MongoDB';

// Keep the developer's real storage settings (backend/.env) out of these tests: dotenv never overrides a variable that
// already exists, and env.js ignores empty values, so every test starts from "no storage configured".
for (const key of ['STORAGE_PROVIDER', 'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET']) process.env[key] = '';

if (testUri) {
  const databaseName = new URL(testUri).pathname.replace(/^\//, '');
  if (!databaseName.endsWith('_test')) {
    throw new Error(`Refusing to run: database "${databaseName}" must end with "_test" because it is dropped afterwards.`);
  }
  Object.assign(process.env, {
    NODE_ENV: 'development',
    MONGO_URI: testUri,
    JWT_SECRET: 'api-test-secret-api-test-secret-api-test-1234',
    CLIENT_URL: 'http://localhost:5173',
    AUTH_RATE_LIMIT_MAX: '10000',
    RESET_EMAIL_LIMIT_MAX: '100000',
    UPLOAD_RATE_LIMIT_MAX: '100000',
    QUOTE_IP_LIMIT_MAX: '100000',
    GLOBAL_RATE_LIMIT_MAX: '100000',
    LOGIN_ACCOUNT_LIMIT_MAX: '50',
  });
}

const PASS = { customer: 'customer-pass-phrase-1', carrier: 'carrier-pass-phrase-2', admin: 'administrator-pass-phrase-3', fresh: 'brand-new-pass-phrase-4' };
const CUSTOMER_RATE = 245000; // what the customer pays: must never reach a carrier
const CARRIER_RATE = 180000; // carrier pay: the only load money a carrier sees
const MARGIN = 65000; // must never reach a carrier
const MISSING = '000000000000000000000001';

/** Strings that must never appear anywhere in a carrier response body. */
const FORBIDDEN = [
  'customerId', 'quoteId', 'brokerMargin', 'internalNotes', 'estimatedRate', 'assignedTo', 'assignedBy', 'storageKey', 'fileUrl',
  'uploadedBy', 'passwordHash', 'tokenVersion', 'passwordResetToken', 'emailVerificationToken', 'archivedBy', '"rating"', '"rate"',
  'carrierRate', 'SECRET-CUSTOMER-NAME', 'SECRET-INTERNAL-NOTE', 'SECRET-STORAGE', 'SECRET-CONTACT', 'SECRET-NOTE', 'files.example.com',
  String(CUSTOMER_RATE), String(MARGIN), 'contactName', 'contactPhone', 'contactEmail',
];

describe('carrier portal API', { skip: skipReason }, () => {
  let mongoose;
  let server;
  let baseUrl;
  let M;
  let hashPassword;
  const S = {};
  const D = {};
  const who = {};

  async function api(method, path, { body, cookie, headers = {} } = {}) {
    const response = await fetch(`${baseUrl}/api/v1${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    const setCookie = response.headers.get('set-cookie');
    return { status: response.status, text, body: text ? JSON.parse(text) : null, cookie: setCookie ? setCookie.split(';')[0] : null, headers: response.headers };
  }
  const get = (path, as, headers) => api('GET', path, { cookie: S[as], headers });
  const noLeaks = (response) => {
    for (const word of FORBIDDEN) assert.ok(!response.text.includes(word), `response leaked "${word}"`);
  };

  async function signUp(key, email, { cleared = true } = {}) {
    const response = await api('POST', '/auth/register/carrier', {
      body: { firstName: 'Riley', lastName: key.toUpperCase(), companyName: `${key.toUpperCase()} Trucking`, email, password: PASS.carrier, passwordConfirmation: PASS.carrier },
    });
    assert.equal(response.status, 201);
    S[key] = response.cookie;
    const user = await M.User.findOne({ email });
    const carrier = await M.Carrier.findOne({ userId: user._id });
    if (cleared) await M.Carrier.updateOne({ _id: carrier._id }, { status: 'active', authorityStatus: 'active', complianceStatus: 'approved', MCNumber: `MC-${key}`, DOTNumber: `DOT-${key}`, equipmentTypes: ['Dry Van', 'Flatbed', 'Reefer'], operatingRegions: ['Nationwide'], crossBorderCapability: true });
    who[key] = { userId: user._id, carrierId: carrier._id, email };
  }

  async function seed(key, tag) {
    const carrierId = who[key].carrierId;
    const customer = await M.Customer.create({ userId: new mongoose.Types.ObjectId(), companyName: 'SECRET-CUSTOMER-NAME Inc' });
    const customerId = customer._id;
    const stop = (city, state, country) => ({ city, state, country, facilityName: `${tag} Dock`, street: `1 ${tag} Way`, contactName: 'SECRET-CONTACT', contactPhone: '312-555-0000', contactEmail: 'secret-contact@example.com' });
    const baseLoad = (suffix, extra) => ({
      loadNumber: `LD-T-${tag}-${suffix}`, customerId, origin: stop('Chicago', 'IL', 'US'), destination: stop('Toronto', 'ON', 'CA'),
      commodity: `${tag} machine parts`, equipmentType: 'Dry Van', weight: { value: 12000, unit: 'lb' }, rate: CUSTOMER_RATE, carrierRate: CARRIER_RATE,
      brokerMargin: MARGIN, specialInstructions: `${tag} dock instructions`, ...extra,
    });
    const quote = await M.QuoteRequest.create({
      quoteNumber: `QT-T-${tag}-1`, customerId, origin: { city: 'Chicago', state: 'IL', country: 'US' }, destination: { city: 'Toronto', state: 'ON', country: 'CA' },
      isCrossBorder: true, pickupDate: new Date('2026-12-01'), commodity: 'x', status: 'quoted', internalNotes: 'SECRET-INTERNAL-NOTE', estimatedRate: 199900,
    });
    const load = await M.Load.create(baseLoad('1', { carrierId, quoteId: quote._id, status: 'in_transit' }));
    const deliveredLoad = await M.Load.create(baseLoad('2', { carrierId, status: 'delivered' }));
    const shipment = await M.Shipment.create({
      trackingNumber: `HL-${tag}TRACK01`, loadId: load._id, customerId, carrierId, status: 'in_transit', borderStatus: 'pending',
      currentLocation: { city: 'Detroit', state: 'MI', country: 'US' },
      trackingEvents: [
        { status: 'booked', timestamp: new Date('2026-11-01T10:00:00Z'), description: 'SECRET-CUSTOMER-NAME booked it' },
        { status: 'in_transit', timestamp: new Date('2026-11-02T10:00:00Z'), location: { city: 'Detroit', state: 'MI', country: 'US' }, description: 'SECRET-NOTE driver note' },
      ],
      borderEvents: [{ event: 'at_border', timestamp: new Date('2026-11-03T10:00:00Z'), description: 'SECRET-NOTE broker call' }],
      exception: { reason: 'delay', description: 'SECRET-NOTE internal detail' },
    }).catch(async () => M.Shipment.create({
      trackingNumber: `HL-${tag}TRACK01`, loadId: load._id, customerId, carrierId, status: 'in_transit', borderStatus: 'pending',
      trackingEvents: [{ status: 'in_transit', timestamp: new Date('2026-11-02T10:00:00Z'), description: 'SECRET-NOTE driver note' }],
    }));
    const uploader = new mongoose.Types.ObjectId();
    const mkDoc = (name, visibility, extra = {}) => M.Document.create({
      name, type: 'BOL', fileUrl: 'https://files.example.com/x.pdf', storageKey: 'SECRET-STORAGE/x.pdf', uploadedBy: uploader,
      relatedEntityType: 'shipment', relatedEntityId: shipment._id, carrierId, visibility, mimeType: 'application/pdf', fileSize: 1000, ...extra,
    });
    const docs = {
      visible: await mkDoc(`${tag}-visible.pdf`, 'carrier'),
      private: await mkDoc(`${tag}-private.pdf`, 'private'),
      admin: await mkDoc(`${tag}-admin.pdf`, 'admin'),
      customerDoc: await mkDoc(`${tag}-customer.pdf`, 'customer', { customerId }),
    };
    const carrierPay = (overrides) => M.Payment.create({ loadId: load._id, carrierId, amount: CARRIER_RATE, paymentType: 'carrier_payment', notes: 'SECRET-NOTE', ...overrides });
    const payments = {
      pending: await carrierPay({ status: 'pending', referenceNumber: `REF-${tag}-1` }),
      paid: await carrierPay({ status: 'paid', paymentDate: new Date('2026-11-05'), amount: 90000 }),
    };
    await M.Payment.create({ loadId: load._id, customerId, carrierId, amount: CUSTOMER_RATE, paymentType: 'customer_payment', status: 'pending' });
    const note = (overrides) => M.Notification.create({ recipientId: who[key].userId, type: 'load', title: `${tag} update`, message: 'Your load moved.', relatedEntity: { entityType: 'load', entityId: load._id }, ...overrides });
    const notes = { unread: await note({}), read: await note({ isRead: true, title: `${tag} old` }) };
    D[key] = { customer, load, deliveredLoad, shipment, docs, payments, notes };
  }

  before(async () => {
    const database = await import('../src/config/database.js');
    ({ default: mongoose } = await import('mongoose'));
    const { default: app } = await import('../src/app.js');
    M = await import('../src/models/index.js');
    ({ hashPassword } = await import('../src/services/password.service.js'));
    await database.connectDatabase();
    await mongoose.connection.dropDatabase();
    const results = await Promise.allSettled(Object.values(M.models).map((Model) => Model.init()));
    results.forEach((result) => {
      if (result.status === 'rejected' && !/partialFilterExpression/.test(result.reason?.message ?? '')) throw result.reason;
    });
    (await import('../src/notifications/providers/index.js')).setEmailProviderForTests(null);
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    await signUp('a', 'carrier.a@example.com');
    await signUp('b', 'carrier.b@example.com');
    await signUp('c', 'carrier.c@example.com'); // cleared, no records
    await signUp('p', 'carrier.pending@example.com', { cleared: false }); // freshly registered: pending
    await seed('a', 'AAA');
    await seed('b', 'BBB');

    // open (unassigned) freight, never owned by a carrier
    const customerId = D.a.customer._id;
    const openBase = { customerId, origin: { city: 'Dallas', state: 'TX', country: 'US', street: '9 Secret St', facilityName: 'Hidden DC', contactName: 'SECRET-CONTACT' }, destination: { city: 'Denver', state: 'CO', country: 'US' }, commodity: 'Open freight', equipmentType: 'Flatbed', weight: { value: 8000, unit: 'lb' }, rate: CUSTOMER_RATE, carrierRate: CARRIER_RATE, brokerMargin: MARGIN, status: 'open' };
    D.open = await M.Load.create({ ...openBase, loadNumber: 'LD-T-OPEN-1' });
    D.openReefer = await M.Load.create({ ...openBase, loadNumber: 'LD-T-OPEN-2', equipmentType: 'Reefer' });

    for (const [key, role, mail, pass] of [['customer', 'customer', 'shipper@example.com', PASS.customer], ['admin', 'super_admin', 'root@example.com', PASS.admin]]) {
      const user = await M.User.create({ firstName: 'Direct', lastName: role, email: mail, role, passwordHash: await hashPassword(pass) });
      if (role === 'customer') await M.Customer.create({ userId: user._id, companyName: 'Direct Customer' });
      const login = await api('POST', role === 'customer' ? '/auth/login' : '/auth/admin/login', { body: { email: mail, password: pass } });
      assert.equal(login.status, 200);
      S[key] = login.cookie;
    }
  });

  after(async () => {
    server.close();
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  const ENDPOINTS = [
    ['GET', '/carrier/dashboard'], ['GET', '/carrier/loads'], ['GET', `/carrier/loads/${MISSING}`], ['GET', '/carrier/my-loads'], ['GET', `/carrier/my-loads/${MISSING}`],
    ['GET', '/carrier/shipments'], ['GET', `/carrier/shipments/${MISSING}`], ['GET', '/carrier/tracking/HL-ABC'], ['GET', '/carrier/documents'],
    ['GET', `/carrier/documents/${MISSING}`], ['GET', `/carrier/documents/${MISSING}/download`], ['GET', '/carrier/payments'], ['GET', '/carrier/messages'],
    ['GET', '/carrier/notifications'], ['PATCH', `/carrier/notifications/${MISSING}/read`], ['GET', '/carrier/profile'], ['PATCH', '/carrier/profile'],
    ['POST', '/carrier/profile/password'],
  ];

  describe('authentication and role gate', () => {
    for (const [method, path] of ENDPOINTS) {
      test(`${method} ${path}: 401 without a session, 403 for a customer, 403 for the super admin`, async () => {
        const body = method === 'GET' ? undefined : {};
        assert.equal((await api(method, path, { body })).status, 401);
        assert.equal((await api(method, path, { body, cookie: S.customer })).status, 403);
        assert.equal((await api(method, path, { body, cookie: S.admin })).status, 403);
      });
    }

    test('responses are never cacheable', async () => {
      assert.equal((await get('/carrier/dashboard', 'a')).headers.get('cache-control'), 'no-store');
    });

    test('a suspended carrier profile is refused', async () => {
      await M.Carrier.updateOne({ _id: who.c.carrierId }, { status: 'suspended' });
      assert.equal((await get('/carrier/dashboard', 'c')).status, 403);
      await M.Carrier.updateOne({ _id: who.c.carrierId }, { status: 'active' });
      assert.equal((await get('/carrier/dashboard', 'c')).status, 200);
    });
  });

  describe('dashboard', () => {
    test('shows only this carrier’s real counts', async () => {
      const response = await get('/carrier/dashboard', 'a');
      assert.equal(response.status, 200);
      const { stats } = response.body.data;
      assert.equal(stats.availableLoads, 2);
      assert.equal(stats.myActiveLoads, 1);
      assert.equal(stats.activeShipments, 1);
      assert.equal(stats.inTransit, 1);
      assert.equal(stats.delivered, 0);
      assert.equal(stats.unreadNotifications, 1);
      assert.deepEqual(stats.pendingPayments, { count: 1, totals: [{ currency: 'USD', amount: CARRIER_RATE }] });
      assert.equal(response.body.data.recentLoads.length, 2);
      assert.ok(response.body.data.recentActivity.length > 0);
      noLeaks(response);
    });

    test('a carrier with no records gets honest zeros and empty lists', async () => {
      const { stats, recentLoads, recentShipments, recentActivity } = (await get('/carrier/dashboard', 'c')).body.data;
      assert.deepEqual(
        [stats.myActiveLoads, stats.activeShipments, stats.inTransit, stats.delivered, stats.unreadNotifications, stats.pendingPayments.count],
        [0, 0, 0, 0, 0, 0]
      );
      assert.deepEqual([recentLoads, recentShipments, recentActivity], [[], [], []]);
    });
  });

  describe('available loads', () => {
    test('a cleared carrier sees open, unassigned loads only, with carrier pay and nothing else financial', async () => {
      const response = await get('/carrier/loads', 'a');
      assert.equal(response.status, 200);
      const { items, eligibility } = response.body.data;
      assert.equal(eligibility.eligible, true);
      assert.deepEqual(items.map((l) => l.loadNumber).sort(), ['LD-T-OPEN-1', 'LD-T-OPEN-2']);
      const load = items.find((l) => l.loadNumber === 'LD-T-OPEN-1');
      assert.deepEqual(load.pay, { amount: CARRIER_RATE, currency: 'USD' });
      assert.deepEqual(load.origin, { city: 'Dallas', state: 'TX', country: 'US' });
      assert.ok(!response.text.includes('Hidden DC') && !response.text.includes('9 Secret St'), 'no street or facility before assignment');
      noLeaks(response);
    });

    test('another carrier’s assigned loads never appear on the board', async () => {
      const response = await get('/carrier/loads', 'a');
      assert.ok(!response.text.includes('LD-T-BBB'));
      assert.ok(!response.text.includes('LD-T-AAA'), 'own assigned loads are under My Loads, not the board');
    });

    test('the equipment filter uses the real enum and rejects anything else', async () => {
      const reefer = await get('/carrier/loads?equipmentType=Reefer', 'a');
      assert.deepEqual(reefer.body.data.items.map((l) => l.loadNumber), ['LD-T-OPEN-2']);
      assert.equal((await get('/carrier/loads?equipmentType=Spaceship', 'a')).status, 400);
    });

    test('a carrier that is not cleared sees an honest empty board, not freight', async () => {
      const response = await get('/carrier/loads', 'p');
      assert.equal(response.status, 200);
      assert.deepEqual(response.body.data.items, []);
      assert.equal(response.body.data.eligibility.eligible, false);
      assert.equal((await get(`/carrier/loads/${D.open._id}`, 'p')).status, 404);
      assert.equal((await get('/carrier/dashboard', 'p')).body.data.stats.availableLoads, 0);
    });

    test('detail of an open load is the limited board view; detail of an assigned load needs ownership', async () => {
      const open = await get(`/carrier/loads/${D.open._id}`, 'a');
      assert.equal(open.status, 200);
      assert.equal(open.body.data.load.ownedByYou, false);
      assert.equal(open.body.data.load.specialInstructions, undefined);
      noLeaks(open);
      const mine = await get(`/carrier/loads/${D.a.load._id}`, 'a');
      assert.equal(mine.status, 200);
      assert.equal(mine.body.data.load.ownedByYou, true);
      assert.equal((await get(`/carrier/loads/${D.b.load._id}`, 'a')).status, 404);
    });

    test('a load that has been assigned stops being available', async () => {
      const load = await M.Load.create({ customerId: D.a.customer._id, loadNumber: 'LD-T-TAKEN', origin: { city: 'A', country: 'US' }, destination: { city: 'B', country: 'US' }, commodity: 'x', status: 'assigned', carrierId: who.b.carrierId });
      assert.equal((await get(`/carrier/loads/${load._id}`, 'a')).status, 404);
      assert.ok(!(await get('/carrier/loads', 'a')).text.includes('LD-T-TAKEN'));
    });
  });

  describe('my loads', () => {
    test('lists only own loads with full route detail and carrier pay', async () => {
      const response = await get('/carrier/my-loads', 'a');
      assert.equal(response.status, 200);
      assert.equal(response.body.data.pagination.total, 2);
      const load = response.body.data.items.find((l) => l.loadNumber === 'LD-T-AAA-1');
      assert.equal(load.origin.street, '1 AAA Way');
      assert.deepEqual(load.pay, { amount: CARRIER_RATE, currency: 'USD' });
      assert.ok(!response.text.includes('BBB'));
      noLeaks(response);
    });

    test('status filter and pagination work server-side', async () => {
      const delivered = await get('/carrier/my-loads?status=delivered', 'a');
      assert.deepEqual(delivered.body.data.items.map((l) => l.loadNumber), ['LD-T-AAA-2']);
      const page = await get('/carrier/my-loads?limit=1&page=2', 'a');
      assert.equal(page.body.data.items.length, 1);
      assert.equal(page.body.data.pagination.totalPages, 2);
      assert.equal((await get('/carrier/my-loads?status=bogus', 'a')).status, 400);
      assert.equal((await get('/carrier/my-loads?limit=500', 'a')).status, 400);
    });

    test('detail has the linked shipment and authorized documents only', async () => {
      const response = await get(`/carrier/my-loads/${D.a.load._id}`, 'a');
      assert.equal(response.status, 200);
      const { load } = response.body.data;
      assert.equal(load.shipment.trackingNumber, 'HL-AAATRACK01');
      assert.deepEqual(load.documents.map((d) => d.name), ['AAA-visible.pdf']);
      assert.equal(load.specialInstructions, 'AAA dock instructions');
      noLeaks(response);
    });

    test('an empty carrier gets an empty list', async () => {
      const response = await get('/carrier/my-loads', 'c');
      assert.deepEqual(response.body.data.items, []);
      assert.equal(response.body.data.pagination.total, 0);
    });

    test('open loads are not reachable through My Loads', async () => {
      assert.equal((await get(`/carrier/my-loads/${D.open._id}`, 'a')).status, 404);
    });
  });

  describe('shipments and tracking', () => {
    test('lists only own shipments with the route joined from the load', async () => {
      const response = await get('/carrier/shipments', 'a');
      assert.equal(response.body.data.items.length, 1);
      const item = response.body.data.items[0];
      assert.equal(item.trackingNumber, 'HL-AAATRACK01');
      assert.equal(item.loadNumber, 'LD-T-AAA-1');
      assert.equal(item.origin.city, 'Chicago');
      assert.ok(!response.text.includes('BBB'));
      noLeaks(response);
      assert.equal((await get('/carrier/shipments?status=delivered', 'a')).body.data.items.length, 0);
      assert.equal((await get('/carrier/shipments?status=nope', 'a')).status, 400);
    });

    test('detail has the timeline, documents and carrier-visible charges, but nothing internal', async () => {
      const response = await get(`/carrier/shipments/${D.a.shipment._id}`, 'a');
      assert.equal(response.status, 200);
      const { shipment } = response.body.data;
      assert.ok(shipment.events.length >= 1);
      assert.deepEqual(Object.keys(shipment.events[0]).sort(), ['location', 'status', 'timestamp']);
      assert.deepEqual(shipment.pay, { amount: CARRIER_RATE, currency: 'USD' });
      assert.deepEqual(shipment.documents.map((d) => d.name), ['AAA-visible.pdf']);
      assert.ok(shipment.payments.every((p) => p.amount === CARRIER_RATE || p.amount === 90000), 'no customer payment in carrier charges');
      assert.equal(shipment.payments.length, 2);
      noLeaks(response);
    });

    test('tracking finds own numbers only; someone else’s looks identical to a typo', async () => {
      const own = await get('/carrier/tracking/hl-aaatrack01', 'a');
      assert.equal(own.status, 200);
      assert.equal(own.body.data.trackingNumber, 'HL-AAATRACK01');
      noLeaks(own);
      const foreign = await get('/carrier/tracking/HL-BBBTRACK01', 'a');
      const typo = await get('/carrier/tracking/HL-ZZZTRACK99', 'a');
      assert.equal(foreign.status, 404);
      assert.equal(foreign.text, typo.text);
      assert.equal(foreign.body.code, 'SHIPMENT_NOT_FOUND');
      assert.equal((await get('/carrier/tracking/bad%20number!', 'a')).status, 400);
    });
  });

  describe('documents', () => {
    test('lists only carrier-visible documents the carrier owns, with no storage details', async () => {
      const response = await get('/carrier/documents', 'a');
      assert.deepEqual(response.body.data.items.map((d) => d.name), ['AAA-visible.pdf']);
      assert.deepEqual(response.body.data.capabilities, { download: false, upload: false });
      noLeaks(response);
    });

    test('private, admin and customer-visible documents are not reachable', async () => {
      for (const key of ['private', 'admin', 'customerDoc']) {
        assert.equal((await get(`/carrier/documents/${D.a.docs[key]._id}`, 'a')).status, 404, key);
        assert.equal((await get(`/carrier/documents/${D.a.docs[key]._id}/download`, 'a')).status, 404, key);
      }
    });

    test('detail works and is logged; download is honestly unavailable after the ownership check', async () => {
      const detail = await get(`/carrier/documents/${D.a.docs.visible._id}`, 'a');
      assert.equal(detail.status, 200);
      assert.equal(detail.body.data.document.relatedLabel, 'HL-AAATRACK01');
      noLeaks(detail);
      const download = await get(`/carrier/documents/${D.a.docs.visible._id}/download`, 'a');
      assert.equal(download.status, 501);
      assert.equal(download.body.code, 'DOWNLOAD_UNAVAILABLE');
      noLeaks(download);
      assert.ok(await M.ActivityLog.findOne({ action: 'carrier.document.viewed', userId: who.a.userId }));
      assert.ok(await M.ActivityLog.findOne({ action: 'carrier.document.download_requested', userId: who.a.userId }));
    });

    test('there is no upload endpoint (no storage layer exists)', async () => {
      assert.equal((await api('POST', '/carrier/documents', { cookie: S.a, body: {} })).status, 404);
    });
  });

  describe('payments', () => {
    test('shows only this carrier’s carrier payments, adapted without invented invoice fields', async () => {
      const response = await get('/carrier/payments', 'a');
      assert.equal(response.body.data.items.length, 2);
      assert.ok(response.body.data.items.every((p) => p.amount === CARRIER_RATE || p.amount === 90000));
      const pending = response.body.data.items.find((p) => p.reference === 'REF-AAA-1');
      assert.deepEqual(Object.keys(pending).sort(), ['amount', 'currency', 'id', 'loadId', 'loadNumber', 'paidAt', 'recordedAt', 'reference', 'status']);
      assert.deepEqual(response.body.data.summary, { pendingCount: 1, pendingTotals: [{ currency: 'USD', amount: CARRIER_RATE }] });
      noLeaks(response);
      assert.equal((await get('/carrier/payments?status=paid', 'a')).body.data.items.length, 1);
      assert.equal((await get('/carrier/payments?status=bogus', 'a')).status, 400);
    });

    test('an empty ledger is an honest empty list', async () => {
      assert.deepEqual((await get('/carrier/payments', 'c')).body.data.items, []);
    });
  });

  describe('messages', () => {
    test('is an honest placeholder: no conversations, messaging reported as unavailable', async () => {
      const response = await get('/carrier/messages', 'a');
      assert.equal(response.status, 200);
      assert.deepEqual(response.body.data, { items: [], capabilities: { messaging: false } });
    });
  });

  describe('notifications', () => {
    test('lists only the signed-in user’s notifications and counts unread', async () => {
      const response = await get('/carrier/notifications', 'a');
      assert.equal(response.body.data.items.length, 2);
      assert.equal(response.body.data.unreadCount, 1);
      assert.ok(response.body.data.items.every((n) => n.title.startsWith('AAA')));
      const unread = await get('/carrier/notifications?unread=true', 'a');
      assert.deepEqual(unread.body.data.items.map((n) => n.title), ['AAA update']);
      assert.equal((await get('/carrier/notifications?type=bogus', 'a')).status, 400);
    });

    test('marking read changes only the caller’s own notification and is logged', async () => {
      const response = await api('PATCH', `/carrier/notifications/${D.a.notes.unread._id}/read`, { cookie: S.a });
      assert.equal(response.status, 200);
      assert.equal(response.body.data.notification.isRead, true);
      assert.equal((await get('/carrier/notifications', 'a')).body.data.unreadCount, 0);
      assert.ok(await M.ActivityLog.findOne({ action: 'carrier.notification.read', userId: who.a.userId }));
    });
  });

  describe('IDOR: carrier A against carrier B’s records', () => {
    const foreign = () => [
      `/carrier/loads/${D.b.load._id}`, `/carrier/my-loads/${D.b.load._id}`, `/carrier/shipments/${D.b.shipment._id}`,
      `/carrier/documents/${D.b.docs.visible._id}`, `/carrier/documents/${D.b.docs.visible._id}/download`, '/carrier/tracking/HL-BBBTRACK01',
    ];

    test('every foreign id is a 404 identical to an id that does not exist', async () => {
      const missingPaths = [
        `/carrier/loads/${MISSING}`, `/carrier/my-loads/${MISSING}`, `/carrier/shipments/${MISSING}`, `/carrier/documents/${MISSING}`,
        `/carrier/documents/${MISSING}/download`, '/carrier/tracking/HL-NOPE0001',
      ];
      const paths = foreign();
      for (let i = 0; i < paths.length; i += 1) {
        const real = await get(paths[i], 'a');
        const gone = await get(missingPaths[i], 'a');
        assert.equal(real.status, 404, paths[i]);
        assert.equal(gone.status, 404, missingPaths[i]);
        assert.equal(real.body.message, gone.body.message, paths[i]);
        assert.ok(!real.text.includes('BBB'));
      }
    });

    test('A cannot mark B’s notification as read', async () => {
      const response = await api('PATCH', `/carrier/notifications/${D.b.notes.unread._id}/read`, { cookie: S.a });
      assert.equal(response.status, 404);
      assert.equal((await M.Notification.findById(D.b.notes.unread._id)).isRead, false);
    });

    test('forged carrierId, userId and ownerId in the query, body, path and headers never change whose data is returned', async () => {
      const ids = { carrierId: who.b.carrierId, userId: who.b.userId, ownerId: who.b.carrierId };
      for (const path of ['/carrier/my-loads', '/carrier/shipments', '/carrier/documents', '/carrier/payments', '/carrier/notifications']) {
        for (const [name, value] of Object.entries(ids)) {
          const queried = await get(`${path}?${name}=${value}`, 'a');
          assert.equal(queried.status, 400, `${path}?${name}`); // strict query schema refuses it
        }
        const headered = await get(path, 'a', { 'x-carrier-id': String(who.b.carrierId), 'x-user-id': String(who.b.userId), 'x-owner-id': String(who.b.carrierId) });
        assert.equal(headered.status, 200);
        assert.ok(!headered.text.includes('BBB'), `${path} with forged headers`);
      }
      for (const [name, value] of Object.entries(ids)) {
        const patch = await api('PATCH', '/carrier/profile', { cookie: S.a, body: { [name]: String(value), companyName: 'Hijack' } });
        assert.equal(patch.status, 422, name);
        const post = await api('POST', '/carrier/profile/password', { cookie: S.a, body: { [name]: String(value), currentPassword: PASS.carrier, password: PASS.fresh, passwordConfirmation: PASS.fresh } });
        assert.equal(post.status, 422, name);
        assert.equal((await api('GET', `/carrier/my-loads`, { cookie: S.a, body: undefined, headers: { [`x-${name}`]: String(value) } })).status, 200);
      }
      assert.equal((await M.Carrier.findById(who.b.carrierId)).companyName, 'B Trucking');
      assert.equal((await M.Carrier.findById(who.a.carrierId)).companyName, 'A Trucking');
    });

    test('B sees none of A’s data, and the two profiles stay separate', async () => {
      for (const path of ['/carrier/my-loads', '/carrier/shipments', '/carrier/documents', '/carrier/payments', '/carrier/notifications', '/carrier/dashboard']) {
        const response = await get(path, 'b');
        assert.ok(!response.text.includes('AAA'), `${path} leaked A’s data to B`);
      }
      assert.equal((await get('/carrier/profile', 'b')).body.data.account.email, 'carrier.b@example.com');
      assert.equal((await get('/carrier/profile', 'a')).body.data.account.email, 'carrier.a@example.com');
    });

    test('malformed ids are a clean 400, never a 500', async () => {
      for (const base of ['loads', 'my-loads', 'shipments', 'documents']) {
        for (const bad of ['not-an-id', '123', '%7B%24ne%3A1%7D', '..%2F..%2Fetc']) {
          const response = await get(`/carrier/${base}/${bad}`, 'a');
          assert.equal(response.status, 400, `${base}/${bad}`);
          assert.ok(!/stack|mongoose|CastError/i.test(response.text));
        }
      }
      assert.equal((await get('/carrier/documents/not-an-id/download', 'a')).status, 400);
      assert.equal((await api('PATCH', '/carrier/notifications/not-an-id/read', { cookie: S.a })).status, 400);
    });
  });

  describe('role escalation', () => {
    test('a carrier cannot reach customer, admin or staff resources', async () => {
      for (const path of ['/customer/dashboard', '/customer/quotes', '/users', '/customers', '/carriers']) {
        assert.equal((await get(path, 'a')).status, 403, path);
      }
    });

    test('profile and password bodies cannot carry role, status, authority or ownership fields', async () => {
      const attacks = [
        { role: 'super_admin' }, { accountType: 'super_admin' }, { status: 'active' }, { authorityStatus: 'active' }, { complianceStatus: 'approved' },
        { MCNumber: 'MC-1' }, { DOTNumber: 'DOT-1' }, { rating: 5 }, { notes: 'x' }, { insurance: {} }, { userId: String(who.b.userId) }, { email: 'new@example.com' },
        { isEmailVerified: true }, { tokenVersion: 99 }, { passwordHash: 'x' }, { isActive: true },
      ];
      for (const attack of attacks) {
        const response = await api('PATCH', '/carrier/profile', { cookie: S.a, body: { companyName: 'Fine Name', ...attack } });
        assert.equal(response.status, 422, JSON.stringify(attack));
      }
      const carrier = await M.Carrier.findById(who.a.carrierId).select('+rating');
      assert.equal(carrier.companyName, 'A Trucking');
      assert.equal(carrier.MCNumber, 'MC-A');
      assert.equal(carrier.authorityStatus, 'active');
      const user = await M.User.findById(who.a.userId);
      assert.equal(user.role, 'carrier');
      assert.equal(user.email, 'carrier.a@example.com');
    });
  });

  describe('projection attacks', () => {
    test('no endpoint response contains customer identity, customer rate, margin, internal notes, ratings or storage details', async () => {
      await M.Carrier.updateOne({ _id: who.a.carrierId }, { rating: 4.5, notes: 'SECRET-NOTE carrier' });
      const paths = [
        '/carrier/dashboard', '/carrier/loads', `/carrier/loads/${D.open._id}`, `/carrier/loads/${D.a.load._id}`, '/carrier/my-loads',
        `/carrier/my-loads/${D.a.load._id}`, '/carrier/shipments', `/carrier/shipments/${D.a.shipment._id}`, '/carrier/tracking/HL-AAATRACK01',
        '/carrier/documents', `/carrier/documents/${D.a.docs.visible._id}`, '/carrier/payments', '/carrier/messages', '/carrier/notifications', '/carrier/profile',
      ];
      for (const path of paths) {
        const response = await get(path, 'a');
        assert.equal(response.status, 200, path);
        noLeaks(response);
        assert.ok(!response.text.includes('4.5'), `${path} leaked the carrier rating`);
      }
    });

    test('query-string attempts to opt into hidden fields are refused', async () => {
      for (const query of ['select=%2Brate', 'fields=brokerMargin', 'populate=customerId', 'projection=rate', 'include=notes']) {
        assert.equal((await get(`/carrier/my-loads?${query}`, 'a')).status, 400, query);
        assert.equal((await get(`/carrier/loads?${query}`, 'a')).status, 400, query);
      }
    });

    test('the only load money in any response is the carrier’s own pay', async () => {
      const response = await get(`/carrier/my-loads/${D.a.load._id}`, 'a');
      assert.equal(response.body.data.load.pay.amount, CARRIER_RATE);
      assert.ok(!response.text.includes(String(CUSTOMER_RATE)));
      assert.ok(!response.text.includes(String(MARGIN)));
    });
  });

  describe('profile', () => {
    test('returns the account and company without any security field', async () => {
      const response = await get('/carrier/profile', 'a');
      assert.equal(response.status, 200);
      const { account, company } = response.body.data;
      assert.equal(account.email, 'carrier.a@example.com');
      assert.equal(company.companyName, 'A Trucking');
      assert.equal(company.mcNumber, 'MC-A');
      assert.equal(company.authorityStatus, 'active');
      noLeaks(response);
      assert.deepEqual(Object.keys(account).sort(), ['email', 'firstName', 'isEmailVerified', 'lastLogin', 'lastName', 'memberSince', 'phone']);
    });

    test('updates allowed fields, leaves staff-managed fields alone, and logs only field names', async () => {
      const response = await api('PATCH', '/carrier/profile', {
        cookie: S.a,
        body: {
          firstName: 'Rowan', phone: '312-555-0199', companyName: 'Acme Haulage Ltd', contactPerson: 'Dispatch Desk', businessEmail: 'ops@acme.example',
          address: { street: '1 Main St', city: 'Chicago', state: 'IL', zipCode: '60601', country: 'US' },
          equipmentTypes: ['Dry Van', 'Reefer'], operatingRegions: ['Midwest', 'Ontario'], crossBorderCapability: true,
        },
      });
      assert.equal(response.status, 200);
      assert.equal(response.body.data.account.firstName, 'Rowan');
      assert.deepEqual(response.body.data.company.equipmentTypes, ['Dry Van', 'Reefer']);
      assert.equal(response.body.data.company.crossBorderCapability, true);
      const carrier = await M.Carrier.findById(who.a.carrierId);
      assert.equal(carrier.phone, '312-555-0199');
      assert.equal(carrier.MCNumber, 'MC-A');
      assert.equal(carrier.complianceStatus, 'approved');
      const log = await M.ActivityLog.findOne({ action: 'carrier.profile.updated', userId: who.a.userId });
      assert.ok(log.metadata.fields.includes('companyName'));
      assert.ok(!JSON.stringify(log.toObject()).includes('312-555-0199'), 'values are not logged, only field names');
    });

    test('validates input', async () => {
      const bad = [{}, { firstName: '' }, { phone: 'abc' }, { businessEmail: 'nope' }, { companyName: '' }, { address: { country: 'FR' } }, { equipmentTypes: ['Spaceship'] }, { crossBorderCapability: 'yes' }];
      for (const body of bad) assert.equal((await api('PATCH', '/carrier/profile', { cookie: S.a, body })).status, 422, JSON.stringify(body));
    });
  });

  describe('password change', () => {
    const change = (as, body) => api('POST', '/carrier/profile/password', { cookie: S[as], body });

    test('refuses a wrong current password, weak passwords and mismatches, and changes nothing', async () => {
      const hashBefore = (await M.User.findById(who.b.userId).select('+passwordHash')).passwordHash;
      const cases = [
        { currentPassword: 'wrong-password-123', password: PASS.fresh, passwordConfirmation: PASS.fresh },
        { currentPassword: PASS.carrier, password: 'short', passwordConfirmation: 'short' },
        { currentPassword: PASS.carrier, password: 'password123', passwordConfirmation: 'password123' },
        { currentPassword: PASS.carrier, password: PASS.fresh, passwordConfirmation: 'different-one-9999' },
        { currentPassword: PASS.carrier, password: PASS.carrier, passwordConfirmation: PASS.carrier },
        { currentPassword: PASS.carrier, password: 'carrier.b@example.com', passwordConfirmation: 'carrier.b@example.com' },
        { currentPassword: PASS.carrier, password: PASS.fresh, passwordConfirmation: PASS.fresh, role: 'admin' },
      ];
      for (const body of cases) assert.equal((await change('b', body)).status, 422, JSON.stringify(body));
      assert.equal((await M.User.findById(who.b.userId).select('+passwordHash')).passwordHash, hashBefore);
      assert.equal((await get('/carrier/dashboard', 'b')).status, 200);
      assert.ok(await M.ActivityLog.findOne({ action: 'carrier.password.change_failed', userId: who.b.userId }));
    });

    test('success ends other sessions, keeps this one, and the new password works', async () => {
      const oldCookie = S.b;
      const response = await change('b', { currentPassword: PASS.carrier, password: PASS.fresh, passwordConfirmation: PASS.fresh });
      assert.equal(response.status, 200);
      assert.match(response.cookie, /^hashimi_token=/);
      assert.equal((await api('GET', '/carrier/dashboard', { cookie: oldCookie })).status, 401, 'the old token is dead');
      assert.equal((await api('GET', '/carrier/dashboard', { cookie: response.cookie })).status, 200, 'the fresh cookie works');
      assert.equal((await api('POST', '/auth/login', { body: { email: 'carrier.b@example.com', password: PASS.carrier } })).status, 401);
      const login = await api('POST', '/auth/login', { body: { email: 'carrier.b@example.com', password: PASS.fresh } });
      assert.equal(login.status, 200);
      S.b = login.cookie;
      const logs = await M.ActivityLog.find({ userId: who.b.userId, action: /^carrier\.password/ });
      assert.ok(logs.some((l) => l.action === 'carrier.password.changed'));
      assert.ok(!JSON.stringify(logs.map((l) => l.toObject())).includes(PASS.fresh));
    });
  });
});
