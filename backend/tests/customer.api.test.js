/**
 * Phase 5 customer-portal API tests: ownership, IDOR, role escalation, safe projections, profile and password.
 *
 *   MONGO_TEST_URI=mongodb://127.0.0.1:27017/hashimi_customer_test npm run test:db
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

/** Strings that must never appear anywhere in a customer response body. */
const FORBIDDEN = [
  'carrierId', 'carrierRate', 'brokerMargin', 'internalNotes', 'estimatedRate', 'assignedTo', 'assignedBy', 'storageKey',
  'fileUrl', 'uploadedBy', 'passwordHash', 'tokenVersion', 'passwordResetToken', 'emailVerificationToken', 'archivedBy',
  'SECRET-INTERNAL-NOTE', 'SECRET-CARRIER-NAME', 'SECRET-STORAGE', 'files.example.com',
];

describe('customer portal API', { skip: skipReason }, () => {
  let mongoose;
  let server;
  let baseUrl;
  let M;
  let hashPassword;
  const S = {}; // sessions: cookie strings
  const D = {}; // seeded data per customer: { a: {...}, b: {...} }
  const who = {}; // customer ids and user ids

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
  const get = (path, as) => api('GET', path, { cookie: S[as] });
  const noLeaks = (response) => {
    for (const word of FORBIDDEN) assert.ok(!response.text.includes(word), `response leaked "${word}"`);
  };

  async function signUp(key, email) {
    const response = await api('POST', '/auth/register/customer', {
      body: { firstName: 'Casey', lastName: key.toUpperCase(), companyName: `${key.toUpperCase()} Freight`, email, password: PASS.customer, passwordConfirmation: PASS.customer },
    });
    assert.equal(response.status, 201);
    S[key] = response.cookie;
    const user = await M.User.findOne({ email });
    const customer = await M.Customer.findOne({ userId: user._id });
    who[key] = { userId: user._id, customerId: customer._id, email };
  }

  async function seed(key, tag) {
    const customerId = who[key].customerId;
    const carrier = await M.Carrier.create({ userId: new mongoose.Types.ObjectId(), companyName: 'SECRET-CARRIER-NAME Trucking' });
    const quote = await M.QuoteRequest.create({
      quoteNumber: `QT-T-${tag}-1`, customerId, origin: { city: 'Chicago', state: 'IL', country: 'US' },
      destination: { city: 'Toronto', state: 'ON', country: 'CA' }, isCrossBorder: true, pickupDate: new Date('2026-12-01'),
      commodity: `${tag} machine parts`, equipmentType: 'Dry Van', weight: { value: 12000, unit: 'lb' }, status: 'quoted',
      quotedRate: 245000, estimatedRate: 199900, internalNotes: 'SECRET-INTERNAL-NOTE', assignedTo: new mongoose.Types.ObjectId(),
    });
    const load = await M.Load.create({
      loadNumber: `LD-T-${tag}-1`, customerId, carrierId: carrier._id, quoteId: quote._id, origin: { city: 'Chicago', state: 'IL', country: 'US' },
      destination: { city: 'Toronto', state: 'ON', country: 'CA' }, commodity: `${tag} machine parts`, equipmentType: 'Dry Van',
      weight: { value: 12000, unit: 'lb' }, rate: 245000, carrierRate: 180000, brokerMargin: 65000, status: 'in_transit',
    });
    const shipment = await M.Shipment.create({
      trackingNumber: `HL-${tag}TRACK01`, loadId: load._id, customerId, carrierId: carrier._id, status: 'in_transit', borderStatus: 'pending',
      currentLocation: { city: 'Detroit', state: 'MI', country: 'US' },
      trackingEvents: [
        { status: 'booked', timestamp: new Date('2026-11-01T10:00:00Z'), description: 'SECRET-CARRIER-NAME assigned', createdBy: new mongoose.Types.ObjectId() },
        { status: 'in_transit', timestamp: new Date('2026-11-02T10:00:00Z'), location: { city: 'Detroit', state: 'MI', country: 'US' }, description: 'driver note' },
      ],
    });
    const uploader = new mongoose.Types.ObjectId();
    const mkDoc = (name, visibility, extra = {}) => M.Document.create({
      name, type: 'BOL', fileUrl: 'https://files.example.com/x.pdf', storageKey: 'SECRET-STORAGE/x.pdf', uploadedBy: uploader,
      relatedEntityType: 'shipment', relatedEntityId: shipment._id, customerId, visibility, mimeType: 'application/pdf', fileSize: 1000, ...extra,
    });
    const docs = {
      visible: await mkDoc(`${tag}-visible.pdf`, 'customer'),
      private: await mkDoc(`${tag}-private.pdf`, 'private'),
      admin: await mkDoc(`${tag}-admin.pdf`, 'admin'),
      carrierDoc: await mkDoc(`${tag}-carrier.pdf`, 'carrier', { carrierId: carrier._id }),
    };
    const pay = (overrides) => M.Payment.create({ loadId: load._id, customerId, carrierId: carrier._id, amount: 245000, paymentType: 'customer_payment', notes: 'SECRET-INTERNAL-NOTE', ...overrides });
    const payments = {
      pending: await pay({ status: 'pending', referenceNumber: `REF-${tag}-1` }),
      paid: await pay({ status: 'paid', paymentDate: new Date('2026-11-05'), amount: 100000 }),
    };
    await M.Payment.create({ loadId: load._id, carrierId: carrier._id, amount: 180000, paymentType: 'carrier_payment', status: 'pending' });
    const note = (overrides) => M.Notification.create({ recipientId: who[key].userId, type: 'shipment', title: `${tag} update`, message: 'Your shipment moved.', relatedEntity: { entityType: 'shipment', entityId: shipment._id }, ...overrides });
    const notes = { unread: await note({}), read: await note({ isRead: true, title: `${tag} old` }) };
    D[key] = { carrier, quote, load, shipment, docs, payments, notes };
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

    await signUp('a', 'cust.a@example.com');
    await signUp('b', 'cust.b@example.com');
    await signUp('c', 'cust.c@example.com'); // brand-new customer with no records
    // Customers a and b have confirmed their email (quote requests need that); c has not, and is used for the verification gate.
    await M.User.updateMany({ email: { $in: ['cust.a@example.com', 'cust.b@example.com'] } }, { isEmailVerified: true });
    await seed('a', 'AAA');
    await seed('b', 'BBB');

    for (const [key, role, mail, pass] of [['carrier', 'carrier', 'haul@example.com', PASS.carrier], ['admin', 'super_admin', 'root@example.com', PASS.admin]]) {
      const user = await M.User.create({ firstName: 'Direct', lastName: role, email: mail, role, passwordHash: await hashPassword(pass), isEmailVerified: true });
      if (role === 'carrier') await M.Carrier.create({ userId: user._id, companyName: 'Direct Carrier' });
      const login = await api('POST', role === 'carrier' ? '/auth/login' : '/auth/admin/login', { body: { email: mail, password: pass } });
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
    ['GET', '/customer/dashboard'], ['GET', '/customer/quotes'], ['POST', '/customer/quotes'], ['GET', '/customer/quotes/000000000000000000000001'],
    ['GET', '/customer/shipments'], ['GET', '/customer/shipments/000000000000000000000001'], ['GET', '/customer/tracking/HL-ABC'],
    ['GET', '/customer/documents'], ['GET', '/customer/documents/000000000000000000000001'], ['GET', '/customer/documents/000000000000000000000001/download'],
    ['GET', '/customer/invoices'], ['GET', '/customer/notifications'], ['PATCH', '/customer/notifications/000000000000000000000001/read'],
    ['GET', '/customer/profile'], ['PATCH', '/customer/profile'], ['POST', '/customer/profile/password'],
  ];

  describe('authentication and role gate', () => {
    for (const [method, path] of ENDPOINTS) {
      test(`${method} ${path}: 401 without a session, 403 for a carrier, 403 for the super admin`, async () => {
        const body = method === 'GET' ? undefined : {};
        assert.equal((await api(method, path, { body })).status, 401);
        assert.equal((await api(method, path, { body, cookie: S.carrier })).status, 403);
        assert.equal((await api(method, path, { body, cookie: S.admin })).status, 403);
      });
    }

    test('responses are never cacheable', async () => {
      assert.equal((await get('/customer/dashboard', 'a')).headers.get('cache-control'), 'no-store');
    });

    test('a suspended customer profile is refused', async () => {
      await M.Customer.updateOne({ _id: who.c.customerId }, { status: 'suspended' });
      assert.equal((await get('/customer/dashboard', 'c')).status, 403);
      await M.Customer.updateOne({ _id: who.c.customerId }, { status: 'active' });
      assert.equal((await get('/customer/dashboard', 'c')).status, 200);
    });
  });

  describe('dashboard', () => {
    test('shows only this customer’s real counts', async () => {
      const response = await get('/customer/dashboard', 'a');
      assert.equal(response.status, 200);
      const { stats } = response.body.data;
      assert.equal(stats.activeShipments, 1);
      assert.equal(stats.inTransit, 1);
      assert.equal(stats.delivered, 0);
      assert.equal(stats.pendingQuotes, 1);
      assert.equal(stats.unreadNotifications, 1);
      assert.deepEqual(stats.outstandingInvoices, { count: 1, totals: [{ currency: 'USD', amount: 245000 }] });
      assert.equal(response.body.data.recentQuotes.length, 1);
      assert.equal(response.body.data.recentShipments[0].origin.city, 'Chicago');
      assert.ok(response.body.data.recentActivity.length > 0);
      assert.ok(!response.text.includes('BBB'), 'nothing from customer B');
      noLeaks(response);
    });

    test('a customer with no records gets honest zeros and empty lists', async () => {
      const { data } = (await get('/customer/dashboard', 'c')).body;
      assert.deepEqual(data.stats, { activeShipments: 0, pendingQuotes: 0, inTransit: 0, delivered: 0, outstandingInvoices: { count: 0, totals: [] }, unreadNotifications: 0 });
      assert.deepEqual([data.recentQuotes, data.recentShipments, data.recentNotifications, data.recentActivity], [[], [], [], []]);
    });
  });

  describe('quotes', () => {
    const validQuote = () => ({
      origin: { city: 'Chicago', state: 'IL', zipCode: '60601', country: 'US' },
      destination: { city: 'Dallas', state: 'TX', country: 'US' },
      pickupDate: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10),
      equipmentType: 'Dry Van', commodity: 'Packaged goods', weight: { value: 8000, unit: 'lb' }, quantity: 12, pallets: 6,
      specialInstructions: 'Dock appointment required.', contactInformation: { name: 'Casey A', email: 'dock@example.com', phone: '312-555-0100' },
    });

    test('lists only own quotes with a customer-safe projection', async () => {
      const response = await get('/customer/quotes', 'a');
      assert.equal(response.body.data.items.length, 1);
      const [quote] = response.body.data.items;
      assert.equal(quote.quoteNumber, 'QT-T-AAA-1');
      assert.deepEqual(quote.rate, { amount: 245000, currency: 'USD' });
      assert.equal(quote.status, 'quoted');
      assert.equal(response.body.data.pagination.total, 1);
      noLeaks(response);
    });

    test('status filter uses the real enum and rejects anything else', async () => {
      assert.equal((await get('/customer/quotes?status=quoted', 'a')).body.data.items.length, 1);
      assert.equal((await get('/customer/quotes?status=booked', 'a')).body.data.items.length, 0);
      assert.equal((await get('/customer/quotes?status=hacked', 'a')).status, 400);
      assert.equal((await get('/customer/quotes?status[$ne]=new', 'a')).status, 400);
      assert.equal((await get('/customer/quotes?customerId=' + who.b.customerId, 'a')).status, 400);
    });

    test('detail is customer-safe', async () => {
      const response = await get(`/customer/quotes/${D.a.quote.id}`, 'a');
      assert.equal(response.status, 200);
      const { quote } = response.body.data;
      assert.equal(quote.shipment.trackingNumber, 'HL-AAATRACK01');
      assert.equal(quote.isCrossBorder, true);
      noLeaks(response);
    });

    test('creating a quote derives the customer, number and status on the server', async () => {
      const response = await api('POST', '/customer/quotes', { cookie: S.a, body: validQuote() });
      assert.equal(response.status, 201);
      const created = response.body.data.quote;
      assert.equal(created.status, 'new');
      assert.match(created.quoteNumber, /^QT-\d{4}-\d{6}$/);
      const stored = await M.QuoteRequest.findById(await M.QuoteRequest.findOne({ quoteNumber: created.quoteNumber }).then((q) => q._id));
      assert.equal(String(stored.customerId), String(who.a.customerId));
      assert.equal(stored.isCrossBorder, false);
      noLeaks(response);
      const second = await api('POST', '/customer/quotes', { cookie: S.a, body: validQuote() });
      assert.notEqual(second.body.data.quote.quoteNumber, created.quoteNumber);
    });

    test('cross-border lanes are flagged from the countries, not from the client', async () => {
      const body = { ...validQuote(), destination: { city: 'Toronto', state: 'ON', country: 'CA' } };
      const response = await api('POST', '/customer/quotes', { cookie: S.a, body });
      assert.equal(response.status, 201);
      assert.equal(response.body.data.quote.isCrossBorder, true);
      const unsupported = await api('POST', '/customer/quotes', { cookie: S.a, body: { ...body, origin: { city: 'Monterrey', country: 'MX' } } });
      assert.equal(unsupported.status, 422);
    });

    test('forged ownership, status and internal fields are rejected and nothing is created', async () => {
      const before = await M.QuoteRequest.countDocuments();
      for (const extra of [
        { customerId: String(who.b.customerId) }, { status: 'booked' }, { quotedRate: 100 }, { internalNotes: 'x' }, { estimatedRate: 1 },
        { quoteNumber: 'QT-FAKE' }, { isCrossBorder: true }, { assignedTo: String(who.b.userId) }, { role: 'super_admin' },
      ]) {
        const response = await api('POST', '/customer/quotes', { cookie: S.a, body: { ...validQuote(), ...extra } });
        assert.equal(response.status, 422, JSON.stringify(extra));
      }
      assert.equal(await M.QuoteRequest.countDocuments(), before);
    });

    test('validation errors are field-level', async () => {
      const response = await api('POST', '/customer/quotes', { cookie: S.a, body: { ...validQuote(), pickupDate: '2020-01-01', commodity: '', weight: { value: -4 } } });
      assert.equal(response.status, 422);
      const fields = response.body.errors.map((e) => e.field);
      for (const field of ['pickupDate', 'commodity', 'weight.value']) assert.ok(fields.includes(field), field);
      assert.equal((await api('POST', '/customer/quotes', { cookie: S.a, body: { ...validQuote(), equipmentType: 'Spaceship' } })).status, 422);
      assert.equal((await api('POST', '/customer/quotes', { cookie: S.a, body: { ...validQuote(), deliveryDate: '2000-01-01' } })).status, 422);
    });
  });

  describe('shipments and tracking', () => {
    test('lists only own shipments with route data joined from the load', async () => {
      const response = await get('/customer/shipments', 'a');
      assert.equal(response.body.data.items.length, 1);
      const [shipment] = response.body.data.items;
      assert.equal(shipment.trackingNumber, 'HL-AAATRACK01');
      assert.equal(shipment.destination.city, 'Toronto');
      assert.equal(shipment.equipmentType, 'Dry Van');
      assert.equal(shipment.isCrossBorder, true);
      noLeaks(response);
      assert.equal((await get('/customer/shipments?status=delivered', 'a')).body.data.items.length, 0);
    });

    test('detail has timeline, documents and payments, but nothing internal', async () => {
      const response = await get(`/customer/shipments/${D.a.shipment.id}`, 'a');
      assert.equal(response.status, 200);
      const { shipment } = response.body.data;
      assert.deepEqual(shipment.charge, { amount: 245000, currency: 'USD' });
      assert.equal(shipment.events.length, 2);
      assert.deepEqual(Object.keys(shipment.events[0]).sort(), ['location', 'status', 'timestamp']);
      assert.deepEqual(shipment.documents.map((d) => d.name), ['AAA-visible.pdf']);
      assert.equal(shipment.payments.length, 2);
      noLeaks(response);
    });

    test('tracking finds own numbers only; someone else’s looks identical to a typo', async () => {
      const own = await get('/customer/tracking/hl-aaatrack01', 'a');
      assert.equal(own.status, 200);
      assert.equal(own.body.data.events.length, 2);
      noLeaks(own);
      const foreign = await get('/customer/tracking/HL-BBBTRACK01', 'a');
      const missing = await get('/customer/tracking/HL-NOSUCHTHING', 'a');
      for (const response of [foreign, missing]) {
        assert.equal(response.status, 404);
        assert.equal(response.body.code, 'SHIPMENT_NOT_FOUND');
      }
      assert.equal(foreign.text, missing.text);
      assert.equal((await get('/customer/tracking/bad%20number!', 'a')).status, 400);
    });
  });

  describe('documents', () => {
    test('lists only documents the customer is authorized to see, with no storage details', async () => {
      const response = await get('/customer/documents', 'a');
      assert.deepEqual(response.body.data.items.map((d) => d.name), ['AAA-visible.pdf']);
      assert.equal(response.body.data.items[0].relatedLabel, 'HL-AAATRACK01');
      assert.deepEqual(response.body.data.capabilities, { download: false, upload: false });
      noLeaks(response);
    });

    test('private, admin and carrier documents of the same customer are not reachable', async () => {
      for (const name of ['private', 'admin', 'carrierDoc']) {
        assert.equal((await get(`/customer/documents/${D.a.docs[name].id}`, 'a')).status, 404, name);
        assert.equal((await get(`/customer/documents/${D.a.docs[name].id}/download`, 'a')).status, 404, name);
      }
    });

    test('detail works for an authorized document; download is honestly unavailable after the ownership check', async () => {
      const detail = await get(`/customer/documents/${D.a.docs.visible.id}`, 'a');
      assert.equal(detail.status, 200);
      noLeaks(detail);
      const download = await get(`/customer/documents/${D.a.docs.visible.id}/download`, 'a');
      assert.equal(download.status, 501);
      assert.equal(download.body.code, 'DOWNLOAD_UNAVAILABLE');
      noLeaks(download);
    });
  });

  describe('invoices', () => {
    test('shows only own customer payments, adapted without invented invoice fields', async () => {
      const response = await get('/customer/invoices', 'a');
      const { items, summary } = response.body.data;
      assert.equal(items.length, 2);
      assert.deepEqual(items.map((i) => i.status).sort(), ['paid', 'pending']);
      assert.deepEqual(Object.keys(items[0]).sort(), ['amount', 'currency', 'id', 'loadNumber', 'paidAt', 'recordedAt', 'reference', 'status']);
      assert.deepEqual(summary, { outstandingCount: 1, outstandingTotals: [{ currency: 'USD', amount: 245000 }] });
      noLeaks(response);
    });
  });

  describe('notifications', () => {
    test('lists only the signed-in user’s notifications and counts unread', async () => {
      const response = await get('/customer/notifications', 'a');
      const items = response.body.data.items;
      // Phase 11: the customer's own quote actions earlier in this file now also create confirmations for them. Nothing of B's appears.
      assert.equal(items.filter((n) => n.title.startsWith('AAA')).length, 2);
      assert.ok(items.every((n) => n.title.startsWith('AAA') || /quote request|You accepted a quote|You declined a quote/i.test(n.title)), items.map((n) => n.title).join(' | '));
      assert.ok(items.every((n) => !n.title.startsWith('BBB')));
      const unreadItems = items.filter((n) => !n.isRead);
      assert.equal(response.body.data.unreadCount, unreadItems.length);
      assert.ok(unreadItems.some((n) => n.id === D.a.notes.unread.id));
      assert.equal((await get('/customer/notifications?unread=true', 'a')).body.data.items.length, unreadItems.length);
      assert.equal((await get('/customer/notifications?unread=maybe', 'a')).status, 400);
    });

    test('marking read changes only the caller’s own notification and is logged', async () => {
      const response = await api('PATCH', `/customer/notifications/${D.a.notes.unread.id}/read`, { cookie: S.a });
      assert.equal(response.status, 200);
      assert.equal(response.body.data.notification.isRead, true);
      const after = (await get('/customer/notifications', 'a')).body.data;
      assert.equal(after.items.find((n) => n.id === D.a.notes.unread.id).isRead, true);
      assert.equal(after.unreadCount, after.items.filter((n) => !n.isRead).length);
      const log = await M.ActivityLog.findOne({ action: 'customer.notification.read', userId: who.a.userId });
      assert.ok(log);
    });
  });

  describe('IDOR: customer A against customer B’s records', () => {
    const idors = () => [
      ['quote', `/customer/quotes/${D.b.quote.id}`], ['shipment', `/customer/shipments/${D.b.shipment.id}`],
      ['document', `/customer/documents/${D.b.docs.visible.id}`], ['document download', `/customer/documents/${D.b.docs.visible.id}/download`],
    ];

    test('every foreign id is a 404 identical to an id that does not exist', async () => {
      const missing = '0123456789abcdef01234567';
      for (const [label, path] of idors()) {
        const foreign = await get(path, 'a');
        const nothing = await get(path.replace(/[a-f0-9]{24}/, missing), 'a');
        assert.equal(foreign.status, 404, label);
        assert.equal(foreign.text, nothing.text, `${label}: foreign and missing must be indistinguishable`);
        assert.ok(!foreign.text.includes('BBB'), label);
      }
    });

    test('A cannot mark B’s notification as read', async () => {
      const response = await api('PATCH', `/customer/notifications/${D.b.notes.unread.id}/read`, { cookie: S.a });
      assert.equal(response.status, 404);
      assert.equal((await M.Notification.findById(D.b.notes.unread.id)).isRead, false);
    });

    test('a customerId in the query, body or path never changes whose data is returned', async () => {
      const viaQuery = await get(`/customer/quotes?customerId=${who.b.customerId}`, 'a');
      assert.equal(viaQuery.status, 400);
      const profile = await api('PATCH', '/customer/profile', { cookie: S.a, body: { customerId: String(who.b.customerId), companyName: 'Hijack' } });
      assert.equal(profile.status, 422);
      assert.equal((await M.Customer.findById(who.b.customerId)).companyName, 'B Freight');
      const header = await api('GET', '/customer/quotes', { cookie: S.a, headers: { 'X-Customer-Id': String(who.b.customerId) } });
      const numbers = header.body.data.items.map((item) => item.quoteNumber);
      assert.ok(numbers.includes('QT-T-AAA-1') && !numbers.includes('QT-T-BBB-1'));
    });

    test('B sees none of A’s data, and A’s profile and invoices stay separate', async () => {
      for (const path of ['/customer/quotes', '/customer/shipments', '/customer/documents', '/customer/invoices', '/customer/notifications', '/customer/dashboard']) {
        const response = await get(path, 'b');
        assert.equal(response.status, 200, path);
        assert.ok(!response.text.includes('AAA'), `${path} leaked customer A data`);
      }
      const profile = await get('/customer/profile', 'b');
      assert.equal(profile.body.data.account.email, 'cust.b@example.com');
    });

    test('malformed ids are a clean 400, never a 500', async () => {
      for (const path of ['/customer/quotes/not-an-id', '/customer/quotes/%7B%22%24ne%22%3Anull%7D', '/customer/shipments/123', '/customer/documents/zzz', '/customer/documents/zzz/download']) {
        const response = await get(path, 'a');
        assert.equal(response.status, 400, path);
        assert.ok(!/stack|mongoose|CastError/i.test(response.text));
      }
      assert.equal((await api('PATCH', '/customer/notifications/xyz/read', { cookie: S.a })).status, 400);
    });
  });

  describe('role escalation', () => {
    test('a customer cannot reach staff or other-role resources', async () => {
      for (const path of ['/users', '/customers', '/carriers', '/media']) {
        assert.equal((await get(path, 'a')).status, 403, path);
      }
    });

    test('profile and quote requests cannot carry role, admin or ownership fields', async () => {
      const user = await M.User.findById(who.a.userId).select('+tokenVersion');
      for (const extra of [
        { role: 'super_admin' }, { role: 'carrier' }, { accountType: 'super_admin' }, { isAdmin: true }, { permissions: ['*'] }, { isActive: false },
        { isEmailVerified: true }, { customerId: String(who.b.customerId) }, { userId: String(who.b.userId) }, { status: 'suspended' },
        { tokenVersion: 99 }, { passwordHash: 'x' }, { email: 'taken@example.com' }, { notes: 'x' }, { billing: { paymentTermsDays: 90 } },
      ]) {
        const response = await api('PATCH', '/customer/profile', { cookie: S.a, body: { firstName: 'Casey', ...extra } });
        assert.equal(response.status, 422, JSON.stringify(extra));
      }
      const after = await M.User.findById(who.a.userId).select('+tokenVersion');
      assert.equal(after.role, 'customer');
      assert.equal(after.email, 'cust.a@example.com');
      assert.equal(after.isEmailVerified, user.isEmailVerified, 'a customer cannot change their own verification status');
      assert.equal(after.tokenVersion, user.tokenVersion);
      assert.equal((await M.Customer.findById(who.a.customerId)).status, 'active');
      assert.equal((await get('/customer/dashboard', 'a')).status, 200, 'session still valid after the attempts');
    });
  });

  describe('profile', () => {
    test('returns the account and company without any security field', async () => {
      const response = await get('/customer/profile', 'a');
      assert.equal(response.status, 200);
      const { account, company } = response.body.data;
      assert.equal(account.email, 'cust.a@example.com');
      assert.equal(account.isEmailVerified, true);
      assert.equal(company.companyName, 'A Freight');
      noLeaks(response);
      assert.deepEqual(Object.keys(account).sort(), ['email', 'firstName', 'isEmailVerified', 'lastLogin', 'lastName', 'memberSince', 'phone']);
    });

    test('updates allowed fields, keeps staff-managed billing terms, and logs which fields changed', async () => {
      await M.Customer.updateOne({ _id: who.a.customerId }, { billingInformation: { paymentTermsDays: 30 } });
      const response = await api('PATCH', '/customer/profile', {
        cookie: S.a,
        body: {
          firstName: 'Cassidy', phone: '312-555-0199', companyName: 'Acme Freight Ltd', contactPerson: 'Dispatch Desk', businessEmail: 'ops@acme.example',
          address: { street: '1 Main St', city: 'Chicago', state: 'IL', zipCode: '60601', country: 'US' },
          billing: { contactName: 'AP Team', email: 'ap@acme.example' },
        },
      });
      assert.equal(response.status, 200);
      assert.equal(response.body.data.account.firstName, 'Cassidy');
      assert.equal(response.body.data.company.companyName, 'Acme Freight Ltd');
      assert.equal(response.body.data.company.billing.paymentTermsDays, 30);
      assert.equal(response.body.data.company.billing.contactName, 'AP Team');
      const customer = await M.Customer.findById(who.a.customerId);
      assert.equal(customer.phone, '312-555-0199');
      const log = await M.ActivityLog.findOne({ action: 'customer.profile.updated', userId: who.a.userId });
      assert.ok(log.metadata.fields.includes('companyName'));
      assert.ok(!JSON.stringify(log.toObject()).includes('312-555-0199'), 'values are not logged, only field names');
    });

    test('validates input', async () => {
      for (const body of [{}, { firstName: '' }, { phone: 'abc' }, { businessEmail: 'nope' }, { companyName: '' }, { address: { country: 'FR' } }]) {
        assert.equal((await api('PATCH', '/customer/profile', { cookie: S.a, body })).status, 422, JSON.stringify(body));
      }
    });

    test('a quote request submission is logged', async () => {
      assert.ok(await M.ActivityLog.findOne({ action: 'customer.quote.requested', userId: who.a.userId }));
    });
  });

  describe('password change', () => {
    const change = (as, body) => api('POST', '/customer/profile/password', { cookie: S[as], body });

    test('refuses a wrong current password, weak passwords and mismatches, and changes nothing', async () => {
      const hashBefore = (await M.User.findById(who.b.userId).select('+passwordHash')).passwordHash;
      const cases = [
        { currentPassword: 'wrong-password-123', password: PASS.fresh, passwordConfirmation: PASS.fresh },
        { currentPassword: PASS.customer, password: 'short', passwordConfirmation: 'short' },
        { currentPassword: PASS.customer, password: 'password123', passwordConfirmation: 'password123' },
        { currentPassword: PASS.customer, password: PASS.fresh, passwordConfirmation: 'different-one-9999' },
        { currentPassword: PASS.customer, password: PASS.customer, passwordConfirmation: PASS.customer },
        { currentPassword: PASS.customer, password: 'cust.b@example.com', passwordConfirmation: 'cust.b@example.com' },
        { currentPassword: PASS.customer, password: PASS.fresh, passwordConfirmation: PASS.fresh, role: 'admin' },
      ];
      for (const body of cases) assert.equal((await change('b', body)).status, 422, JSON.stringify(body));
      assert.equal((await M.User.findById(who.b.userId).select('+passwordHash')).passwordHash, hashBefore);
      assert.equal((await get('/customer/dashboard', 'b')).status, 200);
    });

    test('success ends other sessions, keeps this one, and the new password works', async () => {
      const oldCookie = S.b;
      const response = await change('b', { currentPassword: PASS.customer, password: PASS.fresh, passwordConfirmation: PASS.fresh });
      assert.equal(response.status, 200);
      assert.match(response.cookie, /^hashimi_token=/);
      assert.equal((await api('GET', '/customer/dashboard', { cookie: oldCookie })).status, 401, 'the old token is dead');
      assert.equal((await api('GET', '/customer/dashboard', { cookie: response.cookie })).status, 200, 'the fresh cookie works');
      assert.equal((await api('POST', '/auth/login', { body: { email: 'cust.b@example.com', password: PASS.customer } })).status, 401);
      const login = await api('POST', '/auth/login', { body: { email: 'cust.b@example.com', password: PASS.fresh } });
      assert.equal(login.status, 200);
      S.b = login.cookie;
      const logs = await M.ActivityLog.find({ userId: who.b.userId, action: /^customer\.password/ });
      assert.ok(logs.length >= 1);
      assert.ok(!JSON.stringify(logs.map((l) => l.toObject())).includes(PASS.fresh));
    });
  });
});
