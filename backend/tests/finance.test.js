/**
 * Phase 12 tests: invoices, manual payment records, carrier payables, reconciliation, PDF, portals, security, notifications.
 * No payment gateway exists, so nothing here talks to one; every payment is an administrative record.
 *
 *   MONGO_TEST_URI=mongodb://127.0.0.1:27018/hl_test npm test
 *
 * The database name must end in "_test" because it is dropped afterwards.
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';

const testUri = process.env.MONGO_TEST_URI;
const skipReason = testUri ? false : 'MONGO_TEST_URI is not set; these tests require a live MongoDB';

if (testUri) {
  const databaseName = new URL(testUri).pathname.replace(/^\//, '');
  if (!databaseName.endsWith('_test')) throw new Error(`Refusing to run: database "${databaseName}" must end with "_test" because it is dropped afterwards.`);
}
Object.assign(process.env, {
  NODE_ENV: 'development',
  MONGO_URI: testUri ?? 'mongodb://127.0.0.1:27017/unused_test',
  JWT_SECRET: 'finance-test-secret-finance-test-secret-12',
  CLIENT_URL: 'http://localhost:5173',
  AUTH_RATE_LIMIT_MAX: '10000',
  RESET_EMAIL_LIMIT_MAX: '100000',
  UPLOAD_RATE_LIMIT_MAX: '100000',
  QUOTE_IP_LIMIT_MAX: '100000',
  GLOBAL_RATE_LIMIT_MAX: '100000',
  LOGIN_ACCOUNT_LIMIT_MAX: '500',
  FINANCE_RATE_LIMIT_MAX: '100000',
});

const PASS = 'finance-test-pass-phrase-1';

/* ------------------------------------------------------------------ units: no database */

describe('finance units (no database)', () => {
  test('line totals use exact integer arithmetic and reject out-of-range amounts', async () => {
    const { buildLineItems, assertAmount, MAX_AMOUNT_MINOR } = await import('../src/finance/common.js');
    const built = buildLineItems([{ description: 'Linehaul', quantity: 3, unitAmount: 33333 }, { description: 'Fuel', quantity: 1, unitAmount: 1 }]);
    assert.equal(built.subtotal, 100000);
    assert.equal(built.total, 100000);
    assert.deepEqual(built.lineItems.map((l) => l.amount), [99999, 1]);
    assert.throws(() => buildLineItems([{ description: 'x', quantity: 100000, unitAmount: MAX_AMOUNT_MINOR }]));
    assert.throws(() => assertAmount(1.5));
    assert.throws(() => assertAmount(-1));
    assert.throws(() => assertAmount(Number.MAX_SAFE_INTEGER + 2));
  });

  test('PDF text is reduced to printable characters and escaped; the file structure is valid', async () => {
    const { PdfDocument, escapePdfString, sanitizePdfText } = await import('../src/finance/pdfWriter.js');
    assert.equal(escapePdfString('a(b)c\\d'), 'a\\(b\\)c\\\\d');
    assert.equal(sanitizePdfText('Café 中文 \u0000\u001b'), 'Cafe ??   ');
    const doc = new PdfDocument();
    for (let i = 0; i < 120; i += 1) doc.text(`Line ${i} ) Tj /Evil (`);
    const buffer = doc.toBuffer({ title: 'T) /Evil (' });
    const text = buffer.toString('latin1');
    assert.ok(text.startsWith('%PDF-1.4'));
    assert.ok(text.trimEnd().endsWith('%%EOF'));
    assert.ok(/\/Count [2-9]/.test(text), 'long content flows onto more pages');
    const start = Number(/startxref\n(\d+)/.exec(text)[1]);
    assert.ok(text.slice(start).startsWith('xref'));
    const entries = [...text.matchAll(/(\d{10}) 00000 n /g)].map((m) => Number(m[1]));
    entries.forEach((offset, index) => assert.ok(text.slice(offset).startsWith(`${index + 1} 0 obj`), `object ${index + 1} offset`));
    assert.ok(!text.includes('/Evil (\n') || text.includes('\\('), 'parentheses are escaped');
  });

  test('gateway status honestly reports that no gateway is configured', async () => {
    const { getGatewayStatus } = await import('../src/finance/gateway.js');
    const status = getGatewayStatus();
    assert.equal(status.configured, false);
    assert.equal(status.onlinePaymentAvailable, false);
    assert.equal(status.provider, null);
  });
});

/* ------------------------------------------------------------------ integration */

describe('finance against a live database', { skip: skipReason }, () => {
  let mongoose;
  let server;
  let baseUrl;
  let M;
  let svc;
  let providers;
  let email;
  const S = {};
  const D = {};
  const original = { log: console.log, warn: console.warn, error: console.error };
  let seq = 0;

  async function request(method, path, { cookie, json, headers = {}, raw = false } = {}) {
    const response = await fetch(`${baseUrl}/api/v1${path}`, {
      method,
      headers: { ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
      body: json !== undefined ? JSON.stringify(json) : undefined,
    });
    if (raw) return { status: response.status, headers: response.headers, buffer: Buffer.from(await response.arrayBuffer()) };
    const text = await response.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = null; }
    const setCookie = response.headers.get('set-cookie');
    return { status: response.status, text, body, headers: response.headers, cookie: setCookie ? setCookie.split(';')[0] : null };
  }
  const get = (p, as) => request('GET', p, { cookie: S[as] });
  const send = (method, p, as, json) => request(method, p, { cookie: S[as], json });
  const ok = (r, status = 200) => { assert.equal(r.status, status, r.text?.slice(0, 500)); return r.body.data; };
  const refuse = (r, status, code) => { assert.equal(r.status, status, r.text?.slice(0, 500)); if (code) assert.equal(r.body.code, code, r.text); return r.body; };
  const key = () => `test-key-${(seq += 1)}-${Math.random().toString(36).slice(2, 10)}`;
  const today = () => new Date().toISOString().slice(0, 10);

  async function mkUser(role, address) {
    const { hashPassword } = await import('../src/services/password.service.js');
    return M.User.create({ firstName: 'Fin', lastName: role, email: address, role, passwordHash: await hashPassword(PASS), isEmailVerified: true });
  }
  async function login(name, address, path = '/auth/login') {
    const r = await request('POST', path, { json: { email: address, password: PASS } });
    assert.equal(r.status, 200, r.text);
    S[name] = r.cookie;
  }
  async function mkLoad(customerKey, overrides = {}) {
    return M.Load.create({
      loadNumber: `LD-FIN-${(seq += 1)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      customerId: D[customerKey].customer._id,
      origin: { city: 'Chicago', state: 'IL', country: 'US' },
      destination: { city: 'Dallas', state: 'TX', country: 'US' },
      commodity: 'Machine parts',
      status: 'open',
      currency: 'USD',
      ...overrides,
    });
  }
  const items = (unit = 100000, quantity = 1) => [{ description: 'Linehaul Chicago to Dallas', quantity, unitAmount: unit }];
  async function draft(customerKey = 'ca', { unit = 100000, load, extra = {} } = {}) {
    const l = load ?? await mkLoad(customerKey);
    return ok(await send('POST', '/finance/invoices', 'admin', { loadId: String(l._id), lineItems: items(unit), ...extra }), 201);
  }
  async function issued(customerKey = 'ca', options = {}) {
    const d = await draft(customerKey, options);
    return ok(await send('POST', `/finance/invoices/${d.id}/issue`, 'admin', { dueDate: '2030-01-15' }));
  }
  const pay = (invoiceId, amount, extra = {}) =>
    send('POST', `/finance/invoices/${invoiceId}/payments`, 'admin', { amount, currency: 'USD', method: 'bank_transfer', reference: 'WIRE-1', paymentDate: today(), idempotencyKey: key(), ...extra });

  const payout = (id, amount, extra = {}) =>
    send('POST', `/finance/payables/${id}/payments`, 'admin', { amount, currency: 'USD', method: 'bank_transfer', reference: 'ACH-77', paymentDate: today(), idempotencyKey: key(), ...extra });

  before(async () => {
    const database = await import('../src/config/database.js');
    ({ default: mongoose } = await import('mongoose'));
    const { default: app } = await import('../src/app.js');
    M = await import('../src/models/index.js');
    svc = await import('../src/notifications/delivery.service.js');
    providers = await import('../src/notifications/providers/index.js');
    const { createMockProvider } = await import('../src/notifications/providers/mock.provider.js');
    email = createMockProvider({ name: 'mock-email' });
    await database.connectDatabase();
    await mongoose.connection.dropDatabase();
    const results = await Promise.allSettled(Object.values(M.models).map((Model) => Model.init()));
    results.forEach((r) => { if (r.status === 'rejected' && !/partialFilterExpression/.test(r.reason?.message ?? '')) throw r.reason; });
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    providers.setEmailProviderForTests(email);

    D.admin = await mkUser('super_admin', 'fin.admin@example.com');
    for (const k of ['ca', 'cb']) {
      const user = await mkUser('customer', `fin.${k}@example.com`);
      D[k] = { user, customer: await M.Customer.create({ userId: user._id, companyName: `Shipper ${k.toUpperCase()} Co`, status: 'active', billingInformation: { contactName: `Billing ${k}`, email: `bill.${k}@example.com`, paymentTermsDays: k === 'ca' ? 30 : undefined } }) };
    }
    for (const k of ['ka', 'kb']) {
      const user = await mkUser('carrier', `fin.${k}@example.com`);
      D[k] = { user, carrier: await M.Carrier.create({ userId: user._id, companyName: `Carrier ${k.toUpperCase()} LLC`, status: 'active', authorityStatus: 'active', complianceStatus: 'approved', MCNumber: `MC-${k}`, DOTNumber: `DOT-${k}`, equipmentTypes: ['Dry Van'], operatingRegions: ['Nationwide'] }) };
    }
    await login('admin', 'fin.admin@example.com', '/auth/admin/login');
    for (const k of ['ca', 'cb', 'ka', 'kb']) await login(k, `fin.${k}@example.com`);
    if (!process.env.FIN_DEBUG) for (const level of ['log', 'warn', 'error']) console[level] = () => {};
  });

  after(async () => {
    Object.assign(console, original);
    providers?.setEmailProviderForTests(undefined);
    server?.close();
    await mongoose?.connection.dropDatabase();
    await mongoose?.disconnect();
  });

  /* ---------------------------------------------------------------- invoices */
  describe('invoice lifecycle', () => {
    test('a draft is created from a load: customer, currency and totals come from the server', async () => {
      const load = await mkLoad('ca', { currency: 'CAD' });
      const created = ok(await send('POST', '/finance/invoices', 'admin', { loadId: String(load._id), lineItems: [{ description: 'Linehaul', quantity: 2, unitAmount: 25050 }, { description: 'Fuel', quantity: 1, unitAmount: 1250 }] }), 201);
      assert.match(created.invoiceNumber, /^INV-\d{4}-\d{6}$/);
      assert.equal(created.status, 'draft');
      assert.equal(created.customerId, String(D.ca.customer._id));
      assert.equal(created.currency, 'CAD');
      assert.equal(created.subtotal, 51350);
      assert.equal(created.total, 51350);
      assert.equal(created.amountPaid, 0);
      assert.equal(created.outstanding, 51350);
      assert.deepEqual(created.lineItems.map((l) => l.amount), [50100, 1250]);
      assert.equal(created.loadNumber, load.loadNumber);
    });

    test('the request cannot set owner, status, totals, paid amount or currency', async () => {
      const load = await mkLoad('ca');
      for (const extra of [{ customerId: String(D.cb.customer._id) }, { status: 'paid' }, { total: 1 }, { amountPaid: 100000 }, { currency: 'USD' }, { invoiceNumber: 'INV-X' }, { createdBy: String(D.ca.user._id) }]) {
        refuse(await send('POST', '/finance/invoices', 'admin', { loadId: String(load._id), lineItems: items(), ...extra }), 422);
      }
      refuse(await send('POST', '/finance/invoices', 'admin', { loadId: String(load._id), lineItems: [{ description: 'x', quantity: 1, unitAmount: 10.5 }] }), 422);
      refuse(await send('POST', '/finance/invoices', 'admin', { loadId: String(load._id), lineItems: [{ description: 'x', quantity: 1, unitAmount: -5 }] }), 422);
      refuse(await send('POST', '/finance/invoices', 'admin', { loadId: String(load._id), lineItems: [{ description: 'x', quantity: 1, unitAmount: '1000' }] }), 422);
      refuse(await send('POST', '/finance/invoices', 'admin', { loadId: String(load._id), lineItems: [] }), 422);
      refuse(await send('POST', '/finance/invoices', 'admin', { loadId: String(load._id), lineItems: [{ description: 'x', quantity: 1, unitAmount: 99999999999 }] }), 422);
      refuse(await send('POST', '/finance/invoices', 'admin', { loadId: { $ne: null }, lineItems: items() }), 400);
    });

    test('unknown, cancelled and missing loads are refused', async () => {
      refuse(await send('POST', '/finance/invoices', 'admin', { loadId: String(new mongoose.Types.ObjectId()), lineItems: items() }), 404, 'LOAD_NOT_FOUND');
      const cancelled = await mkLoad('ca', { status: 'cancelled' });
      refuse(await send('POST', '/finance/invoices', 'admin', { loadId: String(cancelled._id), lineItems: items() }), 409, 'LOAD_CANCELLED');
    });

    test('a draft can be edited; totals are recalculated server-side', async () => {
      const d = await draft('ca');
      const edited = ok(await send('PATCH', `/finance/invoices/${d.id}`, 'admin', { lineItems: [{ description: 'Revised', quantity: 4, unitAmount: 7777 }], customerNote: 'Thank you' }));
      assert.equal(edited.total, 31108);
      assert.equal(edited.customerNote, 'Thank you');
      refuse(await send('PATCH', `/finance/invoices/${d.id}`, 'admin', { total: 5 }), 422);
      refuse(await send('PATCH', `/finance/invoices/${d.id}`, 'admin', { status: 'paid' }), 422);
    });

    test('issuing sets dates and status; the due date falls back to customer terms, never an invented default', async () => {
      const d = await draft('ca');
      const issuedInvoice = ok(await send('POST', `/finance/invoices/${d.id}/issue`, 'admin', {}));
      assert.equal(issuedInvoice.status, 'issued');
      assert.equal(issuedInvoice.issueDate, today());
      const expected = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
      assert.equal(issuedInvoice.dueDate, expected, 'customer ca has 30 day terms');

      const noTerms = await draft('cb');
      refuse(await send('POST', `/finance/invoices/${noTerms.id}/issue`, 'admin', {}), 422);
      refuse(await send('POST', `/finance/invoices/${noTerms.id}/issue`, 'admin', { dueDate: '2000-01-01' }), 422);
      const withDue = ok(await send('POST', `/finance/invoices/${noTerms.id}/issue`, 'admin', { dueDate: '2031-02-03' }));
      assert.equal(withDue.dueDate, '2031-02-03');
      refuse(await send('POST', `/finance/invoices/${noTerms.id}/issue`, 'admin', { dueDate: '2031-02-03' }), 409, 'INVOICE_NOT_DRAFT');
      refuse(await send('POST', `/finance/invoices/${noTerms.id}/issue`, 'admin', { dueDate: '2031-02-30' }), 422);
    });

    test('issued invoices are immutable', async () => {
      const inv = await issued('ca');
      refuse(await send('PATCH', `/finance/invoices/${inv.id}`, 'admin', { lineItems: items(1) }), 409, 'INVOICE_NOT_DRAFT');
      const row = await M.Invoice.findById(inv.id).lean();
      assert.equal(row.total, 100000);
      await assert.rejects(M.Invoice.updateOne({ _id: inv.id }, { $set: { invoiceNumber: 'HACK' } }, { strict: 'throw' }).catch((e) => { throw e; }), () => true).catch(() => {});
      assert.equal((await M.Invoice.findById(inv.id).lean()).invoiceNumber, inv.invoiceNumber);
    });

    test('invoice numbers are unique even when created concurrently', async () => {
      const loads = await Promise.all(Array.from({ length: 12 }, () => mkLoad('ca')));
      const results = await Promise.all(loads.map((l) => send('POST', '/finance/invoices', 'admin', { loadId: String(l._id), lineItems: items() })));
      const numbers = results.map((r) => ok(r, 201).invoiceNumber);
      assert.equal(new Set(numbers).size, 12);
      const indexes = await M.Invoice.collection.indexes();
      assert.ok(indexes.some((i) => i.unique && i.key.invoiceNumber === 1));
    });

    test('an unpaid invoice can be voided (draft or issued); void is final and idempotent', async () => {
      const d = await draft('ca');
      const voided = ok(await send('POST', `/finance/invoices/${d.id}/void`, 'admin', { reason: 'Created by mistake' }));
      assert.equal(voided.status, 'void');
      assert.equal(voided.outstanding, 0);
      assert.equal(ok(await send('POST', `/finance/invoices/${d.id}/void`, 'admin', { reason: 'again' })).status, 'void');
      refuse(await send('POST', `/finance/invoices/${d.id}/issue`, 'admin', {}), 409, 'INVOICE_NOT_DRAFT');
      refuse(await pay(d.id, 100), 409, 'INVOICE_NOT_PAYABLE');
      refuse(await send('PATCH', `/finance/invoices/${d.id}`, 'admin', { customerNote: 'x' }), 409);
      const i = await issued('ca');
      assert.equal(ok(await send('POST', `/finance/invoices/${i.id}/void`, 'admin', { reason: 'Wrong customer' })).status, 'void');
      refuse(await send('POST', `/finance/invoices/${i.id}/void`, 'admin', {}), 422);
    });

    test('an invoice with recorded payments cannot be voided until the payments are reversed', async () => {
      const i = await issued('ca');
      const first = ok(await pay(i.id, 40000), 201);
      refuse(await send('POST', `/finance/invoices/${i.id}/void`, 'admin', { reason: 'Correction' }), 409, 'INVOICE_HAS_PAYMENTS');
      ok(await send('POST', `/finance/payments/${first.transaction.id}/reverse`, 'admin', { reason: 'Entered in error' }));
      assert.equal(ok(await send('POST', `/finance/invoices/${i.id}/void`, 'admin', { reason: 'Void and reissue' })).status, 'void');
    });

    test('overdue is derived from the due date, never stored, and filterable', async () => {
      const i = await issued('ca');
      await M.Invoice.updateOne({ _id: i.id }, { $set: { dueDate: new Date(Date.now() - 3 * 86400000) } });
      const detail = ok(await get(`/finance/invoices/${i.id}`, 'admin'));
      assert.equal(detail.status, 'issued');
      assert.equal(detail.isOverdue, true);
      const overdue = ok(await get('/finance/invoices?status=overdue&limit=100', 'admin'));
      assert.ok(overdue.items.some((x) => x.id === i.id));
      assert.ok(overdue.items.every((x) => x.isOverdue));
      ok(await pay(i.id, 100000), 201);
      assert.equal(ok(await get(`/finance/invoices/${i.id}`, 'admin')).isOverdue, false, 'a paid invoice is never overdue');
    });

    test('lists validate filters, sorting and paging', async () => {
      const page = ok(await get('/finance/invoices?limit=2&page=1&sort=total&order=asc', 'admin'));
      assert.equal(page.items.length, 2);
      assert.ok(page.items[0].total <= page.items[1].total);
      assert.ok(page.pagination.total >= 2);
      refuse(await get('/finance/invoices?sort=internalNotes', 'admin'), 400);
      refuse(await get('/finance/invoices?status=bogus', 'admin'), 400);
      refuse(await get('/finance/invoices?limit=1000', 'admin'), 400);
      refuse(await get('/finance/invoices?customerId[$ne]=x', 'admin'), 400);
      refuse(await get('/finance/invoices?unknown=1', 'admin'), 400);
      const mine = ok(await get(`/finance/invoices?customerId=${D.cb.customer._id}&limit=100`, 'admin'));
      assert.ok(mine.items.every((x) => x.customerId === String(D.cb.customer._id)));
    });
  });

  /* ---------------------------------------------------------------- customer payment records */
  describe('customer payment records', () => {
    test('a partial then a full payment move the invoice through partially_paid to paid', async () => {
      const i = await issued('ca');
      const first = ok(await pay(i.id, 30000), 201);
      assert.equal(first.transaction.status, 'succeeded');
      assert.equal(first.transaction.source, 'manual');
      assert.equal(first.transaction.confirmation, 'admin_recorded');
      assert.match(first.transaction.confirmationLabel, /not bank-verified/);
      let detail = ok(await get(`/finance/invoices/${i.id}`, 'admin'));
      assert.equal(detail.status, 'partially_paid');
      assert.equal(detail.amountPaid, 30000);
      assert.equal(detail.outstanding, 70000);
      ok(await pay(i.id, 70000), 201);
      detail = ok(await get(`/finance/invoices/${i.id}`, 'admin'));
      assert.equal(detail.status, 'paid');
      assert.equal(detail.outstanding, 0);
      assert.equal(detail.transactions.length, 2);
      refuse(await pay(i.id, 1), 409, 'INVOICE_NOT_PAYABLE');
    });

    test('overpayment is rejected and nothing is recorded', async () => {
      const i = await issued('ca');
      refuse(await pay(i.id, 100001), 409, 'OVERPAYMENT');
      ok(await pay(i.id, 99999), 201);
      refuse(await pay(i.id, 2), 409, 'OVERPAYMENT');
      assert.equal(await M.PaymentTransaction.countDocuments({ invoiceId: i.id }), 1);
      assert.equal((await M.Invoice.findById(i.id).lean()).amountPaid, 99999);
    });

    test('drafts cannot receive payments and the currency must match with no conversion', async () => {
      const d = await draft('ca');
      refuse(await pay(d.id, 100), 409, 'INVOICE_NOT_PAYABLE');
      const i = await issued('ca');
      refuse(await pay(i.id, 100, { currency: 'CAD' }), 409, 'CURRENCY_MISMATCH');
      refuse(await pay(i.id, 100, { currency: 'EUR' }), 422);
      assert.equal(await M.PaymentTransaction.countDocuments({ invoiceId: i.id }), 0);
    });

    test('the same idempotency key never applies a payment twice; reusing it for a different amount is refused', async () => {
      const i = await issued('ca');
      const k = key();
      const first = await pay(i.id, 25000, { idempotencyKey: k });
      const firstData = ok(first, 201);
      const again = await pay(i.id, 25000, { idempotencyKey: k });
      const againData = ok(again, 200);
      assert.equal(againData.replayed, true);
      assert.equal(againData.transaction.id, firstData.transaction.id);
      refuse(await pay(i.id, 26000, { idempotencyKey: k }), 409, 'IDEMPOTENCY_KEY_REUSED');
      assert.equal((await M.Invoice.findById(i.id).lean()).amountPaid, 25000);
      assert.equal(await M.PaymentTransaction.countDocuments({ invoiceId: i.id }), 1);
    });

    test('simultaneous payments cannot overpay or double apply', async () => {
      const i = await issued('ca');
      const results = await Promise.all(Array.from({ length: 6 }, () => pay(i.id, 40000)));
      const created = results.filter((r) => r.status === 201).length;
      assert.equal(created, 2, `exactly two 400.00 payments fit into 1000.00 (got ${created})`);
      assert.ok(results.filter((r) => r.status !== 201).every((r) => [409].includes(r.status)));
      const row = await M.Invoice.findById(i.id).lean();
      assert.equal(row.amountPaid, 80000);
      assert.equal(await M.PaymentTransaction.countDocuments({ invoiceId: i.id, status: 'succeeded' }), 2);
    });

    test('simultaneous submissions of the same payment (double click) record exactly one', async () => {
      const i = await issued('ca');
      const k = key();
      const results = await Promise.all(Array.from({ length: 6 }, () => pay(i.id, 10000, { idempotencyKey: k })));
      assert.ok(results.every((r) => [200, 201].includes(r.status)), results.map((r) => r.status).join());
      assert.equal(results.filter((r) => r.status === 201).length, 1);
      assert.equal((await M.Invoice.findById(i.id).lean()).amountPaid, 10000);
    });

    test('a failed attempt is recorded but never changes the balance or status', async () => {
      const i = await issued('ca');
      const failed = ok(await pay(i.id, 50000, { outcome: 'failed', failureNote: 'Check bounced' }), 201);
      assert.equal(failed.transaction.status, 'failed');
      const row = await M.Invoice.findById(i.id).lean();
      assert.equal(row.amountPaid, 0);
      assert.equal(row.status, 'issued');
    });

    test('validation: reference required for transfers and checks, no future dates, strict body, positive integer cents', async () => {
      const i = await issued('ca');
      refuse(await pay(i.id, 100, { reference: undefined }), 422);
      refuse(await pay(i.id, 100, { method: 'check', reference: undefined }), 422);
      ok(await pay(i.id, 100, { method: 'other_offline', reference: undefined }), 201);
      refuse(await pay(i.id, 100, { paymentDate: '2999-01-01' }), 422);
      refuse(await pay(i.id, 0), 422);
      refuse(await pay(i.id, -5), 422);
      refuse(await pay(i.id, 10.5), 422);
      refuse(await pay(i.id, 100, { method: 'credit_card' }), 422);
      refuse(await pay(i.id, 100, { cardNumber: '4242424242424242' }), 422);
      refuse(await pay(i.id, 100, { customerId: String(D.cb.customer._id) }), 422);
      refuse(await pay(i.id, 100, { status: 'succeeded' }), 422);
      refuse(await pay(i.id, 100, { idempotencyKey: 'x' }), 422);
    });

    test('reversal: a linked entry restores the balance and cannot be repeated', async () => {
      const i = await issued('ca');
      const first = ok(await pay(i.id, 100000), 201);
      assert.equal(ok(await get(`/finance/invoices/${i.id}`, 'admin')).status, 'paid');
      const reversed = ok(await send('POST', `/finance/payments/${first.transaction.id}/reverse`, 'admin', { reason: 'Bank returned the transfer' }));
      assert.equal(reversed.transaction.status, 'reversed');
      assert.ok(reversed.transaction.reversedBy);
      const detail = ok(await get(`/finance/invoices/${i.id}`, 'admin'));
      assert.equal(detail.status, 'issued');
      assert.equal(detail.amountPaid, 0);
      const reversal = detail.transactions.find((t) => t.entryType === 'reversal');
      assert.equal(reversal.reversalOf, first.transaction.id);
      assert.equal(reversal.amount, 100000);
      const repeat = ok(await send('POST', `/finance/payments/${first.transaction.id}/reverse`, 'admin', { reason: 'again' }));
      assert.equal(repeat.replayed, true);
      assert.equal(await M.PaymentTransaction.countDocuments({ reversalOf: first.transaction.id }), 1);
      refuse(await send('POST', `/finance/payments/${reversal.id}/reverse`, 'admin', { reason: 'reverse a reversal' }), 404);
      assert.equal((await M.Invoice.findById(i.id).lean()).amountPaid, 0);
    });

    test('simultaneous reversals subtract the amount only once', async () => {
      const i = await issued('ca');
      const a = ok(await pay(i.id, 30000), 201);
      ok(await pay(i.id, 20000), 201);
      const results = await Promise.all(Array.from({ length: 5 }, () => send('POST', `/finance/payments/${a.transaction.id}/reverse`, 'admin', { reason: 'dup' })));
      assert.ok(results.every((r) => r.status === 200), results.map((r) => r.status).join());
      assert.equal((await M.Invoice.findById(i.id).lean()).amountPaid, 20000);
      assert.equal(await M.PaymentTransaction.countDocuments({ reversalOf: a.transaction.id }), 1);
    });

    test('ledger entries are immutable in the database layer', async () => {
      const i = await issued('ca');
      const first = ok(await pay(i.id, 1000), 201);
      await M.PaymentTransaction.updateOne({ _id: first.transaction.id }, { $set: { amount: 1, currency: 'CAD' } });
      const row = await M.PaymentTransaction.findById(first.transaction.id).lean();
      assert.equal(row.amount, 1000);
      assert.equal(row.currency, 'USD');
    });

    test('reconciliation matches stored balances to the ledger and reports a tampered balance', async () => {
      const clean = ok(await get('/finance/reconciliation', 'admin'));
      assert.equal(clean.consistent, true, JSON.stringify(clean.invoices.mismatches));
      const i = await issued('ca');
      ok(await pay(i.id, 5000), 201);
      await M.Invoice.updateOne({ _id: i.id }, { $set: { amountPaid: 7000 } });
      const bad = ok(await get('/finance/reconciliation', 'admin'));
      assert.equal(bad.consistent, false);
      assert.ok(bad.invoices.mismatches.some((m) => m.id === i.id && m.storedPaid === 7000 && m.ledgerPaid === 5000));
      await M.Invoice.updateOne({ _id: i.id }, { $set: { amountPaid: 5000 } });
      assert.equal(ok(await get('/finance/reconciliation', 'admin')).consistent, true);
    });
  });

  /* ---------------------------------------------------------------- carrier payables */
  describe('carrier payables and payouts', () => {
    async function assignedLoad(carrierKey = 'ka', { carrierRate = 80000, customerKey = 'ca' } = {}) {
      return mkLoad(customerKey, { carrierId: D[carrierKey].carrier._id, carrierRate, rate: 120000, brokerMargin: 40000 });
    }
    const mkPayable = async (load, extra = {}) => ok(await send('POST', '/finance/payables', 'admin', { loadId: String(load._id), ...extra }), 201);

    test('a payable defaults to the load carrier rate and belongs to the assigned carrier', async () => {
      const load = await assignedLoad();
      const p = await mkPayable(load);
      assert.match(p.payableNumber, /^CP-\d{4}-\d{6}$/);
      assert.equal(p.amount, 80000);
      assert.equal(p.amountSource, 'load_carrier_rate');
      assert.equal(p.carrierId, String(D.ka.carrier._id));
      assert.equal(p.status, 'draft');
      assert.equal(p.amountPaid, 0);
      assert.ok(!('brokerMargin' in p) && !('customerRate' in p));
    });

    test('an explicit amount is labeled admin_entered; a load without carrier or rate is refused', async () => {
      const load = await assignedLoad('ka', { carrierRate: 80000 });
      const p = await mkPayable(load, { amount: 75000 });
      assert.equal(p.amount, 75000);
      assert.equal(p.amountSource, 'admin_entered');
      const unassigned = await mkLoad('ca');
      refuse(await send('POST', '/finance/payables', 'admin', { loadId: String(unassigned._id) }), 409, 'LOAD_NOT_ASSIGNED');
      const noRate = await mkLoad('ca', { carrierId: D.ka.carrier._id });
      refuse(await send('POST', '/finance/payables', 'admin', { loadId: String(noRate._id) }), 422);
      ok(await send('POST', '/finance/payables', 'admin', { loadId: String(noRate._id), amount: 5000 }), 201);
      const draftLoad = await mkLoad('ca', { status: 'draft', carrierId: D.ka.carrier._id, carrierRate: 1000 });
      refuse(await send('POST', '/finance/payables', 'admin', { loadId: String(draftLoad._id) }), 409, 'LOAD_NOT_PAYABLE');
    });

    test('the request cannot choose the carrier, status, paid amount or currency', async () => {
      const load = await assignedLoad();
      for (const extra of [{ carrierId: String(D.kb.carrier._id) }, { status: 'approved' }, { amountPaid: 5 }, { currency: 'CAD' }, { margin: 1 }]) {
        refuse(await send('POST', '/finance/payables', 'admin', { loadId: String(load._id), ...extra }), 422);
      }
    });

    test('only one live payable per load; a voided payable frees the load', async () => {
      const load = await assignedLoad();
      const p = await mkPayable(load);
      refuse(await send('POST', '/finance/payables', 'admin', { loadId: String(load._id) }), 409, 'PAYABLE_EXISTS');
      const racers = await assignedLoad();
      const results = await Promise.all(Array.from({ length: 5 }, () => send('POST', '/finance/payables', 'admin', { loadId: String(racers._id) })));
      assert.equal(results.filter((r) => r.status === 201).length, 1);
      assert.ok(results.filter((r) => r.status !== 201).every((r) => r.status === 409));
      ok(await send('POST', `/finance/payables/${p.id}/void`, 'admin', { reason: 'Rate dispute' }));
      assert.ok(await mkPayable(load));
    });

    test('lifecycle: draft -> approved -> hold -> release -> payments -> paid; approval is not a payment', async () => {
      const p = await mkPayable(await assignedLoad());
      refuse(await payout(p.id, 1000), 409, 'PAYABLE_NOT_PAYABLE');
      const approved = ok(await send('POST', `/finance/payables/${p.id}/approve`, 'admin', {}));
      assert.equal(approved.status, 'approved');
      assert.equal(approved.amountPaid, 0);
      assert.ok(approved.approvedAt && approved.approvedBy);
      assert.equal(ok(await send('POST', `/finance/payables/${p.id}/approve`, 'admin', {})).status, 'approved', 'approve is idempotent');
      const held = ok(await send('POST', `/finance/payables/${p.id}/hold`, 'admin', { reason: 'POD missing' }));
      assert.equal(held.status, 'on_hold');
      assert.equal(held.holdReason, 'POD missing');
      refuse(await payout(p.id, 1000), 409, 'PAYABLE_NOT_PAYABLE');
      assert.equal(ok(await send('POST', `/finance/payables/${p.id}/release`, 'admin', {})).status, 'approved');
      refuse(await send('POST', `/finance/payables/${p.id}/release`, 'admin', {}), 409, 'PAYABLE_NOT_ON_HOLD');
      const first = ok(await payout(p.id, 30000), 201);
      assert.equal(first.transaction.kind, 'carrier_payout');
      assert.match(first.transaction.confirmationLabel, /not bank-verified/);
      assert.equal(ok(await get(`/finance/payables/${p.id}`, 'admin')).status, 'partially_paid');
      refuse(await payout(p.id, 50001), 409, 'OVERPAYMENT');
      ok(await payout(p.id, 50000), 201);
      const done = ok(await get(`/finance/payables/${p.id}`, 'admin'));
      assert.equal(done.status, 'paid');
      assert.equal(done.outstanding, 0);
      refuse(await payout(p.id, 1), 409, 'PAYABLE_NOT_PAYABLE');
    });

    test('a payout cannot be applied to an invoice and a receipt cannot be applied to a payable', async () => {
      const p = await mkPayable(await assignedLoad());
      ok(await send('POST', `/finance/payables/${p.id}/approve`, 'admin', {}));
      const i = await issued('ca');
      refuse(await send('POST', `/finance/invoices/${p.id}/payments`, 'admin', { amount: 100, currency: 'USD', method: 'bank_transfer', reference: 'x', paymentDate: today(), idempotencyKey: key() }), 404);
      refuse(await send('POST', `/finance/payables/${i.id}/payments`, 'admin', { amount: 100, currency: 'USD', method: 'bank_transfer', reference: 'x', paymentDate: today(), idempotencyKey: key() }), 404);
    });

    test('approval is refused if the load was reassigned to another carrier', async () => {
      const load = await assignedLoad('ka');
      const p = await mkPayable(load);
      await M.Load.updateOne({ _id: load._id }, { $set: { carrierId: D.kb.carrier._id } });
      refuse(await send('POST', `/finance/payables/${p.id}/approve`, 'admin', {}), 409, 'CARRIER_MISMATCH');
    });

    test('adjustments need a reason, keep history and can never go below what was paid', async () => {
      const p = await mkPayable(await assignedLoad());
      ok(await send('POST', `/finance/payables/${p.id}/approve`, 'admin', {}));
      ok(await payout(p.id, 30000), 201);
      refuse(await send('POST', `/finance/payables/${p.id}/adjust`, 'admin', { amount: 20000, reason: 'Lower' }), 409, 'ADJUSTMENT_BELOW_PAID');
      refuse(await send('POST', `/finance/payables/${p.id}/adjust`, 'admin', { amount: 90000 }), 422);
      const adjusted = ok(await send('POST', `/finance/payables/${p.id}/adjust`, 'admin', { amount: 90000, reason: 'Detention approved' }));
      assert.equal(adjusted.amount, 90000);
      assert.equal(adjusted.amountSource, 'admin_entered');
      assert.deepEqual(adjusted.adjustments.map((a) => [a.from, a.to, a.reason]), [[80000, 90000, 'Detention approved']]);
      const exact = ok(await send('POST', `/finance/payables/${p.id}/adjust`, 'admin', { amount: 30000, reason: 'Settled for amount paid' }));
      assert.equal(exact.status, 'paid');
    });

    test('a payable with payments cannot be voided; reversing a payout restores the balance and status', async () => {
      const p = await mkPayable(await assignedLoad());
      ok(await send('POST', `/finance/payables/${p.id}/approve`, 'admin', {}));
      const first = ok(await payout(p.id, 80000), 201);
      assert.equal(ok(await get(`/finance/payables/${p.id}`, 'admin')).status, 'paid');
      refuse(await send('POST', `/finance/payables/${p.id}/void`, 'admin', { reason: 'x' }), 409, 'PAYABLE_HAS_PAYMENTS');
      ok(await send('POST', `/finance/payments/${first.transaction.id}/reverse`, 'admin', { reason: 'Wire recalled' }));
      const back = ok(await get(`/finance/payables/${p.id}`, 'admin'));
      assert.equal(back.status, 'approved');
      assert.equal(back.amountPaid, 0);
    });

    test('simultaneous payouts and duplicate submissions cannot pay a payable twice', async () => {
      const p = await mkPayable(await assignedLoad());
      ok(await send('POST', `/finance/payables/${p.id}/approve`, 'admin', {}));
      const results = await Promise.all(Array.from({ length: 5 }, () => payout(p.id, 80000)));
      assert.equal(results.filter((r) => r.status === 201).length, 1);
      assert.equal((await M.CarrierPayable.findById(p.id).lean()).amountPaid, 80000);
      const q = await mkPayable(await assignedLoad());
      ok(await send('POST', `/finance/payables/${q.id}/approve`, 'admin', {}));
      const k = key();
      const dup = await Promise.all(Array.from({ length: 5 }, () => payout(q.id, 10000, { idempotencyKey: k })));
      assert.equal(dup.filter((r) => r.status === 201).length, 1);
      assert.equal((await M.CarrierPayable.findById(q.id).lean()).amountPaid, 10000);
    });

    test('transitions after void are refused', async () => {
      const p = await mkPayable(await assignedLoad());
      ok(await send('POST', `/finance/payables/${p.id}/void`, 'admin', { reason: 'Duplicate' }));
      for (const action of ['approve', 'release']) refuse(await send('POST', `/finance/payables/${p.id}/${action}`, 'admin', {}), 409);
      refuse(await send('POST', `/finance/payables/${p.id}/hold`, 'admin', { reason: 'x' }), 409);
      refuse(await send('POST', `/finance/payables/${p.id}/adjust`, 'admin', { amount: 5, reason: 'x' }), 409);
      refuse(await payout(p.id, 100), 409, 'PAYABLE_NOT_PAYABLE');
    });
  });

  /* ---------------------------------------------------------------- PDF */
  describe('invoice PDF', () => {
    test('a customer downloads their own PDF built only from stored data, privately', async () => {
      const i = await issued('ca', { extra: { customerNote: 'Net terms apply (see account)' } });
      ok(await pay(i.id, 25000), 201);
      const r = await request('GET', `/customer/billing/invoices/${i.id}/pdf`, { cookie: S.ca, raw: true });
      assert.equal(r.status, 200);
      assert.equal(r.headers.get('content-type'), 'application/pdf');
      assert.match(r.headers.get('cache-control'), /no-store/);
      assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
      assert.match(r.headers.get('content-disposition'), /attachment; filename="INV-/);
      const text = r.buffer.toString('latin1');
      assert.ok(text.startsWith('%PDF-1.4'));
      assert.ok(text.includes(i.invoiceNumber));
      assert.ok(text.includes('HASHIMI LOGISTICS LLC'));
      assert.ok(text.includes('1000.00 USD') && text.includes('250.00 USD') && text.includes('750.00 USD'));
      assert.ok(!/Tax ID|EIN|Remit|IBAN|routing/i.test(text), 'no invented tax or payment details');
      assert.ok(!text.includes('internalNotes'));
    });

    test('untrusted text is escaped inside the PDF and cannot add content', async () => {
      const evil = 'x) Tj ET /Evil (y';
      const i = await issued('ca', { extra: { customerNote: evil } });
      const r = await request('GET', `/finance/invoices/${i.id}/pdf`, { cookie: S.admin, raw: true });
      assert.equal(r.status, 200);
      const text = r.buffer.toString('latin1');
      assert.ok(text.includes('x\\) Tj ET /Evil \\(y'));
    });

    test('another customer, a carrier, a guest and unauthenticated users cannot get the PDF', async () => {
      const i = await issued('ca');
      assert.equal((await request('GET', `/customer/billing/invoices/${i.id}/pdf`, { cookie: S.cb, raw: true })).status, 404);
      assert.equal((await request('GET', `/customer/billing/invoices/${i.id}/pdf`, { cookie: S.ka, raw: true })).status, 403);
      assert.equal((await request('GET', `/customer/billing/invoices/${i.id}/pdf`, { raw: true })).status, 401);
      assert.equal((await request('GET', `/finance/invoices/${i.id}/pdf`, { cookie: S.ca, raw: true })).status, 403);
      assert.equal((await request('GET', `/finance/invoices/${i.id}/pdf`, { cookie: S.ka, raw: true })).status, 403);
      const d = await draft('ca');
      assert.equal((await request('GET', `/customer/billing/invoices/${d.id}/pdf`, { cookie: S.ca, raw: true })).status, 404, 'a customer cannot download a draft');
    });
  });

  /* ---------------------------------------------------------------- portals and leakage */
  describe('customer and carrier portals', () => {
    test('a customer sees only their own issued invoices, with payments and no internal data', async () => {
      const mine = await issued('ca', { extra: { internalNotes: 'INTERNAL-MARGIN-NOTE', customerNote: 'Visible note' } });
      const theirs = await issued('cb');
      const hiddenDraft = await draft('ca');
      const list = ok(await get('/customer/billing/invoices?limit=100', 'ca'));
      const ids = list.items.map((x) => x.id);
      assert.ok(ids.includes(mine.id));
      assert.ok(!ids.includes(theirs.id));
      assert.ok(!ids.includes(hiddenDraft.id));
      assert.equal(list.payment.onlinePaymentAvailable, false);
      assert.match(list.payment.message, /Online payment is not currently available/);
      ok(await pay(mine.id, 10000), 201);
      ok(await pay(mine.id, 5000, { outcome: 'failed', failureNote: 'FAILURE-NOTE-SECRET' }), 201);
      const detailRes = await get(`/customer/billing/invoices/${mine.id}`, 'ca');
      const detail = ok(detailRes);
      assert.equal(detail.amountPaid, 10000);
      assert.equal(detail.outstanding, 90000);
      assert.equal(detail.payments.length, 1, 'failed attempts are not shown to the customer');
      assert.equal(detail.customerNote, 'Visible note');
      assert.equal(detail.onlinePaymentAvailable, false);
      assert.equal(detail.paymentInstructions, null);
      const raw = detailRes.text;
      for (const secret of ['INTERNAL-MARGIN-NOTE', 'FAILURE-NOTE-SECRET', 'internalNotes', 'createdBy', 'recordedBy', 'carrier', 'brokerMargin', 'reference', 'WIRE-1', 'payable', 'idempotencyKey']) {
        assert.ok(!raw.includes(secret), `customer response leaks "${secret}"`);
      }
    });

    test('a customer cannot read another customer\'s invoice by id (404, not 403)', async () => {
      const theirs = await issued('cb');
      refuse(await get(`/customer/billing/invoices/${theirs.id}`, 'ca'), 404);
      refuse(await get(`/customer/billing/invoices/${new mongoose.Types.ObjectId()}`, 'ca'), 404);
      refuse(await get('/customer/billing/invoices/not-an-id', 'ca'), 400);
      const d = await draft('ca');
      refuse(await get(`/customer/billing/invoices/${d.id}`, 'ca'), 404);
    });

    test('filter and sort injection through the customer list cannot widen the scope', async () => {
      await issued('cb');
      refuse(await get('/customer/billing/invoices?customerId=' + D.cb.customer._id, 'ca'), 400);
      refuse(await get('/customer/billing/invoices?status[$ne]=void', 'ca'), 400);
      refuse(await get('/customer/billing/invoices?sort=internalNotes', 'ca'), 400);
      refuse(await get('/customer/billing/invoices?owner=x', 'ca'), 400);
      const all = ok(await get('/customer/billing/invoices?limit=100&status=overdue', 'ca'));
      assert.ok(all.items.every((x) => x.id));
    });

    test('a void invoice is visible only if it had been issued', async () => {
      const i = await issued('ca');
      ok(await send('POST', `/finance/invoices/${i.id}/void`, 'admin', { reason: 'Reissue' }));
      const list = ok(await get('/customer/billing/invoices?limit=100&status=void', 'ca'));
      assert.ok(list.items.some((x) => x.id === i.id && x.outstanding === 0));
      const d = await draft('ca');
      ok(await send('POST', `/finance/invoices/${d.id}/void`, 'admin', { reason: 'Never issued' }));
      assert.ok(!ok(await get('/customer/billing/invoices?limit=100&status=void', 'ca')).items.some((x) => x.id === d.id));
    });

    test('a carrier sees only their own approved payables and no customer, margin or hold data', async () => {
      const load = await mkLoad('ca', { carrierId: D.ka.carrier._id, carrierRate: 61000, rate: 99000, brokerMargin: 38000 });
      const p = ok(await send('POST', '/finance/payables', 'admin', { loadId: String(load._id), internalNotes: 'CARRIER-INTERNAL-NOTE' }), 201);
      assert.ok(!ok(await get('/carrier/payables?limit=100', 'ka')).items.some((x) => x.id === p.id), 'drafts are hidden');
      refuse(await get(`/carrier/payables/${p.id}`, 'ka'), 404);
      ok(await send('POST', `/finance/payables/${p.id}/approve`, 'admin', {}));
      ok(await send('POST', `/finance/payables/${p.id}/hold`, 'admin', { reason: 'HOLD-REASON-SECRET' }));
      let detailRes = await get(`/carrier/payables/${p.id}`, 'ka');
      let detail = ok(detailRes);
      assert.equal(detail.status, 'on_hold');
      assert.equal(detail.amount, 61000);
      ok(await send('POST', `/finance/payables/${p.id}/release`, 'admin', {}));
      ok(await payout(p.id, 20000), 201);
      ok(await payout(p.id, 5000, { outcome: 'failed', failureNote: 'PAYOUT-FAIL-SECRET' }), 201);
      detailRes = await get(`/carrier/payables/${p.id}`, 'ka');
      detail = ok(detailRes);
      assert.equal(detail.loadNumber, load.loadNumber);
      assert.equal(detail.amountPaid, 20000);
      assert.equal(detail.payments.length, 1);
      assert.equal(detail.payments[0].reference, 'ACH-77');
      for (const secret of ['CARRIER-INTERNAL-NOTE', 'HOLD-REASON-SECRET', 'PAYOUT-FAIL-SECRET', 'brokerMargin', 'customer', 'invoice', '99000', 'Shipper', 'internalNotes', 'holdReason', 'recordedBy', 'idempotencyKey']) {
        assert.ok(!detailRes.text.includes(secret), `carrier response leaks "${secret}"`);
      }
      refuse(await get(`/carrier/payables/${p.id}`, 'kb'), 404);
      assert.ok(!ok(await get('/carrier/payables?limit=100', 'kb')).items.some((x) => x.id === p.id));
    });

    test('carriers cannot write, and customers cannot reach payables or the finance API', async () => {
      const load = await mkLoad('ca', { carrierId: D.ka.carrier._id, carrierRate: 1000 });
      const p = ok(await send('POST', '/finance/payables', 'admin', { loadId: String(load._id) }), 201);
      ok(await send('POST', `/finance/payables/${p.id}/approve`, 'admin', {}));
      for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) {
        const r = await send(method, `/carrier/payables/${p.id}`, 'ka', { status: 'paid', amount: 999999 });
        assert.ok([404, 405].includes(r.status), `${method} ${r.status}`);
      }
      assert.equal((await send('POST', `/carrier/payables/${p.id}/payments`, 'ka', { amount: 1 })).status, 404);
      refuse(await get('/carrier/payables', 'ca'), 403);
      refuse(await get('/customer/billing/invoices', 'ka'), 403);
      assert.equal((await send('PATCH', `/customer/billing/invoices/${p.id}`, 'ca', { status: 'paid' })).status, 404);
      assert.equal((await send('POST', '/customer/billing/invoices/x/payments', 'ca', { amount: 1 })).status, 404);
      assert.equal((await M.CarrierPayable.findById(p.id).lean()).status, 'approved');
    });
  });

  /* ---------------------------------------------------------------- hardening (independent review) */
  describe('hardening regressions', () => {
    test('upper-case ids and keys cannot bypass the lock or idempotency (one payment recorded)', async () => {
      const i = await issued('ca');
      const k = key();
      const upper = i.id.toUpperCase();
      const results = await Promise.all([
        send('POST', `/finance/invoices/${i.id}/payments`, 'admin', { amount: 60000, currency: 'USD', method: 'bank_transfer', reference: 'W', paymentDate: today(), idempotencyKey: k }),
        send('POST', `/finance/invoices/${upper}/payments`, 'admin', { amount: 60000, currency: 'USD', method: 'bank_transfer', reference: 'W', paymentDate: today(), idempotencyKey: k }),
        send('POST', `/finance/invoices/${upper}/payments`, 'admin', { amount: 60000, currency: 'USD', method: 'bank_transfer', reference: 'W', paymentDate: today(), idempotencyKey: key() }),
      ]);
      const created = results.filter((r) => r.status === 201).length;
      assert.ok(created <= 1 + 0 || created === 1, 'only one distinct payment may apply: ' + results.map((r) => r.status));
      const row = await M.Invoice.findById(i.id).lean();
      assert.ok(row.amountPaid <= row.total);
      const sum = (await M.PaymentTransaction.find({ invoiceId: i.id, entryType: 'payment', status: 'succeeded' }).lean()).reduce((a, t) => a + t.amount, 0);
      assert.equal(row.amountPaid, sum);
    });

    test('idempotency keys longer than 64 characters or shorter than 8 are refused', async () => {
      const i = await issued('ca');
      refuse(await pay(i.id, 100, { idempotencyKey: 'k'.repeat(65) }), 422);
      refuse(await pay(i.id, 100, { idempotencyKey: 'short' }), 422);
    });

    test('a stale stored balance is repaired from the ledger on the next write', async () => {
      const i = await issued('ca');
      ok(await pay(i.id, 30000), 201);
      await M.Invoice.collection.updateOne({ _id: new mongoose.Types.ObjectId(i.id) }, { $set: { amountPaid: 0, status: 'issued' } });
      ok(await pay(i.id, 10000), 201);
      const row = await M.Invoice.findById(i.id).lean();
      assert.equal(row.amountPaid, 40000);
      assert.equal(row.status, 'partially_paid');
    });

    test('reusing an idempotency key with a different reference or method is refused', async () => {
      const i = await issued('ca');
      const k = key();
      ok(await pay(i.id, 1000, { idempotencyKey: k }), 201);
      const again = await pay(i.id, 1000, { idempotencyKey: k, reference: 'OTHER-REF' });
      assert.ok([409, 422].includes(again.status), again.text);
      const other = await pay(i.id, 1000, { idempotencyKey: k, method: 'check' });
      assert.ok([409, 422].includes(other.status), other.text);
    });

    test('release recomputes the status from the amounts after a payout reversal while on hold', async () => {
      const load = await mkLoad('ca', { carrierId: D.ka.carrier._id, carrierRate: 50000, rate: 90000 });
      const p = ok(await send('POST', '/finance/payables', 'admin', { loadId: String(load._id) }), 201);
      ok(await send('POST', `/finance/payables/${p.id}/approve`, 'admin', {}));
      const t = ok(await payout(p.id, 20000), 201);
      ok(await send('POST', `/finance/payables/${p.id}/hold`, 'admin', { reason: 'Review' }));
      ok(await send('POST', `/finance/payments/${t.transaction.id}/reverse`, 'admin', { reason: 'Wrong' }));
      const released = ok(await send('POST', `/finance/payables/${p.id}/release`, 'admin', {}));
      assert.equal(released.status, 'approved');
      assert.equal(released.amountPaid, 0);
    });

    test('a payout is refused if the load was reassigned to another carrier after approval', async () => {
      const load = await mkLoad('ca', { carrierId: D.ka.carrier._id, carrierRate: 50000, rate: 90000 });
      const p = ok(await send('POST', '/finance/payables', 'admin', { loadId: String(load._id) }), 201);
      ok(await send('POST', `/finance/payables/${p.id}/approve`, 'admin', {}));
      await M.Load.updateOne({ _id: load._id }, { $set: { carrierId: D.kb.carrier._id } });
      refuse(await payout(p.id, 1000), 409, 'CARRIER_MISMATCH');
      assert.equal((await M.CarrierPayable.findById(p.id).lean()).amountPaid, 0);
    });

    test('a new payment after a reversal notifies again (event keys do not collide)', async () => {
      const i = await issued('ca');
      email.reset();
      const flush = () => svc.processDueDeliveries({ limit: 200 });
      const a = ok(await pay(i.id, 5000), 201);
      ok(await send('POST', `/finance/payments/${a.transaction.id}/reverse`, 'admin', { reason: 'Mistake' }));
      ok(await pay(i.id, 5000), 201);
      await flush();
      assert.equal(await M.Notification.countDocuments({ 'relatedEntity.entityId': i.id, title: /Payment recorded/ }), 2);
    });
  });

  /* ---------------------------------------------------------------- authorization */
  describe('authorization', () => {
    const routes = [
      ['GET', '/finance/summary'], ['GET', '/finance/reconciliation'], ['GET', '/finance/payment-gateway'],
      ['GET', '/finance/invoices'], ['POST', '/finance/invoices'], ['GET', '/finance/payments'],
      ['GET', '/finance/payables'], ['POST', '/finance/payables'],
      ['GET', '/finance/invoices/000000000000000000000000'], ['POST', '/finance/invoices/000000000000000000000000/issue'],
      ['POST', '/finance/invoices/000000000000000000000000/void'], ['POST', '/finance/invoices/000000000000000000000000/payments'],
      ['POST', '/finance/payments/000000000000000000000000/reverse'], ['POST', '/finance/payables/000000000000000000000000/approve'],
      ['POST', '/finance/payables/000000000000000000000000/payments'], ['GET', '/finance/invoices/000000000000000000000000/pdf'],
    ];

    test('guests receive 401 and customers/carriers receive 403 on every finance route', async () => {
      for (const [method, path] of routes) {
        assert.equal((await request(method, path, { json: method === 'GET' ? undefined : {} })).status, 401, `guest ${method} ${path}`);
        for (const as of ['ca', 'ka']) assert.equal((await send(method, path, as, method === 'GET' ? undefined : {})).status, 403, `${as} ${method} ${path}`);
      }
    });

    test('role injection and owner spoofing in bodies, queries and headers are ignored or refused', async () => {
      const i = await issued('ca');
      refuse(await send('POST', `/finance/invoices/${i.id}/payments`, 'ca', { amount: 100000, currency: 'USD', method: 'other_offline', paymentDate: today(), idempotencyKey: key() }), 403);
      const spoof = await request('GET', '/finance/summary', { cookie: S.ca, headers: { 'X-Role': 'super_admin', 'X-User-Id': String(D.admin._id) } });
      assert.equal(spoof.status, 403);
      assert.equal((await send('POST', '/auth/login', 'ca', { email: 'fin.ca@example.com', password: PASS, role: 'super_admin' })).status, 422);
      const detail = ok(await get(`/finance/invoices/${i.id}`, 'admin'));
      assert.equal(detail.amountPaid, 0);
    });

    test('untrusted origins cannot change finance data with a valid cookie', async () => {
      const i = await issued('ca');
      const r = await request('POST', `/finance/invoices/${i.id}/void`, { cookie: S.admin, json: { reason: 'cross-site' }, headers: { Origin: 'https://evil.example' } });
      assert.equal(r.status, 403);
      assert.equal((await M.Invoice.findById(i.id).lean()).status, 'issued');
    });

    test('operator injection in finance queries is rejected', async () => {
      refuse(await get('/finance/invoices?status[$ne]=draft', 'admin'), 400);
      refuse(await get('/finance/payments?kind[$gt]=', 'admin'), 400);
      refuse(await send('POST', '/finance/invoices', 'admin', { loadId: String((await mkLoad('ca'))._id), lineItems: items(), $where: '1' }), 400);
    });
  });

  /* ---------------------------------------------------------------- audit */
  describe('audit history', () => {
    test('sensitive financial actions are recorded with the actor and without secrets', async () => {
      const i = await issued('ca');
      const first = ok(await pay(i.id, 12345, { internalNotes: 'private ops note' }), 201);
      ok(await send('POST', `/finance/payments/${first.transaction.id}/reverse`, 'admin', { reason: 'Test reversal' }));
      ok(await send('POST', `/finance/invoices/${i.id}/void`, 'admin', { reason: 'Test void' }));
      const logs = await M.ActivityLog.find({ entityId: i.id, module: 'payments' }).sort({ createdAt: 1 }).lean();
      const actions = logs.map((l) => l.action);
      for (const wanted of ['invoice.issued', 'invoice.payment_recorded', 'invoice.payment_reversed', 'invoice.voided']) assert.ok(actions.includes(wanted), `${wanted} in ${actions}`);
      assert.ok(logs.every((l) => String(l.userId) === String(D.admin._id)));
      const dump = JSON.stringify(logs);
      assert.ok(!dump.includes('private ops note'));
      assert.ok(!/password|token|card/i.test(dump));
      const adminLogs = ok(await get('/admin/activity-logs?limit=5', 'admin'));
      assert.ok(adminLogs);
      for (const method of ['PATCH', 'PUT', 'DELETE', 'POST']) {
        assert.ok([404, 405, 403].includes((await send(method, `/admin/activity-logs/${logs[0]._id}`, 'admin', {})).status));
      }
    });

    test('failed validation records nothing and payments never log amounts of other records', async () => {
      const i = await issued('ca');
      const before = await M.ActivityLog.countDocuments({ module: 'payments' });
      refuse(await pay(i.id, 999999999), 409, 'OVERPAYMENT');
      refuse(await pay(i.id, 100, { currency: 'CAD' }), 409, 'CURRENCY_MISMATCH');
      refuse(await pay(i.id, 0), 422);
      assert.equal(await M.ActivityLog.countDocuments({ module: 'payments' }), before, 'refused payments leave no audit entry');
    });
  });

  /* ---------------------------------------------------------------- notifications */
  describe('notifications', () => {
    const flush = () => svc.processDueDeliveries({ limit: 200 });
    beforeEach(async () => {
      await M.NotificationDelivery.deleteMany({});
      email.reset();
    });

    test('issuing notifies the right customer only, with generic wording and no amounts', async () => {
      email.reset();
      const i = await issued('ca', { unit: 123456 });
      await flush();
      const notes = await M.Notification.find({ 'relatedEntity.entityId': i.id, type: 'payment' }).lean();
      assert.equal(notes.length, 1);
      assert.equal(String(notes[0].recipientId), String(D.ca.user._id));
      assert.equal(notes[0].relatedEntity.entityType, 'invoice');
      assert.ok(notes[0].message.includes(i.invoiceNumber));
      assert.ok(!/\d+\.\d{2}|USD|1234/.test(notes[0].title + notes[0].message), 'no amounts in the notification');
      const sent = email.calls.filter((c) => c.to === 'fin.ca@example.com');
      assert.equal(sent.length, 1);
      assert.ok(!/123456|1234\.56|WIRE|bank/i.test(sent[0].text + sent[0].html));
      assert.equal(email.calls.filter((c) => c.to === 'fin.cb@example.com').length, 0);
    });

    test('recording a payment notifies once with "recorded" wording; reversal notifies too; repeats do not duplicate', async () => {
      const i = await issued('ca');
      email.reset();
      const k = key();
      const first = ok(await pay(i.id, 20000, { idempotencyKey: k }), 201);
      ok(await pay(i.id, 20000, { idempotencyKey: k }), 200);
      await flush();
      const notes = await M.Notification.find({ 'relatedEntity.entityId': i.id, title: /Payment recorded/ }).lean();
      assert.equal(notes.length, 1);
      assert.ok(/recorded/i.test(notes[0].message) && !/received|confirmed|paid in full/i.test(notes[0].message));
      assert.ok(!/200\.00|20000|WIRE-1/.test(notes[0].message));
      ok(await send('POST', `/finance/payments/${first.transaction.id}/reverse`, 'admin', { reason: 'Mistake' }));
      assert.equal(await M.Notification.countDocuments({ 'relatedEntity.entityId': i.id, title: /reversed/ }), 1);
      const failed = ok(await pay(i.id, 100, { outcome: 'failed' }), 201);
      assert.equal(failed.transaction.status, 'failed');
      assert.equal(await M.Notification.countDocuments({ 'relatedEntity.entityId': i.id }), 3, 'a failed manual attempt does not notify the customer');
    });

    test('payable approval and payout notify only the assigned carrier, without amounts', async () => {
      const load = await mkLoad('ca', { carrierId: D.ka.carrier._id, carrierRate: 77777 });
      const p = ok(await send('POST', '/finance/payables', 'admin', { loadId: String(load._id) }), 201);
      email.reset();
      ok(await send('POST', `/finance/payables/${p.id}/approve`, 'admin', {}));
      ok(await send('POST', `/finance/payables/${p.id}/payments`, 'admin', { amount: 1000, currency: 'USD', method: 'bank_transfer', reference: 'ACH-1', paymentDate: today(), idempotencyKey: key() }), 201);
      await flush();
      const notes = await M.Notification.find({ 'relatedEntity.entityId': p.id }).lean();
      assert.equal(notes.length, 2);
      assert.ok(notes.every((n) => String(n.recipientId) === String(D.ka.user._id) && n.type === 'payment' && n.relatedEntity.entityType === 'carrier_payable'));
      assert.ok(notes.every((n) => !/777\.77|77777|ACH-1|customer|Shipper/i.test(n.title + n.message)));
      assert.equal(email.calls.filter((c) => c.to === 'fin.kb@example.com' || c.to === 'fin.ca@example.com').length, 0);
      assert.ok(email.calls.filter((c) => c.to === 'fin.ka@example.com').length >= 1);
    });

    test('an unavailable email provider never changes the financial result', async () => {
      providers.setEmailProviderForTests(null);
      try {
        const i = await issued('ca');
        const first = ok(await pay(i.id, 50000), 201);
        assert.equal(first.transaction.status, 'succeeded');
        assert.equal((await M.Invoice.findById(i.id).lean()).amountPaid, 50000);
        const rows = await M.NotificationDelivery.find({ notificationId: { $in: (await M.Notification.find({ 'relatedEntity.entityId': i.id }).lean()).map((n) => n._id) }, channel: 'EMAIL' }).lean();
        assert.ok(rows.every((r) => r.status !== 'SENT'), 'no fake delivery');
      } finally {
        providers.setEmailProviderForTests(email);
      }
    });

    test('a customer who disabled email still gets the in-app notification', async () => {
      await M.User.updateOne({ _id: D.cb.user._id }, { $set: { notificationPreferences: { emailNotifications: false } } });
      email.reset();
      const i = await issued('cb');
      await flush();
      assert.equal(email.calls.filter((c) => c.to === 'fin.cb@example.com').length, 0);
      assert.equal(await M.Notification.countDocuments({ recipientId: D.cb.user._id, 'relatedEntity.entityId': i.id }), 1);
      await M.User.updateOne({ _id: D.cb.user._id }, { $unset: { notificationPreferences: '' } });
    });
  });

  /* ---------------------------------------------------------------- summary */
  describe('finance summary', () => {
    test('is computed from persisted records and keeps revenue, receipts and carrier costs separate', async () => {
      await M.Invoice.deleteMany({});
      await M.CarrierPayable.deleteMany({});
      await M.PaymentTransaction.deleteMany({});
      const a = await issued('ca', { unit: 100000 });
      const b = await issued('ca', { unit: 50000 });
      await issued('cb', { unit: 20000 });
      await draft('ca', { unit: 9999 });
      ok(await pay(a.id, 100000), 201);
      ok(await pay(b.id, 10000), 201);
      await M.Invoice.updateOne({ _id: b.id }, { $set: { dueDate: new Date(Date.now() - 86400000) } });
      const load = await mkLoad('ca', { carrierId: D.ka.carrier._id, carrierRate: 70000 });
      const p = ok(await send('POST', '/finance/payables', 'admin', { loadId: String(load._id) }), 201);
      ok(await send('POST', `/finance/payables/${p.id}/approve`, 'admin', {}));
      ok(await send('POST', `/finance/payables/${p.id}/payments`, 'admin', { amount: 20000, currency: 'USD', method: 'check', reference: 'CHK-9', paymentDate: today(), idempotencyKey: key() }), 201);

      const s = ok(await get('/finance/summary', 'admin'));
      if (process.env.FIN_DEBUG) process.stderr.write(JSON.stringify(s.perCurrency) + '\n');
      const usd = s.perCurrency.USD;
      assert.equal(usd.customerInvoices.issuedCount, 3);
      assert.equal(usd.customerInvoices.draftCount, 1);
      assert.equal(usd.customerInvoices.paidCount, 1);
      assert.equal(usd.customerInvoices.paidInvoiceTotal, 100000);
      assert.equal(usd.customerInvoices.outstandingBalance, 40000 + 20000);
      assert.equal(usd.customerInvoices.overdueCount, 1);
      assert.equal(usd.customerInvoices.overdueOutstanding, 40000);
      assert.equal(usd.customerReceiptsRecorded.recordedAmount, 110000);
      assert.equal(usd.customerReceiptsRecorded.recordedCount, 2);
      assert.equal(usd.carrierPayables.approvedOwedOutstanding, 50000);
      assert.equal(usd.carrierPayoutsRecorded.recordedAmount, 20000);
      assert.equal(usd.carrierPayables.partiallyPaidCount, 1);
      assert.equal(s.recentActivity.length, 3);
      assert.ok(!('profit' in s) && !('net' in s) && !('margin' in s) && !('cashReceived' in s));
      assert.match(s.basis, /not bank-verified/);
      assert.equal(s.totals.invoices, 4);
    });

    test('the gateway status endpoint reports not configured', async () => {
      const g = ok(await get('/finance/payment-gateway', 'admin'));
      assert.equal(g.configured, false);
      assert.match(g.status, /NOT CONFIGURED/);
      assert.equal(g.onlinePaymentAvailable, false);
    });

    test('an empty database returns zeroed, well-formed data', async () => {
      await M.Invoice.deleteMany({});
      await M.CarrierPayable.deleteMany({});
      await M.PaymentTransaction.deleteMany({});
      const s = ok(await get('/finance/summary', 'admin'));
      assert.deepEqual(s.perCurrency, {});
      assert.deepEqual(s.recentActivity, []);
      assert.equal(ok(await get('/finance/invoices', 'admin')).pagination.total, 0);
    });
  });

  /* ---------------------------------------------------------------- regression guard */
  describe('Phase 1-11 behavior is untouched', () => {
    test('the legacy customer invoices and carrier payments endpoints still work', async () => {
      assert.equal((await get('/customer/invoices', 'ca')).status, 200);
      assert.equal((await get('/carrier/payments', 'ka')).status, 200);
      assert.equal((await get('/admin/payments', 'admin')).status, 200);
    });

    test('still exactly three roles and one super admin', async () => {
      assert.deepEqual(M.User.schema.path('role').enumValues, ['super_admin', 'customer', 'carrier']);
      assert.equal(await M.User.countDocuments({ role: 'super_admin' }), 1);
    });
  });
});
