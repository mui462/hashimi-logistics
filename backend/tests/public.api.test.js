/**
 * Public website API tests: guest quote request, carrier application, contact message and public tracking, plus the Super
 * Admin side of each (guest quotes in the quote workflow, applications list, contact inbox).
 *
 *   MONGO_TEST_URI=mongodb://127.0.0.1:27017/hashimi_public_test npm test
 *
 * The database name MUST end in "_test" (the suite drops it). Without MONGO_TEST_URI every test is skipped, not passed.
 * Nothing here sends e-mail or SMS: no provider is configured, and notifications are checked as in-app records only.
 */
import assert from 'node:assert/strict';
import { after, before, describe, mock, test } from 'node:test';

const testUri = process.env.MONGO_TEST_URI;
const skipReason = testUri ? false : 'MONGO_TEST_URI is not set; these tests require a live MongoDB';

if (testUri) {
  const databaseName = new URL(testUri).pathname.replace(/^\//, '');
  if (!databaseName.endsWith('_test')) throw new Error(`Refusing to run: database "${databaseName}" must end with "_test" because it is dropped afterwards.`);
  Object.assign(process.env, {
    NODE_ENV: 'development',
    MONGO_URI: testUri,
    JWT_SECRET: 'public-api-secret-public-api-secret-public-1234',
    CLIENT_URL: 'http://localhost:5173',
    AUTH_RATE_LIMIT_MAX: '10000',
    GLOBAL_RATE_LIMIT_MAX: '100000',
    LOGIN_ACCOUNT_LIMIT_MAX: '500',
    PUBLIC_FORM_LIMIT_MAX: '100000',
    TRACKING_LIMIT_MAX: '100000',
  });
}

const PASS = { admin: 'administrator-pass-phrase-1', customer: 'customer-pass-phrase-2', carrier: 'carrier-pass-phrase-3' };
const tomorrow = () => new Date(Date.now() + 86400000).toISOString().slice(0, 10);

const guestQuote = (overrides = {}) => ({
  origin: { city: 'Chicago', state: 'IL', zipCode: '60601', country: 'US' },
  destination: { city: 'Toronto', state: 'ON', country: 'CA' },
  pickupDate: tomorrow(),
  shipmentType: 'FTL',
  equipmentType: 'Dry Van',
  commodity: 'Packaged goods',
  weight: { value: 12000, unit: 'lb' },
  pallets: 10,
  specialInstructions: 'Dock closes at 4 pm.',
  contactInformation: { name: 'Pat Shipper', company: 'Pat Goods Ltd', email: 'Pat@Example.com', phone: '555 123 4567' },
  ...overrides,
});

const application = (overrides = {}) => ({
  companyName: 'Road Co',
  contactPerson: 'Sam Driver',
  email: 'sam@roadco.example',
  phone: '555 111 2222',
  mcNumber: '123456',
  dotNumber: '654321',
  address: '1 Main St, Gary, IN',
  equipmentTypes: ['Dry Van', 'Reefer'],
  operatingRegions: ['us_domestic', 'us_canada'],
  crossBorder: 'yes',
  notes: 'Two trucks available weekly.',
  ...overrides,
});

const contact = (overrides = {}) => ({
  name: 'Alex Visitor',
  company: 'Visitor Inc',
  email: 'alex@visitor.example',
  phone: '555 999 0000',
  interest: 'shipping',
  subject: 'Weekly lane Chicago to Dallas',
  message: 'Do you cover this lane every week?',
  ...overrides,
});

describe('public website API', { skip: skipReason }, () => {
  let mongoose;
  let server;
  let baseUrl;
  let M;
  let hashPassword;
  const S = {};
  let adminId;
  let shipment;

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
  const fields = (response) => (response.body.errors ?? []).map((error) => error.field);

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

    for (const [key, role, email] of [['admin', 'super_admin', 'root@example.com'], ['customer', 'customer', 'cust@example.com'], ['carrier', 'carrier', 'haul@example.com']]) {
      const user = await M.User.create({ firstName: 'Direct', lastName: role, email, role, passwordHash: await hashPassword(PASS[key]) });
      if (role === 'customer') await M.Customer.create({ userId: user._id, companyName: 'Cust Co' });
      if (role === 'carrier') await M.Carrier.create({ userId: user._id, companyName: 'Haul Co' });
      if (role === 'super_admin') adminId = user._id;
      const login = await api('POST', role === 'super_admin' ? '/auth/admin/login' : '/auth/login', { body: { email, password: PASS[key] } });
      assert.equal(login.status, 200, `${key} signs in`);
      S[key] = login.cookie;
    }

    const customer = await M.Customer.create({ userId: new mongoose.Types.ObjectId(), companyName: 'SECRET-CUSTOMER-NAME Corp', email: 'secret-customer@example.com' });
    const carrier = await M.Carrier.create({ userId: new mongoose.Types.ObjectId(), companyName: 'SECRET-CARRIER-NAME Trucking' });
    const load = await M.Load.create({
      loadNumber: 'LD-PUB-1', customerId: customer._id, carrierId: carrier._id, origin: { city: 'Chicago', state: 'IL', country: 'US' },
      destination: { city: 'Toronto', state: 'ON', country: 'CA' }, commodity: 'Parts', equipmentType: 'Dry Van', weight: { value: 100, unit: 'lb' },
      rate: 245000, carrierRate: 180000, brokerMargin: 65000, status: 'in_transit', internalNotes: 'SECRET-INTERNAL-NOTE',
    });
    shipment = await M.Shipment.create({
      trackingNumber: 'HL-PUBTRACK01', loadId: load._id, customerId: customer._id, carrierId: carrier._id, status: 'in_transit', borderStatus: 'pending',
      currentLocation: { city: 'Detroit', state: 'MI', country: 'US', latitude: 42.33, longitude: -83.05 },
      trackingEvents: [
        { status: 'booked', timestamp: new Date('2026-11-01T10:00:00Z'), description: 'SECRET-CARRIER-NAME assigned', createdBy: adminId },
        { status: 'in_transit', timestamp: new Date('2026-11-02T10:00:00Z'), location: { city: 'Detroit', state: 'MI', country: 'US', latitude: 42.33, longitude: -83.05 }, description: 'SECRET-DRIVER-NOTE' },
      ],
    });
    const oldLoad = await M.Load.create({
      loadNumber: 'LD-PUB-2', customerId: customer._id, carrierId: carrier._id, origin: { city: 'Chicago', country: 'US' }, destination: { city: 'Dallas', country: 'US' },
      commodity: 'Parts', equipmentType: 'Dry Van', weight: { value: 100, unit: 'lb' }, status: 'delivered',
    });
    await M.Shipment.create({ trackingNumber: 'HL-ARCHIVED01', loadId: oldLoad._id, customerId: customer._id, carrierId: carrier._id, status: 'delivered', archivedAt: new Date() });
  });

  after(async () => {
    mock.restoreAll();
    server?.close();
    await mongoose?.connection.dropDatabase();
    await mongoose?.disconnect();
  });

  /* ---------------------------------------------------------------- quote */

  describe('POST /quotes (guest quote request)', () => {
    let quoteNumber;

    test('stores a valid request as a new guest quote with no customer, and answers honestly', async () => {
      const response = await api('POST', '/quotes', { body: guestQuote() });
      assert.equal(response.status, 201);
      assert.match(response.body.data.quoteNumber, /^QT-\d{4}-\d{6}$/);
      assert.match(response.body.message, /No email confirmation is sent/);
      assert.doesNotMatch(response.body.message, /email (was )?sent|we emailed/i);
      assert.deepEqual(Object.keys(response.body.data), ['quoteNumber'], 'only the reference number comes back');
      assert.equal(response.headers.get('cache-control'), 'no-store');
      quoteNumber = response.body.data.quoteNumber;

      const stored = await M.QuoteRequest.findOne({ quoteNumber }).lean();
      assert.equal(stored.source, 'public');
      assert.equal(stored.customerId, undefined);
      assert.equal(stored.status, 'new');
      assert.equal(stored.isCrossBorder, true);
      assert.equal(stored.customsStatus, 'not_started');
      assert.equal(stored.contactInformation.email, 'pat@example.com', 'email is normalised');
      assert.equal(stored.contactInformation.company, 'Pat Goods Ltd');
      assert.equal(stored.attachments.length, 0);
    });

    test('alerts the Super Admin in-app and writes an audit entry', async () => {
      const quote = await M.QuoteRequest.findOne({ quoteNumber }).lean();
      const alert = await M.Notification.findOne({ recipientId: adminId, 'relatedEntity.entityId': quote._id }).lean();
      assert.ok(alert, 'the Super Admin has an in-app notification');
      assert.match(alert.title, /guest quote request/);
      assert.ok(await M.ActivityLog.findOne({ action: 'public.quote.requested', entityId: quote._id }).lean());
    });

    test('a repeat of the same request within minutes returns the first quote instead of a duplicate', async () => {
      const again = await api('POST', '/quotes', { body: guestQuote() });
      assert.equal(again.status, 201);
      assert.equal(again.body.data.quoteNumber, quoteNumber);
      assert.equal(await M.QuoteRequest.countDocuments({ source: 'public' }), 1);
    });

    test('missing and invalid fields are refused with field errors and nothing is stored', async () => {
      const before = await M.QuoteRequest.countDocuments({});
      const empty = await api('POST', '/quotes', { body: {} });
      assert.equal(empty.status, 422);
      for (const field of ['origin', 'destination', 'pickupDate', 'equipmentType', 'commodity', 'weight', 'contactInformation']) assert.ok(fields(empty).includes(field), field);

      const bad = await api('POST', '/quotes', {
        body: guestQuote({ equipmentType: 'dry_van', contactInformation: { name: '', email: 'nope', phone: 'x' }, origin: { city: '', country: 'FR' } }),
      });
      assert.equal(bad.status, 422);
      for (const field of ['equipmentType', 'contactInformation.name', 'contactInformation.email', 'contactInformation.phone', 'origin.city', 'origin.country']) {
        assert.ok(fields(bad).includes(field), field);
      }
      // Date rules run once the rest of the request is valid (the same as the customer portal).
      const past = await api('POST', '/quotes', { body: guestQuote({ pickupDate: '2000-01-01' }) });
      assert.equal(past.status, 422);
      assert.ok(fields(past).includes('pickupDate'));
      const lane = await api('POST', '/quotes', { body: guestQuote({ origin: { city: 'Toronto', country: 'CA' }, destination: { city: 'Monterrey', country: 'MX' } }) });
      assert.equal(lane.status, 422);
      assert.ok(fields(lane).includes('destination.country'));
      assert.equal(await M.QuoteRequest.countDocuments({}), before);
    });

    test('a visitor cannot set the owner, status, price, source or cross-border flag (mass assignment)', async () => {
      const before = await M.QuoteRequest.countDocuments({});
      const forged = [
        { customerId: '000000000000000000000001' }, { status: 'accepted' }, { quotedRate: 1 }, { source: 'customer' }, { isCrossBorder: false },
        { internalNotes: 'x' }, { quoteNumber: 'QT-FAKE' }, { attachments: ['000000000000000000000001'] },
      ];
      for (const extra of forged) {
        const response = await api('POST', '/quotes', { body: guestQuote({ commodity: `Forged ${Object.keys(extra)[0]}`, ...extra }) });
        assert.equal(response.status, 422, Object.keys(extra)[0]);
      }
      const operator = await api('POST', '/quotes', { body: guestQuote({ commodity: { $gt: '' } }) });
      assert.equal(operator.status, 400);
      assert.equal(await M.QuoteRequest.countDocuments({}), before);
    });

    test('the model itself refuses a portal quote with no customer and a guest quote with no contact details', async () => {
      const base = { quoteNumber: 'QT-MODEL-1', origin: { city: 'A', country: 'US' }, destination: { city: 'B', country: 'US' }, pickupDate: new Date(), commodity: 'x' };
      // Saving runs the async validate() with its pre-validate hooks (validateSync() skips hooks).
      const errorsOf = (doc) => doc.validate().then(() => ({}), (error) => error.errors);
      assert.ok((await errorsOf(new M.QuoteRequest(base))).customerId, 'a customer quote still needs its customer');
      const errors = await errorsOf(new M.QuoteRequest({ ...base, source: 'public' }));
      for (const key of ['contactInformation.name', 'contactInformation.email', 'contactInformation.phone']) assert.ok(errors[key], key);
    });

    test('a database failure is a safe 500: no stored record, no internal detail', async () => {
      const failing = mock.method(M.QuoteRequest, 'create', async () => {
        throw new Error('SECRET-DB-FAILURE at mongodb://internal-host');
      });
      try {
        const response = await api('POST', '/quotes', { body: guestQuote({ commodity: 'Failure path goods' }) });
        assert.equal(response.status, 500);
        assert.ok(!response.text.includes('SECRET-DB-FAILURE') && !response.text.includes('internal-host') && !response.text.includes('stack'));
        assert.equal(response.body.success, false);
      } finally {
        failing.mock.restore();
      }
    });

    describe('Super Admin quote workflow', () => {
      let quoteId;

      test('guest quotes appear in the admin quote list (filterable and searchable) without breaking customer quotes', async () => {
        const realCustomer = await M.Customer.findOne({ companyName: 'Cust Co' }).lean();
        await M.QuoteRequest.create({ ...guestQuote(), pickupDate: new Date(), quoteNumber: 'QT-PORTAL-1', customerId: realCustomer._id, isCrossBorder: true });

        const all = await api('GET', '/operations/quotes', { cookie: S.admin });
        assert.equal(all.status, 200);
        const guest = all.body.data.items.find((item) => item.quoteNumber === quoteNumber);
        const portal = all.body.data.items.find((item) => item.quoteNumber === 'QT-PORTAL-1');
        assert.equal(guest.isGuest, true);
        assert.equal(guest.source, 'public');
        assert.equal(guest.customer, null);
        assert.equal(guest.guestName, 'Pat Goods Ltd');
        assert.equal(portal.isGuest, false);
        assert.equal(portal.customer.companyName, 'Cust Co');
        quoteId = guest.id;

        const onlyGuests = await api('GET', '/operations/quotes?source=public', { cookie: S.admin });
        assert.deepEqual(onlyGuests.body.data.items.map((item) => item.quoteNumber), [quoteNumber]);
        const onlyPortal = await api('GET', '/operations/quotes?source=customer', { cookie: S.admin });
        assert.deepEqual(onlyPortal.body.data.items.map((item) => item.quoteNumber), ['QT-PORTAL-1']);
        const search = await api('GET', '/operations/quotes?q=pat%40example', { cookie: S.admin });
        assert.ok(search.body.data.items.some((item) => item.quoteNumber === quoteNumber));
      });

      test('the detail view shows the guest contact, and the admin can review and price it', async () => {
        const detail = await api('GET', `/operations/quotes/${quoteId}`, { cookie: S.admin });
        assert.equal(detail.status, 200);
        assert.deepEqual(detail.body.data.quote.contactInformation, { name: 'Pat Shipper', company: 'Pat Goods Ltd', email: 'pat@example.com', phone: '555 123 4567' });
        assert.equal((await api('POST', `/operations/quotes/${quoteId}/review`, { cookie: S.admin, body: {} })).status, 200);
        assert.equal((await api('POST', `/operations/quotes/${quoteId}/start-pricing`, { cookie: S.admin, body: {} })).status, 200);
        const priced = await api('PUT', `/operations/quotes/${quoteId}/pricing`, { cookie: S.admin, body: { customerRate: 245000, carrierRate: 200000 } });
        assert.equal(priced.status, 200, priced.text);
      });

      test('a guest quote cannot be sent through the portal or converted to a load: there is no customer', async () => {
        const send = await api('POST', `/operations/quotes/${quoteId}/send`, { cookie: S.admin, body: {} });
        assert.equal(send.status, 409);
        assert.equal(send.body.code, 'QUOTE_HAS_NO_CUSTOMER');
        const convert = await api('POST', `/operations/quotes/${quoteId}/convert`, { cookie: S.admin, body: {} });
        assert.equal(convert.status, 409);
        assert.equal(convert.body.code, 'QUOTE_HAS_NO_CUSTOMER');
        assert.equal(await M.Load.countDocuments({ quoteId }), 0);
        assert.equal((await M.QuoteRequest.findById(quoteId).lean()).status, 'pricing');
      });

      test('the admin can still cancel a guest quote', async () => {
        const cancel = await api('POST', `/operations/quotes/${quoteId}/cancel`, { cookie: S.admin, body: { reason: 'Requester booked elsewhere.' } });
        assert.equal(cancel.status, 200, cancel.text);
      });

      test('customers and carriers never see guest quotes, and cannot reach the admin quote list', async () => {
        const mine = await api('GET', '/customer/quotes', { cookie: S.customer });
        assert.equal(mine.status, 200);
        assert.ok(!mine.text.includes(quoteNumber));
        assert.equal((await api('GET', '/operations/quotes', { cookie: S.customer })).status, 403);
        assert.equal((await api('GET', '/operations/quotes', { cookie: S.carrier })).status, 403);
        assert.equal((await api('GET', '/operations/quotes')).status, 401);
      });
    });
  });

  /* ---------------------------------------------------------------- carrier application */

  describe('POST /carrier-applications', () => {
    test('stores a valid application as pending, never approved, with readable regions and the applicant notes', async () => {
      const response = await api('POST', '/carrier-applications', { body: application() });
      assert.equal(response.status, 201);
      assert.match(response.body.message, /No email confirmation is sent/);
      assert.deepEqual(response.body.data, {});
      const stored = await M.CarrierApplication.findOne({ DOTNumber: '654321' }).select('+notes').lean();
      assert.equal(stored.status, 'pending');
      assert.equal(stored.carrierId, undefined);
      assert.equal(stored.reviewedBy, undefined);
      assert.equal(stored.crossBorderCapability, true);
      assert.deepEqual(stored.equipmentTypes, ['Dry Van', 'Reefer']);
      assert.deepEqual(stored.operatingRegions, ['U.S. Domestic', 'U.S. ↔ Canada']);
      assert.equal(stored.address.street, '1 Main St, Gary, IN');
      assert.equal(stored.applicantNotes, 'Two trucks available weekly.');
      assert.equal(stored.notes, undefined, 'the internal notes field is not filled from the form');
      assert.equal(await M.Carrier.countDocuments({ companyName: 'Road Co' }), 0, 'no carrier account is created');
      assert.equal(await M.User.countDocuments({ email: 'sam@roadco.example' }), 0, 'no login is created');
      const alert = await M.Notification.findOne({ recipientId: adminId, 'relatedEntity.entityType': 'carrier_application' }).lean();
      assert.ok(alert);
      assert.ok(!alert.message.includes('Road Co'), 'the alert carries no applicant details');
    });

    test('a second application for the same carrier while one is open is not duplicated, and the answer is the same', async () => {
      const again = await api('POST', '/carrier-applications', { body: application({ email: 'other@roadco.example' }) });
      assert.equal(again.status, 201);
      assert.equal(again.body.message, (await api('POST', '/carrier-applications', { body: application() })).body.message);
      assert.equal(await M.CarrierApplication.countDocuments({ DOTNumber: '654321' }), 1);
    });

    test('a carrier whose earlier application was rejected may apply again', async () => {
      await M.CarrierApplication.updateOne({ DOTNumber: '654321' }, { $set: { status: 'rejected', reviewedBy: adminId, reviewedAt: new Date(), rejectionReason: 'Insurance expired.' } });
      assert.equal((await api('POST', '/carrier-applications', { body: application() })).status, 201);
      assert.equal(await M.CarrierApplication.countDocuments({ DOTNumber: '654321' }), 2);
    });

    test('missing and invalid fields are refused with field errors', async () => {
      const empty = await api('POST', '/carrier-applications', { body: {} });
      assert.equal(empty.status, 422);
      for (const field of ['companyName', 'contactPerson', 'email', 'phone', 'mcNumber', 'dotNumber', 'address', 'equipmentTypes', 'operatingRegions', 'crossBorder']) {
        assert.ok(fields(empty).includes(field), field);
      }
      const bad = await api('POST', '/carrier-applications', {
        body: application({ mcNumber: 'MC12', dotNumber: '123456789', equipmentTypes: ['dry_van'], operatingRegions: [], crossBorder: 'maybe', email: 'x' }),
      });
      assert.equal(bad.status, 422);
      for (const field of ['mcNumber', 'dotNumber', 'equipmentTypes.0', 'operatingRegions', 'crossBorder', 'email']) assert.ok(fields(bad).includes(field), field);
      const repeated = await api('POST', '/carrier-applications', { body: application({ equipmentTypes: ['Reefer', 'Reefer'] }) });
      assert.equal(repeated.status, 422);
    });

    test('an applicant cannot approve themselves or attach a carrier, reviewer or internal note (mass assignment)', async () => {
      const before = await M.CarrierApplication.countDocuments({});
      for (const extra of [{ status: 'approved' }, { carrierId: '000000000000000000000001' }, { reviewedBy: '000000000000000000000001' }, { internalNotes: 'x' }, { submittedDocuments: [] }]) {
        const response = await api('POST', '/carrier-applications', { body: application({ dotNumber: '777', mcNumber: '777', ...extra }) });
        assert.equal(response.status, 422, Object.keys(extra)[0]);
      }
      assert.equal(await M.CarrierApplication.countDocuments({}), before);
    });

    test('the Super Admin sees the application, with the applicant notes kept apart from internal notes', async () => {
      const list = await api('GET', '/admin/carrier-applications?status=pending', { cookie: S.admin });
      assert.equal(list.status, 200);
      const item = list.body.data.items.find((row) => row.DOTNumber === '654321');
      assert.ok(item);
      const detail = await api('GET', `/admin/carrier-applications/${item.id}`, { cookie: S.admin });
      assert.equal(detail.body.data.application.applicantNotes, 'Two trucks available weekly.');
      assert.equal(detail.body.data.application.internalNotes, null);
      assert.equal((await api('GET', '/admin/carrier-applications', { cookie: S.carrier })).status, 403);
      assert.equal((await api('GET', '/admin/carrier-applications', { cookie: S.customer })).status, 403);
    });

    test('a database failure is a safe 500 with no detail', async () => {
      const failing = mock.method(M.CarrierApplication, 'create', async () => {
        throw new Error('SECRET-DB-FAILURE');
      });
      try {
        const response = await api('POST', '/carrier-applications', { body: application({ dotNumber: '888', mcNumber: '888', email: 'fail@example.com' }) });
        assert.equal(response.status, 500);
        assert.ok(!response.text.includes('SECRET-DB-FAILURE'));
      } finally {
        failing.mock.restore();
      }
    });
  });

  /* ---------------------------------------------------------------- contact */

  describe('POST /contact and the admin inbox', () => {
    let messageId;

    test('stores a valid message as new and says honestly that no e-mail confirmation is sent', async () => {
      const response = await api('POST', '/contact', { body: contact() });
      assert.equal(response.status, 201);
      assert.match(response.body.message, /received/);
      assert.match(response.body.message, /No email confirmation is sent/);
      const stored = await M.ContactMessage.findOne({ email: 'alex@visitor.example' }).lean();
      assert.equal(stored.status, 'new');
      assert.equal(stored.message, 'Do you cover this lane every week?');
      messageId = String(stored._id);
      const alert = await M.Notification.findOne({ recipientId: adminId, title: 'A new contact message arrived' }).lean();
      assert.ok(alert);
      for (const word of ['Alex', 'alex@visitor.example', 'Weekly lane', '555 999']) assert.ok(!alert.message.includes(word), `alert leaks ${word}`);
    });

    test('phone and company are optional; a quick repeat is not stored twice', async () => {
      const minimal = contact({ email: 'min@visitor.example', phone: '', company: '' });
      assert.equal((await api('POST', '/contact', { body: minimal })).status, 201);
      assert.equal((await api('POST', '/contact', { body: minimal })).status, 201);
      assert.equal(await M.ContactMessage.countDocuments({ email: 'min@visitor.example' }), 1);
    });

    test('missing, invalid and forged fields are refused', async () => {
      const before = await M.ContactMessage.countDocuments({});
      const empty = await api('POST', '/contact', { body: {} });
      assert.equal(empty.status, 422);
      for (const field of ['name', 'email', 'interest', 'subject', 'message']) assert.ok(fields(empty).includes(field), field);
      const bad = await api('POST', '/contact', { body: contact({ interest: 'sales', email: 'nope', phone: 'abc', subject: 'x'.repeat(151), message: 'y'.repeat(3001) }) });
      for (const field of ['interest', 'email', 'phone', 'subject', 'message']) assert.ok(fields(bad).includes(field), field);
      assert.equal((await api('POST', '/contact', { body: contact({ status: 'handled' }) })).status, 422);
      assert.equal((await api('POST', '/contact', { body: contact({ handledBy: '000000000000000000000001' }) })).status, 422);
      assert.equal(await M.ContactMessage.countDocuments({}), before);
    });

    test('only the Super Admin can read the inbox; the list leaves the message body out, the detail carries it', async () => {
      assert.equal((await api('GET', '/admin/contact-messages')).status, 401);
      assert.equal((await api('GET', '/admin/contact-messages', { cookie: S.customer })).status, 403);
      assert.equal((await api('GET', '/admin/contact-messages', { cookie: S.carrier })).status, 403);
      assert.equal((await api('GET', `/admin/contact-messages/${messageId}`, { cookie: S.carrier })).status, 403);
      assert.equal((await api('POST', `/admin/contact-messages/${messageId}/handled`, { cookie: S.customer, body: {} })).status, 403);

      const list = await api('GET', '/admin/contact-messages?status=new', { cookie: S.admin });
      assert.equal(list.status, 200);
      assert.equal(list.headers.get('cache-control'), 'no-store');
      const row = list.body.data.items.find((item) => item.id === messageId);
      assert.equal(row.subject, 'Weekly lane Chicago to Dallas');
      assert.equal(row.message, undefined);
      const detail = await api('GET', `/admin/contact-messages/${messageId}`, { cookie: S.admin });
      assert.equal(detail.body.data.message.message, 'Do you cover this lane every week?');
      const search = await api('GET', '/admin/contact-messages?q=visitor%20inc', { cookie: S.admin });
      assert.ok(search.body.data.items.some((item) => item.id === messageId));
    });

    test('the Super Admin marks a message handled and can reopen it; both are audited', async () => {
      const handled = await api('POST', `/admin/contact-messages/${messageId}/handled`, { cookie: S.admin, body: {} });
      assert.equal(handled.status, 200);
      assert.equal(handled.body.data.message.status, 'handled');
      assert.ok(handled.body.data.message.handledAt);
      assert.equal(handled.body.data.message.handledBy.email, 'root@example.com');
      const reopened = await api('POST', `/admin/contact-messages/${messageId}/reopen`, { cookie: S.admin, body: {} });
      assert.equal(reopened.body.data.message.status, 'new');
      assert.equal(reopened.body.data.message.handledAt, null);
      assert.equal(await M.ActivityLog.countDocuments({ module: 'contact_messages', entityId: messageId, userId: adminId }), 2);
      assert.equal((await api('POST', '/admin/contact-messages/000000000000000000000001/handled', { cookie: S.admin, body: {} })).status, 404);
    });

    test('a database failure is a safe 500 with no detail', async () => {
      const failing = mock.method(M.ContactMessage, 'create', async () => {
        throw new Error('SECRET-DB-FAILURE');
      });
      try {
        const response = await api('POST', '/contact', { body: contact({ email: 'fail@visitor.example' }) });
        assert.equal(response.status, 500);
        assert.ok(!response.text.includes('SECRET-DB-FAILURE'));
      } finally {
        failing.mock.restore();
      }
    });
  });

  /* ---------------------------------------------------------------- tracking */

  describe('GET /tracking/:trackingNumber', () => {
    const FORBIDDEN = [
      'SECRET-CUSTOMER-NAME', 'SECRET-CARRIER-NAME', 'SECRET-DRIVER-NOTE', 'SECRET-INTERNAL-NOTE', 'secret-customer@example.com', 'customerId', 'carrierId', 'loadId',
      'rate', 'Margin', 'description', 'createdBy', 'latitude', 'longitude', 'currentLocation', 'LD-PUB-1', '_id',
    ];

    test('returns only the public tracking view: number, status, cross-border flag and city-level events', async () => {
      const response = await api('GET', '/tracking/HL-PUBTRACK01');
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      const data = response.body.data;
      assert.deepEqual(Object.keys(data).sort(), ['events', 'isCrossBorder', 'status', 'trackingNumber']);
      assert.equal(data.trackingNumber, 'HL-PUBTRACK01');
      assert.equal(data.status, 'in_transit');
      assert.equal(data.isCrossBorder, true);
      assert.deepEqual(data.events, [
        { status: 'booked', timestamp: '2026-11-01T10:00:00.000Z', location: '' },
        { status: 'in_transit', timestamp: '2026-11-02T10:00:00.000Z', location: 'Detroit, MI, US' },
      ]);
      for (const word of FORBIDDEN) assert.ok(!response.text.includes(word), `tracking leaked "${word}"`);
    });

    test('lower-case input finds the same shipment', async () => {
      assert.equal((await api('GET', '/tracking/hl-pubtrack01')).body.data.trackingNumber, 'HL-PUBTRACK01');
    });

    test('an unknown or archived number is a plain SHIPMENT_NOT_FOUND, with nothing else revealed', async () => {
      for (const number of ['HL-NOSUCHONE1', 'HL-ARCHIVED01']) {
        const response = await api('GET', `/tracking/${number}`);
        assert.equal(response.status, 404, number);
        assert.equal(response.body.code, 'SHIPMENT_NOT_FOUND');
        assert.deepEqual(Object.keys(response.body).sort(), ['code', 'errors', 'message', 'success']);
      }
    });

    test('a malformed number is refused before any lookup', async () => {
      for (const number of [encodeURIComponent('HL 1'), encodeURIComponent('{"$ne":1}'), 'x'.repeat(41)]) {
        assert.equal((await api('GET', `/tracking/${number}`)).status, 400, number);
      }
    });

    test('signed-in users get the same public view (the portal routes stay the way to see more)', async () => {
      const asCustomer = await api('GET', '/tracking/HL-PUBTRACK01', { cookie: S.customer });
      assert.equal(asCustomer.status, 200);
      for (const word of FORBIDDEN) assert.ok(!asCustomer.text.includes(word), `tracking leaked "${word}"`);
    });

    test('a database failure is a safe 500 with no detail', async () => {
      const failing = mock.method(M.Shipment, 'findOne', () => {
        throw new Error('SECRET-DB-FAILURE');
      });
      try {
        const response = await api('GET', '/tracking/HL-PUBTRACK01');
        assert.equal(response.status, 500);
        assert.ok(!response.text.includes('SECRET-DB-FAILURE'));
      } finally {
        failing.mock.restore();
      }
    });
  });

  test('the three account types are unchanged: public forms create no user and no new role', async () => {
    assert.deepEqual((await M.User.distinct('role')).sort(), ['carrier', 'customer', 'super_admin']);
    assert.equal(await M.User.countDocuments({}), 3);
  });
});
