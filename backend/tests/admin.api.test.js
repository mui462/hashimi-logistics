/**
 * Phase 8 Super Admin read API (/api/v1/admin): access control, explicit presenters, validation and honest empty states.
 *
 *   MONGO_TEST_URI=mongodb://127.0.0.1:27018/hl_test node --test tests/admin.api.test.js
 *
 * The database name MUST end in "_test" (it is dropped). Without MONGO_TEST_URI every test is skipped, not passed.
 * Verified against FerretDB, not real MongoDB.
 */
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

const testUri = process.env.MONGO_TEST_URI;
const skipReason = testUri ? false : 'MONGO_TEST_URI is not set; these tests require a live MongoDB';

if (testUri) {
  const databaseName = new URL(testUri).pathname.replace(/^\//, '');
  if (!databaseName.endsWith('_test')) throw new Error(`Refusing to run: database "${databaseName}" must end with "_test".`);
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
    LOGIN_ACCOUNT_LIMIT_MAX: '500',
  });
}

const PASS = 'admin-panel-pass-phrase-1';
const MISSING = '000000000000000000000001';

describe('super admin read API', { skip: skipReason }, () => {
  let mongoose;
  let server;
  let baseUrl;
  let M;
  let hashPassword;
  let routerStack;
  const S = {};
  const ID = {};

  async function api(method, path, { body, cookie } = {}) {
    const response = await fetch(`${baseUrl}/api/v1${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    const setCookie = response.headers.get('set-cookie');
    return { status: response.status, text, body: text ? JSON.parse(text) : null, cookie: setCookie ? setCookie.split(';')[0] : null };
  }
  const adm = (path, method = 'GET', body) => api(method, `/admin${path}`, { cookie: S.admin, body });
  const ok = (response) => {
    assert.equal(response.status, 200, response.text.slice(0, 400));
    return response.body.data;
  };
  const refuse = (response, status, code) => {
    assert.equal(response.status, status, response.text.slice(0, 400));
    if (code) assert.equal(response.body.code, code, response.text.slice(0, 400));
  };

  async function mkUser(role, email) {
    return M.User.create({ firstName: 'Panel', lastName: role, email, role, passwordHash: await hashPassword(PASS) });
  }
  async function login(key, email, path = '/auth/login') {
    const response = await api('POST', path, { body: { email, password: PASS } });
    assert.equal(response.status, 200, response.text);
    S[key] = response.cookie;
  }

  before(async () => {
    const database = await import('../src/config/database.js');
    ({ default: mongoose } = await import('mongoose'));
    const { default: app } = await import('../src/app.js');
    M = await import('../src/models/index.js');
    ({ hashPassword } = await import('../src/services/password.service.js'));
    ({ default: { stack: routerStack } } = await import('../src/admin/admin.routes.js'));
    await database.connectDatabase();
    await mongoose.connection.dropDatabase();
    const results = await Promise.allSettled(Object.values(M.models).map((Model) => Model.init()));
    results.forEach((result) => {
      if (result.status === 'rejected' && !/partialFilterExpression/.test(result.reason?.message ?? '')) throw result.reason;
    });
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    const admin = await mkUser('super_admin', 'panel.root@example.com');
    ID.admin = admin._id;
    const cUser = await mkUser('customer', 'panel.customer@example.com');
    const kUser = await mkUser('carrier', 'panel.carrier@example.com');
    await login('admin', 'panel.root@example.com', '/auth/admin/login');
    await login('customer', 'panel.customer@example.com');
    await login('carrier', 'panel.carrier@example.com');

    const customer = await M.Customer.create({
      userId: cUser._id,
      companyName: 'Zulu Shipping Co',
      contactPerson: 'Zed',
      email: 'zulu.biz@example.com',
      notes: 'SECRET-CUSTOMER-NOTE',
      billingInformation: { contactName: 'Bill', paymentTermsDays: 30 },
    });
    const carrier = await M.Carrier.create({
      userId: kUser._id,
      companyName: 'Yoyo Carriers',
      status: 'active',
      authorityStatus: 'active',
      complianceStatus: 'approved',
      equipmentTypes: ['Dry Van'],
      MCNumber: 'MC-777',
      DOTNumber: 'DOT-888',
      notes: 'SECRET-CARRIER-NOTE',
      rating: 4.5,
      insurance: { provider: 'Shield', policyNumber: 'P-1', expirationDate: new Date('2030-01-01') },
    });
    await M.Carrier.create({ userId: (await mkUser('carrier', 'second.carrier@example.com'))._id, companyName: 'Xenon Freight', status: 'pending' });
    ID.customer = customer._id;
    ID.carrier = carrier._id;

    const application = await M.CarrierApplication.create({
      companyName: 'Applicant Haulage',
      contactPerson: 'Appl Icant',
      email: 'apply@example.com',
      phone: '555-010-0000',
      MCNumber: 'MC-APP',
      notes: 'SECRET-APPLICATION-NOTE',
    });
    ID.application = application._id;

    const load = await M.Load.create({
      loadNumber: 'LD-2026-900001',
      customerId: customer._id,
      origin: { city: 'Chicago', state: 'IL', country: 'US' },
      destination: { city: 'Dallas', state: 'TX', country: 'US' },
      commodity: 'Widgets',
      equipmentType: 'Dry Van',
    });
    ID.load = load._id;
    const document = await M.Document.create({
      name: 'Bill of lading.pdf',
      type: 'BOL',
      fileUrl: 'https://files.example.com/private/SECRET-FILE-URL.pdf',
      storageKey: 'SECRET-STORAGE-KEY',
      fileSize: 2048,
      mimeType: 'application/pdf',
      uploadedBy: admin._id,
      relatedEntityType: 'load',
      relatedEntityId: load._id,
      customerId: customer._id,
      visibility: 'customer',
    });
    ID.document = document._id;
    const payment = await M.Payment.create({
      loadId: load._id,
      customerId: customer._id,
      amount: 125000,
      paymentType: 'customer_payment',
      status: 'pending',
      referenceNumber: 'REF-1',
      notes: 'SECRET-PAYMENT-NOTE',
    });
    ID.payment = payment._id;
    await M.Payment.create({ loadId: load._id, carrierId: carrier._id, amount: 90000, paymentType: 'carrier_payment', status: 'paid', paymentDate: new Date() });

    await M.Notification.create({ recipientId: admin._id, type: 'system', title: 'For admin', message: 'Admin only' });
    await M.Notification.create({ recipientId: cUser._id, type: 'system', title: 'For customer', message: 'Customer only' });
    await M.ActivityLog.create({
      userId: admin._id,
      action: 'operations.quote.sent',
      module: 'quotes',
      entityId: load._id,
      description: 'A quote was sent',
      metadata: { quoteNumber: 'QT-1', nested: { fine: true } },
    });
    await M.ActivityLog.create({ action: 'auth.login.failed', module: 'auth', description: 'Failed sign-in', IPAddress: '203.0.113.9' });
  });

  after(async () => {
    server?.close();
    await mongoose?.connection.dropDatabase();
    await mongoose?.disconnect();
  });

  const ROUTES = [
    '/overview',
    '/search?q=zu',
    '/customers',
    `/customers/${MISSING}`,
    '/carriers',
    `/carriers/${MISSING}`,
    '/carrier-applications',
    `/carrier-applications/${MISSING}`,
    '/documents',
    `/documents/${MISSING}`,
    '/payments',
    `/payments/${MISSING}`,
    '/notifications',
    '/activity-logs',
    '/security',
    '/settings',
  ];

  describe('access control', () => {
    for (const route of ROUTES) {
      test(`GET ${route.split('?')[0]}: guest 401, customer 403, carrier 403`, async () => {
        refuse(await api('GET', `/admin${route}`), 401);
        refuse(await api('GET', `/admin${route}`, { cookie: S.customer }), 403);
        refuse(await api('GET', `/admin${route}`, { cookie: S.carrier }), 403);
      });
    }

    test('notification read is also admin-only', async () => {
      refuse(await api('POST', `/admin/notifications/${MISSING}/read`), 401);
      refuse(await api('POST', `/admin/notifications/${MISSING}/read`, { cookie: S.customer }), 403);
    });

    test('every route in the module is read-only apart from marking a notification read, the Phase 10 document writes and the Phase 11 delivery retry', () => {
      const routes = routerStack.filter((layer) => layer.route).map((layer) => layer.route);
      const writes = routes.flatMap((route) => Object.keys(route.methods).filter((method) => method !== 'get').map((method) => `${method} ${route.path}`));
      // Phase 10 deliberately adds Super Admin document management and Phase 11 the retry of a failed delivery. The Super Admin carrier approval workflow (approve, reject, suspend, reactivate, application decision) is audited and Super Admin only. The website contact inbox
      // adds marking a message handled / back to new (status only; the visitor's message is never edited). Any other write route is still a failure here.
      assert.deepEqual(writes, ['post /carriers/:id/approve', 'post /carriers/:id/reject', 'post /carriers/:id/suspend', 'post /carriers/:id/reactivate', 'post /carrier-applications/:id/decision', 'post /contact-messages/:id/handled', 'post /contact-messages/:id/reopen', 'post /documents', 'patch /documents/:id', 'post /documents/:id/archive', 'post /documents/:id/restore', 'post /notifications/:id/read', 'post /notification-deliveries/:id/retry']);
    });
  });

  describe('overview and search', () => {
    test('reports real partner counts', async () => {
      const data = ok(await adm('/overview'));
      assert.equal(data.customers.total, 1);
      assert.equal(data.carriers.total, 2);
      assert.equal(data.carriers.pending, 1);
      assert.equal(data.applications.pending, 1);
      assert.equal(data.unreadNotifications, 1);
    });

    test('search finds partners by name and numbers by prefix, and rejects short or operator input', async () => {
      const found = ok(await adm('/search?q=zulu')).results;
      assert.ok(found.some((row) => row.type === 'customer' && row.label === 'Zulu Shipping Co'));
      assert.ok(ok(await adm('/search?q=LD-2026')).results.some((row) => row.type === 'load'));
      assert.deepEqual(ok(await adm('/search?q=nothing-matches')).results, []);
      refuse(await adm('/search?q=z'), 400);
      refuse(await adm('/search'), 400);
      refuse(await adm('/search?q[$ne]=x'), 400);
      assert.equal((await adm(`/search?q=${encodeURIComponent('.*')}`)).status, 200);
    });
  });

  describe('customers and carriers', () => {
    test('customer list and filters', async () => {
      const list = ok(await adm('/customers'));
      assert.equal(list.items.length, 1);
      assert.equal(list.pagination.total, 1);
      assert.equal(ok(await adm('/customers?q=zulu')).items.length, 1);
      assert.equal(ok(await adm('/customers?q=nomatch')).items.length, 0);
      assert.equal(ok(await adm('/customers?status=suspended')).items.length, 0);
      refuse(await adm('/customers?status=wrong'), 400);
      refuse(await adm('/customers?limit=1000'), 400);
      refuse(await adm('/customers?sort=passwordHash'), 400);
      refuse(await adm('/customers?unknown=1'), 400);
    });

    test('customer detail has counts and notes but no credential data', async () => {
      const response = await adm(`/customers/${ID.customer}`);
      const { customer } = ok(response);
      assert.equal(customer.companyName, 'Zulu Shipping Co');
      assert.equal(customer.internalNotes, 'SECRET-CUSTOMER-NOTE');
      assert.equal(customer.account.email, 'panel.customer@example.com');
      assert.deepEqual(customer.counts, { quotes: 0, loads: 1, shipments: 0 });
      for (const word of ['passwordHash', 'tokenVersion', 'userId', 'resetToken', 'verificationToken']) assert.ok(!response.text.includes(word), `leaked ${word}`);
    });

    test('carrier list filters and detail', async () => {
      assert.equal(ok(await adm('/carriers')).items.length, 2);
      assert.equal(ok(await adm('/carriers?status=pending')).items.length, 1);
      assert.equal(ok(await adm('/carriers?q=MC-777')).items.length, 1);
      assert.equal(ok(await adm('/carriers?equipmentType=Dry Van')).items.length, 1);
      refuse(await adm('/carriers?complianceStatus=nope'), 400);
      const response = await adm(`/carriers/${ID.carrier}`);
      const { carrier } = ok(response);
      assert.equal(carrier.MCNumber, 'MC-777');
      assert.equal(carrier.rating, 4.5);
      assert.equal(carrier.insurance.expired, false);
      assert.equal(carrier.internalNotes, 'SECRET-CARRIER-NOTE');
      assert.equal(carrier.counts.loads, 0);
      assert.ok(!response.text.includes('passwordHash'));
    });

    test('unknown, malformed and operator ids', async () => {
      refuse(await adm(`/customers/${MISSING}`), 404, 'NOT_FOUND');
      refuse(await adm(`/carriers/${MISSING}`), 404, 'NOT_FOUND');
      refuse(await adm('/customers/not-an-id'), 400);
      refuse(await adm('/customers/%24ne'), 400);
    });

    test('an archived customer is not listed or readable', async () => {
      const user = await mkUser('customer', 'archived.customer@example.com');
      const archived = await M.Customer.create({ userId: user._id, companyName: 'Archived Co', archivedAt: new Date() });
      assert.equal(ok(await adm('/customers?q=Archived')).items.length, 0);
      refuse(await adm(`/customers/${archived._id}`), 404);
    });
  });

  describe('carrier applications', () => {
    test('lists and shows detail with the internal note, and exposes no workflow', async () => {
      assert.equal(ok(await adm('/carrier-applications')).items.length, 1);
      assert.equal(ok(await adm('/carrier-applications?status=approved')).items.length, 0);
      const { application } = ok(await adm(`/carrier-applications/${ID.application}`));
      assert.equal(application.status, 'pending');
      assert.equal(application.internalNotes, 'SECRET-APPLICATION-NOTE');
      assert.equal(application.reviewedBy, null);
      assert.equal(ok(await adm('/carrier-applications')).items[0].internalNotes, undefined);
      refuse(await adm(`/carrier-applications/${ID.application}/approve`, 'POST', {}), 404);
    });
  });

  describe('documents', () => {
    test('never exposes the file URL or storage key, and offers no download', async () => {
      const list = await adm('/documents');
      const detail = await adm(`/documents/${ID.document}`);
      for (const response of [list, detail]) {
        for (const word of ['SECRET-FILE-URL', 'SECRET-STORAGE-KEY', 'fileUrl', 'storageKey']) assert.ok(!response.text.includes(word), `leaked ${word}`);
      }
      const { document } = ok(detail);
      assert.equal(document.download.available, false);
      assert.equal(document.customer.companyName, 'Zulu Shipping Co');
      assert.equal(document.uploadedBy.role, 'super_admin');
      assert.equal(ok(list).items.length, 1);
      assert.equal(ok(await adm('/documents?type=POD')).items.length, 0);
      assert.equal(ok(await adm('/documents?q=bill')).items.length, 1);
      refuse(await adm('/documents?type=Nope'), 400);
      refuse(await adm(`/documents/${MISSING}`), 404);
    });
  });

  describe('payments', () => {
    test('uses only ledger fields, hides notes from the list, and filters', async () => {
      const list = await adm('/payments');
      assert.ok(!list.text.includes('SECRET-PAYMENT-NOTE'));
      assert.equal(ok(list).items.length, 2);
      assert.equal(ok(await adm('/payments?status=paid')).items.length, 1);
      assert.equal(ok(await adm('/payments?paymentType=carrier_payment')).items.length, 1);
      assert.equal(ok(await adm(`/payments?customerId=${ID.customer}`)).items.length, 1);
      const { payment } = ok(await adm(`/payments/${ID.payment}`));
      assert.deepEqual(payment.amount, { amount: 125000, currency: 'USD' });
      assert.equal(payment.load.loadNumber, 'LD-2026-900001');
      assert.equal(payment.internalNotes, 'SECRET-PAYMENT-NOTE');
      for (const invented of ['transactionId', 'invoiceNumber', 'processor', 'stripe']) assert.equal(payment[invented], undefined);
      refuse(await adm('/payments?status=refunded'), 400);
      refuse(await adm('/payments?createdFrom=yesterday'), 400);
      refuse(await adm(`/payments/${MISSING}`), 404);
    });
  });

  describe('notifications', () => {
    test("only the signed-in admin's own notifications, and mark-read is scoped", async () => {
      const data = ok(await adm('/notifications'));
      assert.equal(data.items.length, 1);
      assert.equal(data.items[0].title, 'For admin');
      assert.equal(data.unreadCount, 1);
      const foreign = await M.Notification.findOne({ title: 'For customer' });
      refuse(await adm(`/notifications/${foreign._id}/read`, 'POST'), 404);
      assert.equal((await M.Notification.findById(foreign._id)).isRead, false);
      ok(await adm(`/notifications/${data.items[0].id}/read`, 'POST'));
      assert.equal(ok(await adm('/notifications')).unreadCount, 0);
      assert.equal(ok(await adm('/notifications?unread=true')).items.length, 0);
    });
  });

  describe('activity logs and security', () => {
    test('lists with actor, result and safe metadata; filters work', async () => {
      const data = ok(await adm('/activity-logs'));
      assert.ok(data.items.length >= 2);
      const sent = data.items.find((row) => row.action === 'operations.quote.sent');
      assert.equal(sent.result, 'success');
      assert.equal(sent.actor.email, 'panel.root@example.com');
      assert.deepEqual(sent.metadata, { quoteNumber: 'QT-1', nested: { fine: true } });
      assert.equal(ok(await adm('/activity-logs?result=failure')).items.every((row) => row.result === 'failure'), true);
      assert.equal(ok(await adm('/activity-logs?result=success')).items.some((row) => row.action === 'auth.login.failed'), false);
      assert.equal(ok(await adm('/activity-logs?module=quotes')).items.length, 1);
      assert.equal(ok(await adm('/activity-logs?action=quote.sent')).items.length, 1);
      assert.equal(ok(await adm(`/activity-logs?userId=${ID.admin}`)).items.every((row) => row.actor.email === 'panel.root@example.com'), true);
      assert.equal(ok(await adm('/activity-logs?from=2099-01-01')).items.length, 0);
      refuse(await adm('/activity-logs?module=nope'), 400);
      refuse(await adm('/activity-logs?action[$regex]=.*'), 400);
      refuse(await adm('/activity-logs?action=%28%3F%3A'), 400);
    });

    test('redacts secret-looking metadata keys at read time even if one were stored', async () => {
      const { safeMetadata } = await import('../src/admin/admin.presenters.js');
      assert.deepEqual(safeMetadata({ ok: 1, password: 'x', nested: { apiKey: 'y', fine: 2 }, list: [{ token: 'z', a: 1 }] }), { ok: 1, nested: { fine: 2 }, list: [{ a: 1 }] });
    });

    test('security center reports real counts and labels what is unavailable, with no secrets', async () => {
      const response = await adm('/security');
      const data = ok(response);
      assert.equal(data.account.superAdminAccounts, 1);
      assert.equal(data.account.role, 'super_admin');
      assert.ok(data.authEvents.failedSignIns.last24Hours >= 1);
      assert.ok(data.authEvents.successfulSignIns.last24Hours >= 3);
      assert.ok(data.unavailable.includes('Two-factor authentication'));
      assert.match(data.session.storage, /HttpOnly/);
      for (const word of ['passwordHash', 'tokenVersion', 'JWT_SECRET', 'api-test-secret', 'hashimi_token', S.admin.split('=')[1].slice(0, 20)]) {
        assert.ok(!response.text.includes(word), `leaked ${word}`);
      }
    });
  });

  describe('settings', () => {
    test('reports "not configured" without creating a document on read', async () => {
      const data = ok(await adm('/settings'));
      assert.deepEqual(data, { settings: null, configured: false });
      assert.equal(await M.SiteSettings.countDocuments({}), 0);
    });

    test('presents saved settings through an allow-list', async () => {
      await M.SiteSettings.create({ key: 'primary', companyName: 'HASHIMI LOGISTICS LLC', email: 'hello@example.com', timezone: 'America/Chicago' });
      const data = ok(await adm('/settings'));
      assert.equal(data.configured, true);
      assert.equal(data.settings.email, 'hello@example.com');
      assert.equal(data.settings._id, undefined);
    });
  });

  describe('new operations list filters (additive)', () => {
    test('quotes accept origin/destination/equipment filters and shipments accept live and date filters', async () => {
      assert.equal((await adm('/x')).status, 404);
      const get = (path) => api('GET', `/operations${path}`, { cookie: S.admin });
      ok(await get('/quotes?originCountry=US&destinationCountry=CA&equipmentType=Dry Van'));
      refuse(await get('/quotes?originCountry=ZZ'), 400);
      ok(await get('/shipments?live=true&createdFrom=2026-01-01&createdTo=2099-01-01'));
      refuse(await get('/shipments?live=maybe'), 400);
      refuse(await get('/shipments?createdFrom=soon'), 400);
    });
  });
});
