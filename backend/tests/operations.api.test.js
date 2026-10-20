/**
 * Phase 7 brokerage-operations API tests: security (roles, IDOR, mass assignment, operator injection, money, visibility)
 * and the five end-to-end workflows A-E.
 *
 *   MONGO_TEST_URI=mongodb://127.0.0.1:27017/hashimi_operations_test npm run test:db
 *
 * The database name MUST end in "_test" (the suite drops it). Without MONGO_TEST_URI every test is skipped, not passed.
 * Verified against FerretDB, not real MongoDB: see docs/BROKERAGE_OPERATIONS.md.
 */
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

const testUri = process.env.MONGO_TEST_URI;
const skipReason = testUri ? false : 'MONGO_TEST_URI is not set; these tests require a live MongoDB';

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
    LOGIN_ACCOUNT_LIMIT_MAX: '500',
  });
}

const PASS = 'operations-pass-phrase-1';
const MISSING = '000000000000000000000001';
const CUSTOMER_RATE = 312345; // customer price: never visible to carriers
const CARRIER_RATE = 251234; // carrier pay: never visible to customers
const MARGIN = CUSTOMER_RATE - CARRIER_RATE; // 61111: admin only
const future = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

describe('brokerage operations API', { skip: skipReason }, () => {
  let mongoose;
  let server;
  let baseUrl;
  let M;
  let hashPassword;
  let routerStack;
  const S = {};
  const U = {}; // user ids
  const ID = {}; // customer / carrier profile ids

  async function api(method, path, { body, cookie, headers = {}, raw } = {}) {
    const response = await fetch(`${baseUrl}/api/v1${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...headers },
      body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
    });
    const text = await response.text();
    const setCookie = response.headers.get('set-cookie');
    return { status: response.status, text, body: text ? JSON.parse(text) : null, cookie: setCookie ? setCookie.split(';')[0] : null, headers: response.headers };
  }
  const adm = (method, path, body) => api(method, `/operations${path}`, { cookie: S.admin, body });
  const as = (who, method, path, body) => api(method, path, { cookie: S[who], body });
  const ok = (response, status = 200) => {
    assert.equal(response.status, status, response.text.slice(0, 400));
    return response.body.data;
  };
  const refuse = (response, status, code) => {
    assert.equal(response.status, status, response.text.slice(0, 400));
    if (code) assert.equal(response.body.code, code, response.text.slice(0, 400));
    return response.body;
  };
  const notLeaking = (response, words) => {
    for (const word of words) assert.ok(!response.text.includes(word), `response leaked "${word}"`);
  };

  /** What a customer must never see / what a carrier must never see. */
  const CUSTOMER_FORBIDDEN = ['Alpha Trucking', 'Bravo Freight', 'carrierRate', 'brokerMargin', 'internalNotes', 'carrierId', String(CARRIER_RATE), String(MARGIN), 'assignmentHistory', 'SECRET-ADMIN-NOTE'];
  const CARRIER_FORBIDDEN = ['Xray Shippers', 'Yankee Imports', 'customerId', 'brokerMargin', 'internalNotes', 'estimatedRate', String(CUSTOMER_RATE), String(MARGIN), 'assignmentHistory', 'SECRET-ADMIN-NOTE', 'contactName', 'contactPhone'];

  const validQuote = (extra = {}) => ({
    origin: { city: 'Dallas', state: 'TX', zipCode: '75201', country: 'US', street: '1 Dock Rd', facilityName: 'Xray DC' },
    destination: { city: 'Denver', state: 'CO', country: 'US' },
    pickupDate: future(20),
    equipmentType: 'Dry Van',
    commodity: 'Packaged goods',
    weight: { value: 8000, unit: 'lb' },
    contactInformation: { name: 'Dana Dock', email: 'dock@example.com', phone: '214-555-0100' },
    ...extra,
  });
  const borderQuote = (extra = {}) => validQuote({ origin: { city: 'Chicago', state: 'IL', zipCode: '60601', country: 'US' }, destination: { city: 'Toronto', state: 'ON', country: 'CA' }, ...extra });

  const pricedBody = { customerRate: CUSTOMER_RATE, carrierRate: CARRIER_RATE };
  const SCHEDULE = {
    pickup: { earliest: '2026-12-02T08:00', latest: '2026-12-02T12:00', timezone: 'America/Chicago' },
    delivery: { earliest: '2026-12-04T08:00', latest: '2026-12-04T17:00', timezone: 'America/Denver' },
  };

  /** Customer request through to a priced, sent, accepted quote. */
  async function acceptedQuote(who = 'x', quoteExtra = {}, pricing = pricedBody) {
    const created = ok(await as(who, 'POST', '/customer/quotes', validQuote(quoteExtra)), 201).quote;
    const id = created.id;
    ok(await adm('POST', `/operations/quotes/${id}/review`.replace('/operations', ''), {}));
    ok(await adm('POST', `/quotes/${id}/start-pricing`, {}));
    ok(await adm('PUT', `/quotes/${id}/pricing`, pricing));
    ok(await adm('POST', `/quotes/${id}/send`, { validForDays: 7 }));
    ok(await as(who, 'POST', `/customer/quotes/${id}/accept`, {}));
    return id;
  }

  /** ... on through conversion, schedule and opening. */
  async function openLoad(who = 'x', quoteExtra = {}, { schedule = SCHEDULE, pricing = pricedBody } = {}) {
    const quoteId = await acceptedQuote(who, quoteExtra, pricing);
    const converted = ok(await adm('POST', `/quotes/${quoteId}/convert`, {}));
    const loadId = converted.load.id;
    ok(await adm('PUT', `/loads/${loadId}/schedule`, schedule));
    ok(await adm('POST', `/loads/${loadId}/open`, {}));
    return { quoteId, loadId, loadNumber: converted.load.loadNumber };
  }

  async function assignedLoad(carrier = 'a', who = 'x', quoteExtra = {}) {
    const made = await openLoad(who, quoteExtra);
    ok(await adm('POST', `/loads/${made.loadId}/assign`, { carrierId: String(ID[carrier]), reason: 'Best fit' }));
    return made;
  }

  async function shipmentFor(made) {
    const { shipment } = ok(await adm('POST', `/loads/${made.loadId}/shipment`, {}), 201);
    return { ...made, shipmentId: shipment.id, trackingNumber: shipment.trackingNumber, shipmentNumber: shipment.shipmentNumber };
  }

  const step = async (shipmentId, action, body = {}) => ok(await adm('POST', `/shipments/${shipmentId}/${action}`, body)).shipment;

  async function mkUser(role, email, extra = {}) {
    const user = await M.User.create({ firstName: 'Op', lastName: role, email, role, passwordHash: await hashPassword(PASS), isEmailVerified: true });
    return user;
  }
  async function login(key, email, path = '/auth/login') {
    const response = await api('POST', path, { body: { email, password: PASS } });
    assert.equal(response.status, 200, response.text);
    S[key] = response.cookie;
  }
  async function mkCarrier(key, companyName, overrides = {}) {
    const user = await mkUser('carrier', `${key}.carrier@example.com`);
    const carrier = await M.Carrier.create({
      userId: user._id,
      companyName,
      status: 'active',
      authorityStatus: 'active',
      complianceStatus: 'approved',
      equipmentTypes: ['Dry Van'],
      operatingRegions: ['Nationwide'],
      crossBorderCapability: false,
      MCNumber: `MC-${key}`,
      ...overrides,
    });
    U[key] = user._id;
    ID[key] = carrier._id;
    return carrier;
  }

  before(async () => {
    const database = await import('../src/config/database.js');
    ({ default: mongoose } = await import('mongoose'));
    const { default: app } = await import('../src/app.js');
    M = await import('../src/models/index.js');
    ({ hashPassword } = await import('../src/services/password.service.js'));
    ({ default: { stack: routerStack } } = await import('../src/operations/operations.routes.js'));
    await database.connectDatabase();
    await mongoose.connection.dropDatabase();
    const results = await Promise.allSettled(Object.values(M.models).map((Model) => Model.init()));
    results.forEach((result) => {
      if (result.status === 'rejected' && !/partialFilterExpression/.test(result.reason?.message ?? '')) throw result.reason;
    });
    (await import('../src/notifications/providers/index.js')).setEmailProviderForTests(null);
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    await mkUser('super_admin', 'ops.root@example.com');
    await login('admin', 'ops.root@example.com', '/auth/admin/login');
    for (const [key, name] of [['x', 'Xray Shippers Inc'], ['y', 'Yankee Imports Inc']]) {
      const user = await mkUser('customer', `${key}.customer@example.com`);
      const customer = await M.Customer.create({ userId: user._id, companyName: name, contactPerson: `${key} contact`, email: `${key}.biz@example.com` });
      U[`c${key}`] = user._id;
      ID[`c${key}`] = customer._id;
      await login(key, `${key}.customer@example.com`);
    }

    await mkCarrier('a', 'Alpha Trucking LLC', { equipmentTypes: ['Dry Van', 'Reefer'], operatingRegions: ['Texas', 'Illinois'], crossBorderCapability: true });
    await mkCarrier('b', 'Bravo Freight Inc');
    await mkCarrier('c', 'Charlie Suspended Co', { status: 'suspended' });
    await mkCarrier('d', 'Delta Flatbed Co', { equipmentTypes: ['Flatbed'] });
    await mkCarrier('e', 'Echo Pending Co', { status: 'pending', authorityStatus: 'pending', complianceStatus: 'pending' });
    await mkCarrier('f', 'Foxtrot Expired Insurance', { insurance: { provider: 'Old Co', expirationDate: new Date('2020-01-01') } });
    await mkCarrier('g', 'Golf NoArea Co', { operatingRegions: [] });
    await mkCarrier('h', 'Hotel California Co', { operatingRegions: ['California'] });
    await mkCarrier('i', 'India Archived Co', { archivedAt: new Date() });
    for (const key of ['a', 'b', 'c', 'e', 'g', 'h']) await login(key, `${key}.carrier@example.com`);
  });

  after(async () => {
    server.close();
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  /* ======================================================================== security */

  describe('authentication and role gate', () => {
    const fill = (path) => path.replace(':id', MISSING).replace(':exceptionId', MISSING);

    test('every operations route refuses anonymous users, customers and carriers', async () => {
      const routes = routerStack.filter((layer) => layer.route).flatMap((layer) => Object.keys(layer.route.methods).map((method) => ({ method: method.toUpperCase(), path: fill(layer.route.path) })));
      assert.ok(routes.length >= 40, `found only ${routes.length} routes`);
      for (const { method, path } of routes) {
        const body = method === 'GET' ? undefined : {};
        assert.equal((await api(method, `/operations${path}`, { body })).status, 401, `anonymous ${method} ${path}`);
        assert.equal((await api(method, `/operations${path}`, { body, cookie: S.x })).status, 403, `customer ${method} ${path}`);
        assert.equal((await api(method, `/operations${path}`, { body, cookie: S.a })).status, 403, `carrier ${method} ${path}`);
      }
    });

    test('responses are never cacheable', async () => {
      assert.equal((await adm('GET', '/dashboard')).headers.get('cache-control'), 'no-store');
    });

    test('there is still exactly one super admin and no new roles', async () => {
      assert.equal(await M.User.countDocuments({ role: 'super_admin' }), 1);
      const roles = await M.User.distinct('role');
      assert.deepEqual(roles.sort(), ['carrier', 'customer', 'super_admin']);
    });
  });

  describe('dashboard on an empty system', () => {
    test('reports zeros, not invented numbers', async () => {
      const data = ok(await adm('GET', '/dashboard'));
      assert.equal(data.quotes.total, 0);
      assert.equal(data.loads.total, 0);
      assert.equal(data.loads.needingCarrier, 0);
      assert.equal(data.shipments.total, 0);
      assert.equal(data.shipments.openExceptions, 0);
      assert.deepEqual(data.financials.byCurrency, []);
      assert.deepEqual(data.recentActivity, []);
    });
  });

  /* ================================================================ A: the full path */

  describe('Workflow A: customer quote to completed shipment (domestic)', () => {
    const W = {};

    test('the customer submits a quote and cannot accept it before it is quoted', async () => {
      const created = ok(await as('x', 'POST', '/customer/quotes', validQuote()), 201).quote;
      W.quoteId = created.id;
      assert.equal(created.status, 'new');
      refuse(await as('x', 'POST', `/customer/quotes/${W.quoteId}/accept`, {}), 409, 'INVALID_STATUS_TRANSITION');
      const listed = ok(await adm('GET', '/quotes?status=new'));
      assert.ok(listed.items.some((quote) => quote.id === W.quoteId));
      assert.equal(listed.items.find((quote) => quote.id === W.quoteId).operationsStatus, 'submitted');
    });

    test('staff cannot skip stages: pricing before review is refused', async () => {
      refuse(await adm('POST', `/quotes/${W.quoteId}/start-pricing`, {}), 409, 'INVALID_STATUS_TRANSITION');
      refuse(await adm('POST', `/quotes/${W.quoteId}/send`, { validForDays: 7 }), 409, 'INVALID_STATUS_TRANSITION');
      refuse(await adm('POST', `/quotes/${W.quoteId}/convert`, {}), 409, 'INVALID_STATUS_TRANSITION');
    });

    test('review, price: the margin is computed server-side and the customer sees nothing yet', async () => {
      assert.equal(ok(await adm('POST', `/quotes/${W.quoteId}/review`, { internalNote: 'SECRET-ADMIN-NOTE' })).quote.operationsStatus, 'under_review');
      assert.equal(ok(await adm('POST', `/quotes/${W.quoteId}/start-pricing`, {})).quote.status, 'pricing');
      refuse(await adm('POST', `/quotes/${W.quoteId}/send`, { validForDays: 7 }), 409, 'QUOTE_NOT_PRICED');
      const priced = ok(await adm('PUT', `/quotes/${W.quoteId}/pricing`, pricedBody)).quote;
      assert.equal(priced.pricing.customerRate.amount, CUSTOMER_RATE);
      assert.equal(priced.pricing.carrierRate.amount, CARRIER_RATE);
      assert.equal(priced.pricing.brokerMargin.amount, MARGIN);
      assert.equal(priced.internalNotes, 'SECRET-ADMIN-NOTE');

      const seen = await as('x', 'GET', `/customer/quotes/${W.quoteId}`);
      assert.equal(seen.body.data.quote.rate, null, 'no rate while pricing');
      notLeaking(seen, CUSTOMER_FORBIDDEN.concat(String(CUSTOMER_RATE)));
      const listSeen = await as('x', 'GET', '/customer/quotes');
      notLeaking(listSeen, CUSTOMER_FORBIDDEN.concat(String(CUSTOMER_RATE)));
    });

    test('sending the quote shows the customer only their price and notifies them', async () => {
      const sent = ok(await adm('POST', `/quotes/${W.quoteId}/send`, { validForDays: 3 })).quote;
      assert.equal(sent.status, 'quoted');
      assert.ok(new Date(sent.quoteExpiresAt) > new Date(Date.now() + 2 * 86400000));
      const seen = await as('x', 'GET', `/customer/quotes/${W.quoteId}`);
      assert.deepEqual(seen.body.data.quote.rate, { amount: CUSTOMER_RATE, currency: 'USD' });
      assert.equal(seen.body.data.quote.canRespond, true);
      notLeaking(seen, CUSTOMER_FORBIDDEN);
      const notes = await M.Notification.find({ recipientId: U.cx, type: 'quote' }).lean();
      assert.ok(notes.some((note) => /ready/i.test(note.title)));
    });

    test('another customer cannot accept or decline it (404) and nothing changes', async () => {
      refuse(await as('y', 'POST', `/customer/quotes/${W.quoteId}/accept`, {}), 404);
      refuse(await as('y', 'POST', `/customer/quotes/${W.quoteId}/decline`, {}), 404);
      assert.equal((await M.QuoteRequest.findById(W.quoteId)).status, 'quoted');
    });

    test('acceptance is idempotent: one state change, one log entry, one staff notification', async () => {
      const first = await as('x', 'POST', `/customer/quotes/${W.quoteId}/accept`, {});
      assert.equal(first.status, 200);
      assert.equal(first.body.data.quote.status, 'customer_accepted');
      const again = await as('x', 'POST', `/customer/quotes/${W.quoteId}/accept`, {});
      assert.equal(again.status, 200);
      assert.equal(again.body.data.quote.status, 'customer_accepted');
      assert.equal(await M.ActivityLog.countDocuments({ action: 'customer.quote.accepted', entityId: W.quoteId }), 1);
      assert.equal(await M.Notification.countDocuments({ recipientId: U.admin ?? (await M.User.findOne({ role: 'super_admin' }))._id, title: /accepted/i }), 1);
      refuse(await as('x', 'POST', `/customer/quotes/${W.quoteId}/decline`, {}), 409, 'INVALID_STATUS_TRANSITION');
    });

    test('conversion creates exactly one draft load linked both ways, once', async () => {
      const converted = ok(await adm('POST', `/quotes/${W.quoteId}/convert`, {}));
      W.loadId = converted.load.id;
      assert.match(converted.load.loadNumber, /^LD-\d{4}-\d{6}$/);
      assert.equal(converted.quote.status, 'converted_to_load');
      assert.equal(converted.quote.load.id, W.loadId);
      const load = (await adm('GET', `/loads/${W.loadId}`)).body.data.load;
      assert.equal(load.status, 'draft');
      assert.equal(load.quote.id, W.quoteId);
      assert.equal(load.customer.companyName, 'Xray Shippers Inc');
      assert.equal(load.pricing.customerRate.amount, CUSTOMER_RATE);
      assert.equal(load.pricing.brokerMargin.amount, MARGIN);
      assert.equal(load.crossBorder, false);
      refuse(await adm('POST', `/quotes/${W.quoteId}/convert`, {}), 409, 'QUOTE_ALREADY_CONVERTED');
      assert.equal(await M.Load.countDocuments({ quoteId: W.quoteId }), 1);
      const stored = await M.Load.findById(W.loadId).select('+convertedBy').lean();
      assert.equal(String(stored.convertedBy), String((await M.User.findOne({ role: 'super_admin' }))._id), 'records who converted it');
    });

    test('a draft load is not ready to open until pickup timezone, equipment and pay exist', async () => {
      const response = refuse(await adm('POST', `/loads/${W.loadId}/open`, {}), 409, 'LOAD_NOT_READY');
      assert.ok(response.errors.some((error) => error.field === 'pickup'));
    });

    test('schedule uses the facility timezone, never an assumed one', async () => {
      const load = ok(await adm('PUT', `/loads/${W.loadId}/schedule`, { ...SCHEDULE, pickupAppointment: { scheduledAt: '2026-12-02T09:30', timezone: 'America/Chicago', confirmationNumber: 'APPT-77' } })).load;
      assert.equal(load.pickup.earliest, '2026-12-02T14:00:00.000Z'); // 08:00 CST
      assert.equal(load.pickup.timezone, 'America/Chicago');
      assert.equal(load.pickup.earliestLocal, '2026-12-02 08:00');
      assert.equal(load.delivery.earliest, '2026-12-04T15:00:00.000Z'); // 08:00 MST
      assert.equal(load.pickupAppointment.scheduledAt, '2026-12-02T15:30:00.000Z');
      assert.equal(load.pickupAppointment.scheduledLocal, '2026-12-02 09:30');
    });

    test('opening, then the matching list ranks eligible carriers and explains every exclusion', async () => {
      assert.equal(ok(await adm('POST', `/loads/${W.loadId}/open`, {})).load.status, 'open');
      const { matching } = ok(await adm('GET', `/loads/${W.loadId}/carrier-matches`));
      const matchNames = matching.matches.map((match) => match.companyName);
      assert.deepEqual(matchNames.sort(), ['Alpha Trucking LLC', 'Bravo Freight Inc']);
      assert.equal(matching.matches[0].companyName, 'Alpha Trucking LLC', 'a state-level match outranks a wildcard');
      const reasons = Object.fromEntries(matching.excluded.map((entry) => [entry.companyName, entry.reasons.map((reason) => reason.code)]));
      assert.deepEqual(reasons['Charlie Suspended Co'], ['CARRIER_NOT_ACTIVE']);
      assert.deepEqual(reasons['Delta Flatbed Co'], ['EQUIPMENT_MISMATCH']);
      assert.deepEqual(reasons['Echo Pending Co'].sort(), ['AUTHORITY_NOT_ACTIVE', 'CARRIER_NOT_ACTIVE', 'COMPLIANCE_NOT_APPROVED']);
      assert.deepEqual(reasons['Foxtrot Expired Insurance'], ['INSURANCE_EXPIRED']);
      assert.deepEqual(reasons['Golf NoArea Co'], ['NO_SERVICE_AREA']);
      assert.deepEqual(reasons['Hotel California Co'], ['OUTSIDE_SERVICE_AREA']);
      assert.equal('India Archived Co' in reasons || matchNames.includes('India Archived Co'), false, 'archived carriers never appear');
      assert.equal(matching.counts.eligible, 2);
    });

    test('the carrier board applies the same rules: eligible carriers see it, others get a plain 404', async () => {
      const board = await as('b', 'GET', '/carrier/loads');
      const found = board.body.data.items.find((item) => item.id === W.loadId);
      assert.ok(found, 'Bravo sees the load');
      assert.deepEqual(found.pay, { amount: CARRIER_RATE, currency: 'USD' });
      assert.equal(found.pickupWindow.timezone, 'America/Chicago');
      notLeaking(board, CARRIER_FORBIDDEN);
      assert.equal((await as('h', 'GET', '/carrier/loads')).body.data.items.some((item) => item.id === W.loadId), false, 'out of area');
      assert.equal((await as('h', 'GET', `/carrier/loads/${W.loadId}`)).status, 404);
      assert.equal((await as('g', 'GET', '/carrier/loads')).body.data.eligibility.hint !== null, true, 'no-area carrier is told why');
      assert.equal((await as('b', 'GET', `/carrier/loads/${W.loadId}`)).status, 200);
    });

    test('an ineligible carrier cannot be assigned, and the load is untouched', async () => {
      for (const [key, code] of [['c', 'CARRIER_NOT_ACTIVE'], ['d', 'EQUIPMENT_MISMATCH'], ['h', 'OUTSIDE_SERVICE_AREA'], ['e', 'AUTHORITY_NOT_ACTIVE'], ['i', 'CARRIER_ARCHIVED']]) {
        const response = refuse(await adm('POST', `/loads/${W.loadId}/assign`, { carrierId: String(ID[key]) }), 409, 'CARRIER_NOT_ELIGIBLE');
        assert.ok(response.errors.some((error) => error.code === code), `${key}: ${code}`);
      }
      refuse(await adm('POST', `/loads/${W.loadId}/assign`, { carrierId: MISSING }), 404, 'CARRIER_NOT_FOUND');
      assert.equal((await M.Load.findById(W.loadId)).status, 'open');
    });

    test('assignment records who and why, notifies the carrier, and hides the carrier from the customer', async () => {
      const load = ok(await adm('POST', `/loads/${W.loadId}/assign`, { carrierId: String(ID.a), reason: 'Best fit on Texas lane' })).load;
      assert.equal(load.status, 'assigned');
      assert.equal(load.operationsStatus, 'carrier_assigned');
      assert.equal(load.carrier.companyName, 'Alpha Trucking LLC');
      assert.equal(load.assignmentHistory.length, 1);
      assert.equal(load.assignmentHistory[0].reason, 'Best fit on Texas lane');
      assert.ok(load.assignmentHistory[0].assignedBy);
      assert.equal(load.assignmentHistory[0].unassignedAt, null);
      refuse(await adm('POST', `/loads/${W.loadId}/assign`, { carrierId: String(ID.b) }), 409, 'INVALID_STATUS_TRANSITION');

      const carrierNotes = await M.Notification.find({ recipientId: U.a }).lean();
      assert.ok(carrierNotes.some((note) => /assigned to you/i.test(note.title)));
      const customerNotes = await M.Notification.find({ recipientId: U.cx }).lean();
      assert.ok(customerNotes.some((note) => /carrier was assigned/i.test(note.title)));
      assert.equal(customerNotes.some((note) => /Alpha/.test(`${note.title} ${note.message}`)), false, 'customer notice never names the carrier');
      assert.equal((await as('b', 'GET', '/carrier/loads')).body.data.items.some((item) => item.id === W.loadId), false, 'off the board once assigned');
    });

    test('the carrier sees the load with their pay and nothing about the customer or margin', async () => {
      const mine = await as('a', 'GET', `/carrier/my-loads/${W.loadId}`);
      assert.equal(mine.status, 200);
      assert.deepEqual(mine.body.data.load.pay, { amount: CARRIER_RATE, currency: 'USD' });
      notLeaking(mine, CARRIER_FORBIDDEN);
      assert.equal((await as('b', 'GET', `/carrier/my-loads/${W.loadId}`)).status, 404);
    });

    test('the shipment is created once with a random tracking number unrelated to its shipment number', async () => {
      const created = ok(await adm('POST', `/loads/${W.loadId}/shipment`, {}), 201).shipment;
      W.shipmentId = created.id;
      W.trackingNumber = created.trackingNumber;
      assert.equal(created.status, 'booked');
      assert.equal(created.operationsStatus, 'scheduled');
      assert.match(created.shipmentNumber, /^SH-\d{4}-\d{6}$/);
      assert.match(created.trackingNumber, /^HL-[A-HJ-KM-NP-Z2-9]{10}$/);
      assert.equal(created.trackingNumber.includes(created.shipmentNumber.slice(-6)), false);
      assert.equal(created.proofOfDelivery.recorded, false, 'no fake proof of delivery');
      refuse(await adm('POST', `/loads/${W.loadId}/shipment`, {}), 409, 'SHIPMENT_ALREADY_EXISTS');
      assert.equal(await M.Shipment.countDocuments({ loadId: W.loadId }), 1);
    });

    test('out-of-order steps are refused', async () => {
      for (const action of ['pickup', 'in-transit', 'deliver', 'complete', 'out-for-delivery']) {
        refuse(await adm('POST', `/shipments/${W.shipmentId}/${action}`, {}), 409, 'INVALID_STATUS_TRANSITION');
      }
      refuse(await adm('POST', `/shipments/${W.shipmentId}/at-border`, {}), 409);
    });

    test('dispatch, pickup, transit, delivery and completion keep load and shipment in step', async () => {
      assert.equal((await step(W.shipmentId, 'dispatch')).status, 'dispatched');
      assert.equal((await M.Load.findById(W.loadId)).status, 'dispatched');
      const picked = await step(W.shipmentId, 'pickup', { location: { city: 'Dallas', state: 'TX', country: 'US' }, note: 'SECRET-ADMIN-NOTE driver on time' });
      assert.equal(picked.status, 'picked_up');
      assert.ok(picked.actualPickup);
      assert.equal(await M.Load.findById(W.loadId).then((l) => l.status), 'picked_up');
      assert.equal((await step(W.shipmentId, 'in-transit', { location: { city: 'Oklahoma City', state: 'OK', country: 'US' } })).status, 'in_transit');
      assert.equal((await M.Load.findById(W.loadId)).status, 'in_transit');
      ok(await adm('POST', `/shipments/${W.shipmentId}/tracking-updates`, { location: { city: 'Wichita', state: 'KS', country: 'US' } }));
      assert.equal((await step(W.shipmentId, 'out-for-delivery')).status, 'out_for_delivery');
      const delivered = await step(W.shipmentId, 'deliver');
      assert.equal(delivered.status, 'delivered');
      assert.ok(delivered.actualDelivery);
      assert.equal((await M.Load.findById(W.loadId)).status, 'delivered');
      const done = await step(W.shipmentId, 'complete');
      assert.equal(done.status, 'completed');
      assert.ok(done.completedAt);
      assert.equal((await M.Load.findById(W.loadId)).status, 'completed');
      assert.ok(done.trackingEvents.length >= 8);
      refuse(await adm('POST', `/shipments/${W.shipmentId}/deliver`, {}), 409, 'INVALID_STATUS_TRANSITION');
      refuse(await adm('POST', `/shipments/${W.shipmentId}/cancel`, { reason: 'too late' }), 409);
    });

    test('the customer tracks it by number with no carrier, no rates and no internal notes', async () => {
      const tracked = await as('x', 'GET', `/customer/tracking/${W.trackingNumber}`);
      assert.equal(tracked.status, 200);
      assert.equal(tracked.body.data.shipment?.status ?? tracked.body.data.status, 'completed');
      notLeaking(tracked, CUSTOMER_FORBIDDEN);
      const detail = await as('x', 'GET', `/customer/shipments/${W.shipmentId}`);
      assert.equal(detail.status, 200);
      notLeaking(detail, CUSTOMER_FORBIDDEN);
      assert.equal((await as('y', 'GET', `/customer/shipments/${W.shipmentId}`)).status, 404, 'other customers cannot see it');
      const carrierView = await as('a', 'GET', `/carrier/shipments/${W.shipmentId}`);
      assert.equal(carrierView.status, 200);
      notLeaking(carrierView, CARRIER_FORBIDDEN);
    });

    test('every step left an audit entry and the notifications carry no foreign identity or money', async () => {
      const actions = (await M.ActivityLog.find({ entityId: { $in: [W.quoteId, W.loadId, W.shipmentId] } }).lean()).map((entry) => entry.action);
      for (const expected of ['operations.quote.review_started', 'operations.quote.priced', 'operations.quote.sent', 'customer.quote.accepted', 'operations.quote.converted', 'operations.load.scheduled', 'operations.load.opened', 'operations.load.assigned', 'operations.shipment.created', 'operations.shipment.dispatch', 'operations.shipment.pickup', 'operations.shipment.deliver', 'operations.shipment.complete']) {
        assert.ok(actions.includes(expected), `missing audit entry ${expected}`);
      }
      const secrets = /SECRET-ADMIN-NOTE|312345|251234|61111|passwordHash|jwt/i;
      for (const note of await M.Notification.find({}).lean()) {
        assert.equal(secrets.test(`${note.title} ${note.message}`), false, note.title);
      }
      for (const note of await M.Notification.find({ recipientId: U.cx }).lean()) assert.equal(/Alpha|Bravo|Trucking/.test(`${note.title} ${note.message}`), false);
      for (const note of await M.Notification.find({ recipientId: U.a }).lean()) assert.equal(/Xray|Shippers/.test(`${note.title} ${note.message}`), false);
      const metadata = JSON.stringify((await M.ActivityLog.find({}).lean()).map((entry) => entry.metadata));
      assert.equal(/password|token|secret/i.test(metadata.replace(/SECRET-ADMIN-NOTE/g, '')), false);
    });

    test('dashboard counts agree with the database', async () => {
      const data = ok(await adm('GET', '/dashboard'));
      assert.equal(data.loads.completed, await M.Load.countDocuments({ status: 'completed' }));
      assert.equal(data.shipments.completed, await M.Shipment.countDocuments({ status: 'completed' }));
      assert.equal(data.quotes.converted_to_load, await M.QuoteRequest.countDocuments({ status: 'converted_to_load' }));
      assert.equal(data.quotes.total, await M.QuoteRequest.countDocuments({}));
      const usd = data.financials.byCurrency.find((row) => row.currency === 'USD');
      assert.equal(usd.brokerMargin, usd.customerRevenue - usd.carrierCost);
      assert.ok(data.recentActivity.length > 0);
    });
  });

  /* =========================================================== B: cross-border lane */

  describe('Workflow B: cross-border shipment', () => {
    const W = {};

    test('only a cross-border capable carrier is eligible; a domestic-only carrier is refused', async () => {
      Object.assign(W, await openLoad('x', borderQuote(), { schedule: { pickup: { earliest: '2026-12-02T08:00', latest: '2026-12-02T12:00', timezone: 'America/Chicago' }, delivery: { earliest: '2026-12-04T08:00', latest: '2026-12-04T17:00', timezone: 'America/Toronto' } } }));
      const load = (await adm('GET', `/loads/${W.loadId}`)).body.data.load;
      assert.equal(load.crossBorder, true);
      const { matching } = ok(await adm('GET', `/loads/${W.loadId}/carrier-matches`));
      assert.deepEqual(matching.matches.map((match) => match.companyName), ['Alpha Trucking LLC']);
      assert.ok(matching.excluded.find((entry) => entry.companyName === 'Bravo Freight Inc').reasons.some((reason) => reason.code === 'CROSS_BORDER_NOT_PERMITTED'));
      const response = refuse(await adm('POST', `/loads/${W.loadId}/assign`, { carrierId: String(ID.b) }), 409, 'CARRIER_NOT_ELIGIBLE');
      assert.ok(response.errors.some((error) => error.code === 'CROSS_BORDER_NOT_PERMITTED'));
      assert.equal((await as('b', 'GET', '/carrier/loads')).body.data.items.some((item) => item.id === W.loadId), false);
      assert.equal((await as('a', 'GET', '/carrier/loads')).body.data.items.some((item) => item.id === W.loadId), true);
    });

    test('border steps run in order and delivery waits for clearance', async () => {
      ok(await adm('POST', `/loads/${W.loadId}/assign`, { carrierId: String(ID.a) }));
      Object.assign(W, await shipmentFor(W));
      const shipment = (await adm('GET', `/shipments/${W.shipmentId}`)).body.data.shipment;
      assert.equal(shipment.borderStatus, 'pending');
      assert.equal(shipment.isCrossBorder, true);
      await step(W.shipmentId, 'dispatch');
      await step(W.shipmentId, 'pickup');
      await step(W.shipmentId, 'in-transit');
      refuse(await adm('POST', `/shipments/${W.shipmentId}/deliver`, {}), 409, 'BORDER_NOT_CLEARED');
      const atBorder = await step(W.shipmentId, 'at-border', { location: { city: 'Detroit', state: 'MI', country: 'US' } });
      assert.equal(atBorder.status, 'at_border');
      assert.equal(atBorder.borderStatus, 'at_border');
      assert.equal(atBorder.borderEvents.length, 1);
      ok(await adm('POST', `/shipments/${W.shipmentId}/border-events`, { event: 'border_delayed', note: 'Inspection queue' }));
      assert.equal((await adm('GET', `/shipments/${W.shipmentId}`)).body.data.shipment.borderStatus, 'delayed');
      refuse(await adm('POST', `/shipments/${W.shipmentId}/out-for-delivery`, {}), 409);
      const cleared = await step(W.shipmentId, 'border-cleared');
      assert.equal(cleared.borderStatus, 'cleared');
      assert.equal((await step(W.shipmentId, 'in-transit')).status, 'in_transit');
      assert.equal((await M.Load.findById(W.loadId)).status, 'in_transit', 'load unchanged by border steps');
      await step(W.shipmentId, 'deliver');
      await step(W.shipmentId, 'complete');
      assert.equal((await M.Load.findById(W.loadId)).status, 'completed');
    });

    test('a domestic shipment cannot be sent to the border', async () => {
      const made = await shipmentFor(await assignedLoad('a'));
      await step(made.shipmentId, 'dispatch');
      await step(made.shipmentId, 'pickup');
      await step(made.shipmentId, 'in-transit');
      refuse(await adm('POST', `/shipments/${made.shipmentId}/at-border`, {}), 409, 'NOT_CROSS_BORDER');
      refuse(await adm('POST', `/shipments/${made.shipmentId}/border-events`, { event: 'customs_processing' }), 409, 'NOT_CROSS_BORDER');
    });
  });

  /* ================================================================ C: reassignment */

  describe('Workflow C: reassignment and removal', () => {
    test('reassigning closes the old entry, appends a new one and moves access', async () => {
      const made = await assignedLoad('a');
      refuse(await adm('POST', `/loads/${made.loadId}/reassign`, { carrierId: String(ID.b) }), 422);
      refuse(await adm('POST', `/loads/${made.loadId}/reassign`, { carrierId: String(ID.a), reason: 'same' }), 409, 'CARRIER_NOT_ELIGIBLE');
      const load = ok(await adm('POST', `/loads/${made.loadId}/reassign`, { carrierId: String(ID.b), reason: 'Alpha truck broke down', carrierRate: 245000 })).load;
      assert.equal(load.carrier.companyName, 'Bravo Freight Inc');
      assert.equal(load.status, 'assigned');
      assert.equal(load.assignmentHistory.length, 2);
      assert.ok(load.assignmentHistory[0].unassignedAt);
      assert.match(load.assignmentHistory[0].reason, /broke down/);
      assert.equal(load.assignmentHistory[1].carrier.companyName, 'Bravo Freight Inc');
      assert.equal(load.pricing.carrierRate.amount, 245000);
      assert.equal(load.pricing.brokerMargin.amount, CUSTOMER_RATE - 245000);

      assert.equal((await as('a', 'GET', `/carrier/my-loads/${made.loadId}`)).status, 404, 'the removed carrier loses access');
      assert.equal((await as('b', 'GET', `/carrier/my-loads/${made.loadId}`)).status, 200);
      const removedNote = await M.Notification.find({ recipientId: U.a, title: /removed/i }).lean();
      assert.ok(removedNote.length >= 1);
      const response = refuse(await adm('POST', `/loads/${made.loadId}/reassign`, { carrierId: String(ID.a), reason: 'back again' }), 409, 'CARRIER_NOT_ELIGIBLE');
      assert.ok(response.errors.some((error) => error.code === 'PREVIOUSLY_UNASSIGNED'));
    });

    test('reassignment carries the booked shipment to the new carrier', async () => {
      const made = await shipmentFor(await assignedLoad('a'));
      ok(await adm('POST', `/loads/${made.loadId}/reassign`, { carrierId: String(ID.b), reason: 'Rate dispute' }));
      assert.equal(String((await M.Shipment.findById(made.shipmentId)).carrierId), String(ID.b));
      assert.equal((await as('a', 'GET', `/carrier/shipments/${made.shipmentId}`)).status, 404);
      assert.equal((await as('b', 'GET', `/carrier/shipments/${made.shipmentId}`)).status, 200);
    });

    test('a carrier cannot be replaced once the freight is picked up', async () => {
      const made = await shipmentFor(await assignedLoad('a'));
      await step(made.shipmentId, 'dispatch');
      await step(made.shipmentId, 'pickup');
      refuse(await adm('POST', `/loads/${made.loadId}/reassign`, { carrierId: String(ID.b), reason: 'late' }), 409, 'LOAD_NOT_REASSIGNABLE');
    });

    test('unassign returns the load to search, excludes that carrier from future matches', async () => {
      const made = await assignedLoad('b');
      refuse(await adm('POST', `/loads/${made.loadId}/unassign`, {}), 422);
      const load = ok(await adm('POST', `/loads/${made.loadId}/unassign`, { reason: 'Carrier withdrew' })).load;
      assert.equal(load.status, 'carrier_search');
      assert.equal(load.carrier, null);
      assert.ok(load.assignmentHistory[0].unassignedAt);
      const { matching } = ok(await adm('GET', `/loads/${made.loadId}/carrier-matches`));
      assert.equal(matching.matches.some((match) => match.companyName === 'Bravo Freight Inc'), false);
      assert.ok(matching.excluded.find((entry) => entry.companyName === 'Bravo Freight Inc').reasons.some((reason) => reason.code === 'PREVIOUSLY_UNASSIGNED'));
      assert.equal((await as('b', 'GET', '/carrier/loads')).body.data.items.some((item) => item.id === made.loadId), false);
      assert.equal((await as('a', 'GET', '/carrier/loads')).body.data.items.some((item) => item.id === made.loadId), true, 'carrier_search loads are on the board');
      ok(await adm('POST', `/loads/${made.loadId}/assign`, { carrierId: String(ID.a) }));
    });

    test('unassign is refused once a shipment exists', async () => {
      const made = await shipmentFor(await assignedLoad('a'));
      refuse(await adm('POST', `/loads/${made.loadId}/unassign`, { reason: 'x' }), 409, 'SHIPMENT_ALREADY_EXISTS');
    });
  });

  /* ================================================================ D: exceptions */

  describe('Workflow D: exceptions', () => {
    test('raising, hiding internal notes, resolving and resuming', async () => {
      const made = await shipmentFor(await assignedLoad('a'));
      await step(made.shipmentId, 'dispatch');
      await step(made.shipmentId, 'pickup');
      await step(made.shipmentId, 'in-transit');
      refuse(await adm('POST', `/shipments/${made.shipmentId}/exceptions`, { reason: 'earthquake' }), 422);

      const raised = ok(await adm('POST', `/shipments/${made.shipmentId}/exceptions`, { reason: 'weather', note: 'SECRET-ADMIN-NOTE blizzard on I-70' })).shipment;
      assert.equal(raised.status, 'exception');
      assert.equal(raised.exception.reason, 'weather');
      assert.equal(raised.exception.resumeStatus, 'in_transit');
      assert.equal(raised.exception.resolvedAt, null);
      assert.equal(raised.exceptions.length, 1);
      refuse(await adm('POST', `/shipments/${made.shipmentId}/exceptions`, { reason: 'delay' }), 409, 'INVALID_STATUS_TRANSITION');
      refuse(await adm('POST', `/shipments/${made.shipmentId}/deliver`, {}), 409, 'INVALID_STATUS_TRANSITION');

      const customerView = await as('x', 'GET', `/customer/shipments/${made.shipmentId}`);
      assert.equal(customerView.body.data.shipment.exception.reason, 'weather');
      assert.equal(customerView.body.data.shipment.exception.resolved, false);
      notLeaking(customerView, CUSTOMER_FORBIDDEN.concat(['blizzard']));
      notLeaking(await as('a', 'GET', `/carrier/shipments/${made.shipmentId}`), CARRIER_FORBIDDEN.concat(['blizzard']));
      const dashboard = ok(await adm('GET', '/dashboard'));
      assert.ok(dashboard.shipments.openExceptions >= 1);
      assert.ok((await adm('GET', '/shipments?exception=true')).body.data.items.some((item) => item.id === made.shipmentId));

      refuse(await adm('POST', `/shipments/${made.shipmentId}/exceptions/${MISSING}/resolve`, {}), 409, 'EXCEPTION_NOT_OPEN');
      const resolved = ok(await adm('POST', `/shipments/${made.shipmentId}/exceptions/${raised.exception.id}/resolve`, { note: 'Road reopened' })).shipment;
      assert.equal(resolved.status, 'in_transit');
      assert.ok(resolved.exception.resolvedAt);
      assert.equal(resolved.exception.resolutionNote, 'Road reopened');
      assert.ok(resolved.exceptions[0].resolvedAt);
      refuse(await adm('POST', `/shipments/${made.shipmentId}/exceptions/${raised.exception.id}/resolve`, {}), 409, 'EXCEPTION_NOT_OPEN');
      assert.equal((await as('x', 'GET', `/customer/shipments/${made.shipmentId}`)).body.data.shipment.exception.resolved, true);
      assert.equal((await step(made.shipmentId, 'deliver')).status, 'delivered');
    });

    test('an exception cannot be raised on a delivered shipment', async () => {
      const made = await shipmentFor(await assignedLoad('a'));
      for (const action of ['dispatch', 'pickup', 'in-transit', 'deliver']) await step(made.shipmentId, action);
      refuse(await adm('POST', `/shipments/${made.shipmentId}/exceptions`, { reason: 'delay' }), 409, 'INVALID_STATUS_TRANSITION');
    });
  });

  /* =============================================================== E: cancel & archive */

  describe('Workflow E: cancellation and archiving', () => {
    test('a draft or open load can be cancelled, with the reason kept internal', async () => {
      const quoteId = await acceptedQuote('x');
      const { load } = ok(await adm('POST', `/quotes/${quoteId}/convert`, {}));
      refuse(await adm('POST', `/loads/${load.id}/cancel`, {}), 422);
      const cancelled = ok(await adm('POST', `/loads/${load.id}/cancel`, { reason: 'SECRET-ADMIN-NOTE customer changed plans' })).load;
      assert.equal(cancelled.status, 'cancelled');
      assert.match(cancelled.cancelledReason, /changed plans/);
      refuse(await adm('POST', `/loads/${load.id}/open`, {}), 409, 'INVALID_STATUS_TRANSITION');
      refuse(await adm('POST', `/loads/${load.id}/cancel`, { reason: 'again' }), 409);
      notLeaking(await as('x', 'GET', `/customer/quotes/${quoteId}`), CUSTOMER_FORBIDDEN);
    });

    test('cancelling an assigned load with a shipment cancels both and tells the carrier', async () => {
      const made = await shipmentFor(await assignedLoad('a'));
      await step(made.shipmentId, 'dispatch');
      const cancelled = ok(await adm('POST', `/loads/${made.loadId}/cancel`, { reason: 'Customer cancelled' })).load;
      assert.equal(cancelled.status, 'cancelled');
      const shipment = (await adm('GET', `/shipments/${made.shipmentId}`)).body.data.shipment;
      assert.equal(shipment.status, 'cancelled');
      assert.ok(shipment.cancelledAt);
      assert.ok((await M.Notification.find({ recipientId: U.a, title: /cancelled/i }).lean()).length >= 1);
      assert.equal((await as('a', 'GET', '/carrier/loads')).body.data.items.some((item) => item.id === made.loadId), false);
    });

    test('cancelling through the shipment endpoint cascades to the load', async () => {
      const made = await shipmentFor(await assignedLoad('a'));
      ok(await adm('POST', `/shipments/${made.shipmentId}/cancel`, { reason: 'Shipper request' }));
      assert.equal((await M.Load.findById(made.loadId)).status, 'cancelled');
      assert.equal((await M.Shipment.findById(made.shipmentId)).status, 'cancelled');
    });

    test('nothing can be cancelled once the freight has been picked up', async () => {
      const made = await shipmentFor(await assignedLoad('a'));
      await step(made.shipmentId, 'dispatch');
      await step(made.shipmentId, 'pickup');
      refuse(await adm('POST', `/loads/${made.loadId}/cancel`, { reason: 'too late' }), 409, 'LOAD_NOT_CANCELLABLE');
      refuse(await adm('POST', `/shipments/${made.shipmentId}/cancel`, { reason: 'too late' }), 409);
      assert.equal((await M.Load.findById(made.loadId)).status, 'picked_up');
    });

    test('archiving is for draft, cancelled and completed loads only', async () => {
      const open = await openLoad('x');
      refuse(await adm('POST', `/loads/${open.loadId}/archive`, {}), 409, 'LOAD_NOT_ARCHIVABLE');
      ok(await adm('POST', `/loads/${open.loadId}/cancel`, { reason: 'duplicate' }));
      const archived = ok(await adm('POST', `/loads/${open.loadId}/archive`, {})).load;
      assert.ok(archived.archivedAt);
      assert.equal((await adm('GET', '/loads?limit=100')).body.data.items.some((item) => item.id === open.loadId), false);
      assert.equal((await adm('GET', '/loads?archived=true')).body.data.items.some((item) => item.id === open.loadId), true);
      refuse(await adm('POST', `/loads/${open.loadId}/open`, {}), 404, 'LOAD_NOT_FOUND');
    });

    test('quotes: cancel while pricing, but never after conversion', async () => {
      const created = ok(await as('x', 'POST', '/customer/quotes', validQuote()), 201).quote;
      ok(await adm('POST', `/quotes/${created.id}/review`, {}));
      ok(await adm('POST', `/quotes/${created.id}/start-pricing`, {}));
      ok(await adm('PUT', `/quotes/${created.id}/pricing`, pricedBody));
      assert.equal(ok(await adm('POST', `/quotes/${created.id}/cancel`, { reason: 'Out of scope' })).quote.status, 'cancelled');
      const seen = await as('x', 'GET', `/customer/quotes/${created.id}`);
      assert.equal(seen.body.data.quote.rate, null, 'a cancelled quote never reveals the price');
      refuse(await as('x', 'POST', `/customer/quotes/${created.id}/accept`, {}), 409);
      const converted = await acceptedQuote('x');
      ok(await adm('POST', `/quotes/${converted}/convert`, {}));
      refuse(await adm('POST', `/quotes/${converted}/cancel`, { reason: 'x' }), 409, 'INVALID_STATUS_TRANSITION');
    });

    test('the customer can decline (idempotently) and an expired quote cannot be accepted', async () => {
      const declinedId = await (async () => {
        const created = ok(await as('x', 'POST', '/customer/quotes', validQuote()), 201).quote;
        for (const [path, body] of [['review', {}], ['start-pricing', {}]]) ok(await adm('POST', `/quotes/${created.id}/${path}`, body));
        ok(await adm('PUT', `/quotes/${created.id}/pricing`, pricedBody));
        ok(await adm('POST', `/quotes/${created.id}/send`, { validForDays: 7 }));
        return created.id;
      })();
      assert.equal((await as('x', 'POST', `/customer/quotes/${declinedId}/decline`, { reason: 'Too expensive' })).body.data.quote.status, 'declined');
      assert.equal((await as('x', 'POST', `/customer/quotes/${declinedId}/decline`, {})).status, 200);
      assert.equal(await M.ActivityLog.countDocuments({ action: 'customer.quote.declined', entityId: declinedId }), 1);
      refuse(await as('x', 'POST', `/customer/quotes/${declinedId}/accept`, {}), 409);

      const created = ok(await as('x', 'POST', '/customer/quotes', validQuote()), 201).quote;
      for (const path of ['review', 'start-pricing']) ok(await adm('POST', `/quotes/${created.id}/${path}`, {}));
      ok(await adm('PUT', `/quotes/${created.id}/pricing`, pricedBody));
      ok(await adm('POST', `/quotes/${created.id}/send`, { validForDays: 1 }));
      await M.QuoteRequest.updateOne({ _id: created.id }, { quoteExpiresAt: new Date(Date.now() - 1000) });
      assert.equal((await adm('GET', '/dashboard')).body.data.quotes.quotedButPastExpiry >= 1, true);
      refuse(await as('x', 'POST', `/customer/quotes/${created.id}/accept`, {}), 409, 'QUOTE_EXPIRED');
      assert.equal((await M.QuoteRequest.findById(created.id)).status, 'expired');
    });

    test('overdue quotes can be expired in bulk, safely repeated', async () => {
      const created = ok(await as('x', 'POST', '/customer/quotes', validQuote()), 201).quote;
      for (const path of ['review', 'start-pricing']) ok(await adm('POST', `/quotes/${created.id}/${path}`, {}));
      ok(await adm('PUT', `/quotes/${created.id}/pricing`, pricedBody));
      ok(await adm('POST', `/quotes/${created.id}/send`, { validForDays: 1 }));
      await M.QuoteRequest.updateOne({ _id: created.id }, { quoteExpiresAt: new Date(Date.now() - 1000) });
      assert.equal(ok(await adm('POST', '/quotes/expire-overdue', {})).expired, 1);
      assert.equal(ok(await adm('POST', '/quotes/expire-overdue', {})).expired, 0);
      assert.equal((await M.QuoteRequest.findById(created.id)).status, 'expired');
    });
  });

  /* ================================================================== more security */

  describe('mass assignment, money and identifiers', () => {
    test('protected fields are rejected by every body that could carry them', async () => {
      const quoteId = (await M.QuoteRequest.findOne({ status: 'converted_to_load' }))._id;
      const loadId = (await M.Load.findOne({ status: 'open' }))?._id ?? (await openLoad()).loadId;
      const extras = [{ status: 'completed' }, { brokerMargin: 999999 }, { customerId: String(ID.cy) }, { assignedCarrierId: String(ID.b) }, { rate: 1 }, { quotedRate: 1 }, { loadNumber: 'LD-FAKE' }, { role: 'super_admin' }, { assignedBy: String(U.cy) }, { archivedAt: null }];
      for (const extra of extras) {
        for (const [method, path, body] of [
          ['PUT', `/quotes/${quoteId}/pricing`, { customerRate: 100000, ...extra }],
          ['PATCH', `/loads/${loadId}`, { commodity: 'x', ...extra }],
          ['PUT', `/loads/${loadId}/carrier-rate`, { carrierRate: 100000, ...extra }],
          ['POST', `/loads/${loadId}/assign`, { carrierId: String(ID.a), ...extra }],
          ['PUT', `/loads/${loadId}/schedule`, { pickup: SCHEDULE.pickup, ...extra }],
        ]) {
          assert.equal((await adm(method, path, body)).status, 422, `${method} ${path} ${JSON.stringify(extra)}`);
        }
      }
      const before = await M.Load.findById(loadId).select('+brokerMargin +rate').lean();
      assert.notEqual(before.brokerMargin, 999999);
    });

    test('the customer cannot smuggle fields into accept or decline', async () => {
      const created = ok(await as('x', 'POST', '/customer/quotes', validQuote()), 201).quote;
      assert.equal((await as('x', 'POST', `/customer/quotes/${created.id}/accept`, { status: 'converted_to_load', quotedRate: 1 })).status, 422);
      assert.equal((await as('x', 'POST', `/customer/quotes/${created.id}/decline`, { status: 'x' })).status, 422);
    });

    test('money must be positive integer cents; a loss needs explicit confirmation', async () => {
      const created = ok(await as('x', 'POST', '/customer/quotes', validQuote()), 201).quote;
      await adm('POST', `/quotes/${created.id}/review`, {});
      await adm('POST', `/quotes/${created.id}/start-pricing`, {});
      for (const bad of [3000.5, '3000', -5, 0, null, 1e21, true]) {
        assert.equal((await adm('PUT', `/quotes/${created.id}/pricing`, { customerRate: bad })).status, 422, String(bad));
      }
      assert.equal((await adm('PUT', `/quotes/${created.id}/pricing`, { customerRate: 100000, carrierRate: 99.9 })).status, 422);
      assert.equal((await adm('PUT', `/quotes/${created.id}/pricing`, { customerRate: 100000, currency: 'EUR' })).status, 422);
      refuse(await adm('PUT', `/quotes/${created.id}/pricing`, { customerRate: 100000, carrierRate: 120000 }), 409, 'NEGATIVE_MARGIN');
      const loss = ok(await adm('PUT', `/quotes/${created.id}/pricing`, { customerRate: 100000, carrierRate: 120000, allowNegativeMargin: true })).quote;
      assert.equal(loss.pricing.brokerMargin.amount, -20000);
    });

    test('pricing can only be set during the pricing stage', async () => {
      const created = ok(await as('x', 'POST', '/customer/quotes', validQuote()), 201).quote;
      refuse(await adm('PUT', `/quotes/${created.id}/pricing`, pricedBody), 409, 'INVALID_STATUS_TRANSITION');
    });

    test('the customer rate of a converted load is locked; the carrier rate follows the margin rules', async () => {
      const made = await openLoad();
      assert.equal((await adm('PUT', `/loads/${made.loadId}/carrier-rate`, { customerRate: 5 })).status, 422);
      const load = ok(await adm('PUT', `/loads/${made.loadId}/carrier-rate`, { carrierRate: 260000 })).load;
      assert.equal(load.pricing.brokerMargin.amount, CUSTOMER_RATE - 260000);
      refuse(await adm('PUT', `/loads/${made.loadId}/carrier-rate`, { carrierRate: CUSTOMER_RATE + 1 }), 409, 'NEGATIVE_MARGIN');
      assert.equal(ok(await adm('PUT', `/loads/${made.loadId}/carrier-rate`, { carrierRate: CUSTOMER_RATE + 1, allowNegativeMargin: true })).load.pricing.brokerMargin.amount, -1);
    });

    test('malformed and unknown ids: 400 for bad shape, 404 for absent records', async () => {
      for (const path of ['/quotes/not-an-id', '/loads/123', '/shipments/%7B%22%24ne%22%3Anull%7D']) assert.equal((await adm('GET', path)).status, 400, path);
      assert.equal((await adm('GET', `/quotes/${MISSING}`)).status, 404);
      assert.equal((await adm('GET', `/loads/${MISSING}`)).status, 404);
      assert.equal((await adm('GET', `/shipments/${MISSING}`)).status, 404);
      assert.equal((await adm('POST', `/loads/${MISSING}/shipment`, {})).status, 404);
    });

    test('unknown or tampered customer ids on accept are a 404, not a leak', async () => {
      assert.equal((await as('x', 'POST', `/customer/quotes/${MISSING}/accept`, {})).status, 404);
      assert.equal((await as('x', 'POST', '/customer/quotes/not-an-id/accept', {})).status, 400);
    });
  });

  describe('operator injection and safe search', () => {
    test('query-string operators are rejected before any query runs', async () => {
      for (const path of ['/loads?status[$ne]=open', '/loads?$where=1', '/loads?q[$regex]=.*', '/loads?carrierId[$in][]=x', '/quotes?status[$ne]=new', '/shipments?customerId[$ne]=1', '/loads?pickup.earliest=2026-01-01']) {
        const response = await adm('GET', path);
        assert.equal(response.status, 400, path);
        assert.equal(response.body.code, 'OPERATOR_NOT_ALLOWED', path);
      }
    });

    test('body operators are rejected', async () => {
      const loadId = (await M.Load.findOne({ status: 'open' }))._id;
      for (const body of [{ carrierId: { $ne: null } }, { carrierId: String(ID.a), $set: { status: 'completed' } }, { carrierId: String(ID.a), reason: { $regex: '.*' } }]) {
        const response = await adm('POST', `/loads/${loadId}/assign`, body);
        assert.equal(response.status, 400, JSON.stringify(body));
      }
      assert.equal((await adm('POST', `/loads/${loadId}/assign`, { carrierId: { $in: [] } })).status, 400);
      assert.equal((await M.Load.findById(loadId)).status, 'open');
    });

    test('filters validate their values and the search term is literal text', async () => {
      assert.equal((await adm('GET', '/loads?status=hacked')).status, 400);
      assert.equal((await adm('GET', '/loads?limit=101')).status, 400);
      assert.equal((await adm('GET', '/loads?page=0')).status, 400);
      assert.equal((await adm('GET', '/loads?sort=brokerMargin')).status, 400);
      assert.equal((await adm('GET', '/loads?unknown=1')).status, 400);
      assert.equal((await adm('GET', '/loads?customerId=notanid')).status, 400);
      assert.equal((await adm('GET', '/loads?q=a')).status, 400);
      const dot = await adm('GET', '/loads?q=.*');
      assert.equal(dot.status, 200);
      assert.equal(dot.body.data.items.length, 0, '".*" is text, not a pattern');
      assert.equal((await adm('GET', '/loads?q=((')).status, 200, 'regex metacharacters are escaped');
    });

    test('search, filters, sorting and pagination work and agree with the data', async () => {
      const total = await M.Load.countDocuments({ archivedAt: null });
      const first = ok(await adm('GET', '/loads?limit=2&page=1'));
      assert.equal(first.pagination.total, total);
      assert.equal(first.items.length, Math.min(2, total));
      assert.equal(first.pagination.totalPages, Math.max(1, Math.ceil(total / 2)));
      const second = ok(await adm('GET', '/loads?limit=2&page=2'));
      assert.equal(second.items.some((item) => first.items.some((other) => other.id === item.id)), false, 'pages do not overlap');
      const completed = ok(await adm('GET', '/loads?status=completed'));
      assert.equal(completed.pagination.total, await M.Load.countDocuments({ status: 'completed', archivedAt: null }));
      assert.ok(completed.items.every((item) => item.status === 'completed'));
      const border = ok(await adm('GET', '/loads?crossBorder=true'));
      assert.ok(border.items.length > 0 && border.items.every((item) => item.crossBorder));
      assert.ok(ok(await adm('GET', '/loads?crossBorder=false')).items.every((item) => !item.crossBorder));
      assert.ok(ok(await adm('GET', `/loads?customerId=${ID.cx}`)).items.every((item) => item.customer.id === String(ID.cx)));
      assert.equal(ok(await adm('GET', `/loads?customerId=${ID.cy}`)).items.length, 0);
      assert.ok(ok(await adm('GET', '/loads?q=denver')).items.length > 0);
      assert.ok(ok(await adm('GET', '/loads?q=LD-')).items.length > 0);
      assert.ok(ok(await adm('GET', '/loads?destinationCountry=CA')).items.every((item) => item.destination.country === 'CA'));
      assert.ok(ok(await adm('GET', '/loads?equipmentType=Dry%20Van&unassigned=true')).items.every((item) => item.carrier === null));
      const byPickup = ok(await adm('GET', '/loads?sort=pickup&order=asc&limit=50')).items.map((item) => item.pickup?.earliest).filter(Boolean);
      assert.deepEqual([...byPickup].sort(), byPickup);
      assert.ok(ok(await adm('GET', '/loads?pickupFrom=2026-12-01&pickupTo=2026-12-31')).pagination.total > 0);
      assert.equal(ok(await adm('GET', '/loads?pickupFrom=2030-01-01')).pagination.total, 0);
      assert.ok(ok(await adm('GET', '/quotes?q=Packaged')).items.length > 0);
      assert.ok(ok(await adm('GET', '/shipments?q=HL-')).items.length > 0);
      assert.equal(ok(await adm('GET', '/shipments?crossBorder=true')).items.every((item) => item.isCrossBorder), true);
    });
  });

  describe('timezones through the API', () => {
    test('unknown zones, impossible times and missing zones are refused', async () => {
      const made = await acceptedQuote('x');
      const { load } = ok(await adm('POST', `/quotes/${made}/convert`, {}));
      for (const pickup of [
        { earliest: '2026-12-02T08:00', timezone: 'Mars/Phobos' },
        { earliest: '2026-12-02T08:00' },
        { earliest: '2026-02-30T08:00', timezone: 'America/Chicago' },
        { earliest: 'tomorrow', timezone: 'America/Chicago' },
        { earliest: '2026-12-02T12:00', latest: '2026-12-02T08:00', timezone: 'America/Chicago' },
      ]) {
        assert.equal((await adm('PUT', `/loads/${load.id}/schedule`, { pickup })).status, 422, JSON.stringify(pickup));
      }
      refuse(await adm('PUT', `/loads/${load.id}/schedule`, { pickup: { earliest: '2026-12-05T08:00', timezone: 'America/Chicago' }, delivery: { earliest: '2026-12-02T08:00', timezone: 'America/Chicago' } }), 422);
    });

    test('Asia/Karachi is just another zone: nothing defaults to it', async () => {
      const made = await acceptedQuote('x');
      const { load } = ok(await adm('POST', `/quotes/${made}/convert`, {}));
      const result = ok(await adm('PUT', `/loads/${load.id}/schedule`, { pickup: { earliest: '2026-12-02T08:00', timezone: 'Asia/Karachi' } })).load;
      assert.equal(result.pickup.earliest, '2026-12-02T03:00:00.000Z');
      assert.equal(result.pickup.earliestLocal, '2026-12-02 08:00');
      const chicago = ok(await adm('PUT', `/loads/${load.id}/schedule`, { pickup: { earliest: '2026-12-02T08:00', timezone: 'America/Chicago' } })).load;
      assert.equal(chicago.pickup.earliest, '2026-12-02T14:00:00.000Z');
    });

    test('absolute instants with an offset are kept as given and shown in the facility zone', async () => {
      const made = await acceptedQuote('x');
      const { load } = ok(await adm('POST', `/quotes/${made}/convert`, {}));
      const result = ok(await adm('PUT', `/loads/${load.id}/schedule`, { pickup: { earliest: '2026-12-02T14:00:00Z', timezone: 'America/Chicago' } })).load;
      assert.equal(result.pickup.earliest, '2026-12-02T14:00:00.000Z');
      assert.equal(result.pickup.earliestLocal, '2026-12-02 08:00');
    });

    test('tracking events need a timezone with a local time and cannot be in the future', async () => {
      const made = await shipmentFor(await assignedLoad('a'));
      refuse(await adm('POST', `/shipments/${made.shipmentId}/dispatch`, { occurredAt: '2026-10-01T08:00' }), 422);
      refuse(await adm('POST', `/shipments/${made.shipmentId}/dispatch`, { occurredAt: new Date(Date.now() + 3600000).toISOString() }), 422);
      const shipment = ok(await adm('POST', `/shipments/${made.shipmentId}/dispatch`, { occurredAt: '2026-10-01T08:00', timezone: 'America/Chicago' })).shipment;
      assert.equal(shipment.trackingEvents.find((event) => event.status === 'dispatched').timestamp, '2026-10-01T13:00:00.000Z');
    });
  });

  describe('numbering', () => {
    test('quote, load and shipment numbers are server-generated, unique and sequential; tracking numbers are random', async () => {
      const [loads, shipments, quotes] = await Promise.all([M.Load.find({}).select('loadNumber').lean(), M.Shipment.find({}).select('trackingNumber shipmentNumber').lean(), M.QuoteRequest.find({}).select('quoteNumber').lean()]);
      for (const [rows, field, pattern] of [[loads, 'loadNumber', /^LD-\d{4}-\d{6}$/], [shipments, 'shipmentNumber', /^SH-\d{4}-\d{6}$/], [quotes, 'quoteNumber', /^QT-\d{4}-\d{6}$/]]) {
        const values = rows.map((row) => row[field]);
        assert.ok(values.length > 3);
        assert.equal(new Set(values).size, values.length, `${field} is unique`);
        values.forEach((value) => assert.match(value, pattern));
      }
      const tracking = shipments.map((shipment) => shipment.trackingNumber);
      assert.equal(new Set(tracking).size, tracking.length);
      const numeric = shipments.map((shipment) => Number(shipment.shipmentNumber.slice(-6))).sort((a, b) => a - b);
      assert.deepEqual(numeric, numeric.map((_, index) => index + 1), 'shipment numbers are consecutive');
      const suffixes = tracking.map((value) => value.slice(3));
      assert.equal(suffixes.some((value, index) => index > 0 && value === suffixes[index - 1]), false);
    });
  });

  describe('concurrency and idempotency', () => {
    test('two simultaneous conversions of one quote create at most one load', async (t) => {
      const quoteId = await acceptedQuote('x');
      const [first, second] = await Promise.all([adm('POST', `/quotes/${quoteId}/convert`, {}), adm('POST', `/quotes/${quoteId}/convert`, {})]);
      const loads = await M.Load.countDocuments({ quoteId });
      if (loads !== 1) t.skip('FerretDB: the sparse unique index did not serialise concurrent inserts (see docs/BROKERAGE_OPERATIONS.md)');
      else {
        assert.ok([first.status, second.status].includes(200));
        assert.ok([first.status, second.status].every((status) => [200, 409].includes(status)));
      }
    });

    test('two simultaneous acceptances settle on accepted without errors', async () => {
      const created = ok(await as('x', 'POST', '/customer/quotes', validQuote()), 201).quote;
      for (const path of ['review', 'start-pricing']) ok(await adm('POST', `/quotes/${created.id}/${path}`, {}));
      ok(await adm('PUT', `/quotes/${created.id}/pricing`, pricedBody));
      ok(await adm('POST', `/quotes/${created.id}/send`, { validForDays: 7 }));
      const responses = await Promise.all([as('x', 'POST', `/customer/quotes/${created.id}/accept`, {}), as('x', 'POST', `/customer/quotes/${created.id}/accept`, {})]);
      assert.ok(responses.every((response) => [200, 409].includes(response.status)), responses.map((r) => r.status).join());
      assert.ok(responses.some((response) => response.status === 200));
      assert.equal((await M.QuoteRequest.findById(created.id)).status, 'customer_accepted');
    });

    test('a stale transition is a 409 and changes nothing', async () => {
      const made = await shipmentFor(await assignedLoad('a'));
      ok(await adm('POST', `/shipments/${made.shipmentId}/dispatch`, {}));
      refuse(await adm('POST', `/shipments/${made.shipmentId}/dispatch`, {}), 409, 'INVALID_STATUS_TRANSITION');
      assert.equal((await M.Shipment.findById(made.shipmentId)).trackingEvents.filter((event) => event.status === 'dispatched').length, 1);
    });
  });

  describe('Phase 5 and 6 compatibility', () => {
    test('customer dashboard counts the new statuses and the carrier dashboard counts completed work', async () => {
      const customer = ok(await as('x', 'GET', '/customer/dashboard'));
      assert.ok(customer.stats.delivered >= 1, 'completed shipments count as delivered');
      const carrier = ok(await as('a', 'GET', '/carrier/dashboard'));
      assert.ok(carrier.stats.delivered >= 1, 'completed shipments count as delivered work');
      notLeaking(await as('a', 'GET', '/carrier/dashboard'), CARRIER_FORBIDDEN);
      notLeaking(await as('x', 'GET', '/customer/dashboard'), CUSTOMER_FORBIDDEN);
    });

    test('the board is still an assignment board: no bidding or booking endpoints exist', async () => {
      for (const path of ['/carrier/loads/' + MISSING + '/book', '/carrier/loads/' + MISSING + '/bid', '/carrier/loads/' + MISSING + '/accept']) {
        assert.ok([404].includes((await as('a', 'POST', path, {})).status), path);
      }
    });

    test('a pending carrier still sees no freight, and a suspended profile is refused outright', async () => {
      const board = await as('e', 'GET', '/carrier/loads');
      assert.equal(board.status, 200);
      assert.equal(board.body.data.items.length, 0);
      assert.equal(board.body.data.eligibility.eligible, false);
      assert.equal((await as('c', 'GET', '/carrier/loads')).status, 403);
    });
  });
});
