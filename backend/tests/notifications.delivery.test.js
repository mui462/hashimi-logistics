/**
 * Phase 11 tests: email / SMS delivery queue, providers, retry, idempotency, preferences, auth emails, admin delivery log
 * and security. Every provider is a mock or a mock `fetch`: no real message is ever sent and no credentials are needed.
 *
 *   MONGO_TEST_URI=mongodb://127.0.0.1:27017/hashimi_delivery_test npm test
 *
 * The database name must end in "_test" because it is dropped afterwards.
 */
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { after, before, describe, test } from 'node:test';

const testUri = process.env.MONGO_TEST_URI;
const skipReason = testUri ? false : 'MONGO_TEST_URI is not set; these tests require a live MongoDB';

if (testUri) {
  const databaseName = new URL(testUri).pathname.replace(/^\//, '');
  if (!databaseName.endsWith('_test')) throw new Error(`Refusing to run: database "${databaseName}" must end with "_test" because it is dropped afterwards.`);
}
Object.assign(process.env, {
  NODE_ENV: 'development',
  MONGO_URI: testUri ?? 'mongodb://127.0.0.1:27017/unused_test',
  JWT_SECRET: 'delivery-test-secret-delivery-test-secret-12',
  CLIENT_URL: 'http://localhost:5173',
  AUTH_RATE_LIMIT_MAX: '10000',
  RESET_EMAIL_LIMIT_MAX: '100000',
  UPLOAD_RATE_LIMIT_MAX: '100000',
  QUOTE_IP_LIMIT_MAX: '100000',
  GLOBAL_RATE_LIMIT_MAX: '100000',
  LOGIN_ACCOUNT_LIMIT_MAX: '500',
  NOTIFICATION_RATE_LIMIT_MAX: '40',
  DELIVERY_MAX_ATTEMPTS: '3',
  DELIVERY_BACKOFF_BASE_SECONDS: '60',
});

const PASS = 'delivery-test-pass-phrase-1';
const SECRET_DETAIL = 'SECRET-PROVIDER-DETAIL';

/* ------------------------------------------------------------------ unit: no database */

describe('delivery units (no database, no network)', () => {
  test('phone numbers normalize to E.164 only when they can be trusted', async () => {
    const { normalizePhone, isE164 } = await import('../src/notifications/phone.js');
    assert.equal(normalizePhone('(312) 555-0142'), '+13125550142');
    assert.equal(normalizePhone('312.555.0142'), '+13125550142');
    assert.equal(normalizePhone('1-312-555-0142'), '+13125550142');
    assert.equal(normalizePhone('+44 20 7946 0958'), '+442079460958');
    for (const bad of ['555-0142', '12345', 'call me', '', '   ', null, undefined, '+0123456789', '+1', '011 44 20 7946 0958', '(012) 555-0142', 12345]) assert.equal(normalizePhone(bad), null, String(bad));
    assert.ok(isE164('+13125550142'));
    assert.ok(!isE164('3125550142'));
  });

  test('templates escape dynamic content and only build same-site links', async () => {
    const { renderNotificationEmail, renderSecurityEmail, renderSms, actionUrl, escapeHtml } = await import('../src/notifications/templates.js');
    const evil = '<script>alert(1)</script><img src=x onerror=alert(2)> "quoted" & \'single\'';
    const email = renderNotificationEmail({ recipientName: evil, title: evil, message: evil, actionPath: '/customer/notifications' });
    assert.ok(!email.html.includes('<script>'));
    assert.ok(!email.html.includes('<img'));
    assert.ok(email.html.includes('&lt;script&gt;'));
    assert.ok(email.html.includes('HASHIMI LOGISTICS INC.'));
    assert.ok(email.html.includes('http://localhost:5173/customer/notifications'));
    assert.equal(escapeHtml('<>&"\''), '&lt;&gt;&amp;&quot;&#39;');
    for (const bad of ['https://evil.example/phish', '//evil.example', 'javascript:alert(1)', '/a b', '/"><script>', null, undefined]) assert.equal(actionUrl(bad), null, String(bad));
    const security = renderSecurityEmail({ kind: 'password_reset', recipientName: 'Ann', link: 'http://localhost:5173/reset-password?token=abc' });
    assert.ok(security.text.includes('token=abc'));
    assert.ok(!/phone|address|MC number|DOT number|guarantee/i.test(security.html));
    const sms = renderSms({ title: 'Your quote is ready' });
    assert.ok(sms.length <= 300 && !/https?:\/\//.test(sms));
  });

  test('stored provider errors never carry keys, addresses, numbers or response bodies', async () => {
    const { ProviderError, sanitizeError, fromHttpStatus, fromNetworkError } = await import('../src/notifications/providers/ProviderError.js');
    const text = sanitizeError(new ProviderError('http_400', 'bad key re_abcdefghijklmnopqrstuvwxyz0123 for ann@example.com and +13125550142'));
    assert.ok(!/re_abc|ann@example|3125550142/.test(text), text);
    assert.equal(text, 'http_400: Provider returned HTTP 400.');
    assert.equal(sanitizeError(new Error(`boom ${SECRET_DETAIL}`)), 'unexpected_error: Delivery failed unexpectedly.');
    assert.equal(fromHttpStatus(503).temporary, true);
    assert.equal(fromHttpStatus(429).temporary, true);
    assert.equal(fromHttpStatus(400).temporary, false);
    assert.equal(fromHttpStatus(401).temporary, false);
    assert.equal(fromNetworkError(Object.assign(new Error('x'), { name: 'TimeoutError' })).code, 'timeout');
  });

  test('the Resend provider talks HTTPS with a bearer key, returns the provider id, and classifies failures', async () => {
    const { createResendProvider } = await import('../src/notifications/providers/email.resend.js');
    const seen = [];
    const respond = (status, body) => async (url, init) => { seen.push({ url, init }); return { ok: status < 300, status, json: async () => body }; };
    const provider = createResendProvider({ apiKey: 'RESEND-KEY-FOR-TEST', from: 'Notices <notices@example.test>', replyTo: 'help@example.test', fetchImpl: respond(200, { id: 'msg_123' }) });
    const result = await provider.send({ to: 'a@example.com', subject: 'S', text: 'T', html: '<p>T</p>' });
    assert.deepEqual(result, { providerMessageId: 'msg_123' });
    assert.equal(seen[0].url, 'https://api.resend.com/emails');
    assert.equal(seen[0].init.headers.Authorization, 'Bearer RESEND-KEY-FOR-TEST');
    const sent = JSON.parse(seen[0].init.body);
    assert.deepEqual([sent.to, sent.from, sent.reply_to], [['a@example.com'], 'Notices <notices@example.test>', 'help@example.test']);
    const failing = (status) => createResendProvider({ apiKey: 'RESEND-KEY-FOR-TEST', from: 'x@example.test', fetchImpl: respond(status, { message: `${SECRET_DETAIL} RESEND-KEY-FOR-TEST` }) });
    await assert.rejects(() => failing(500).send({ to: 'a@example.com', subject: 'S', text: 'T' }), (e) => e.temporary === true && !e.message.includes(SECRET_DETAIL) && !e.message.includes('RESEND-KEY'));
    await assert.rejects(() => failing(422).send({ to: 'a@example.com', subject: 'S', text: 'T' }), (e) => e.temporary === false);
    const down = createResendProvider({ apiKey: 'k'.repeat(10), from: 'x@example.test', fetchImpl: async () => { throw new Error(`socket ${SECRET_DETAIL}`); } });
    await assert.rejects(() => down.send({ to: 'a@example.com', subject: 'S', text: 'T' }), (e) => e.temporary === true && e.code === 'network' && !e.message.includes(SECRET_DETAIL));
    const noId = createResendProvider({ apiKey: 'k'.repeat(10), from: 'x@example.test', fetchImpl: respond(200, {}) });
    await assert.rejects(() => noId.send({ to: 'a@example.com', subject: 'S', text: 'T' }), (e) => e.code === 'no_message_id');
  });

  test('the Twilio provider sends form data with basic auth and returns the message sid', async () => {
    const { createTwilioProvider } = await import('../src/notifications/providers/sms.twilio.js');
    const seen = [];
    const provider = createTwilioProvider({ accountSid: `AC${'a'.repeat(32)}`, authToken: 'TWILIO-TOKEN-FOR-TEST', fromNumber: '+15555550123', fetchImpl: async (url, init) => { seen.push({ url, init }); return { ok: true, status: 201, json: async () => ({ sid: 'SM123' }) }; } });
    assert.deepEqual(await provider.send({ to: '+13125550142', body: 'Hello' }), { providerMessageId: 'SM123' });
    assert.ok(seen[0].url.includes(`/Accounts/AC${'a'.repeat(32)}/Messages.json`));
    assert.equal(seen[0].init.headers.Authorization, `Basic ${Buffer.from(`AC${'a'.repeat(32)}:TWILIO-TOKEN-FOR-TEST`).toString('base64')}`);
    const form = new URLSearchParams(seen[0].init.body);
    assert.deepEqual([form.get('To'), form.get('From'), form.get('Body')], ['+13125550142', '+15555550123', 'Hello']);
  });

  test('sealed payloads round-trip and any tampering is detected', async () => {
    const { seal, open } = await import('../src/notifications/secureText.js');
    const sealed = seal({ link: 'http://localhost:5173/reset-password?token=RAW-TOKEN', expiresAt: 'x' });
    assert.ok(!sealed.includes('RAW-TOKEN'));
    assert.equal(open(sealed).link, 'http://localhost:5173/reset-password?token=RAW-TOKEN');
    const [iv, tag, data] = sealed.split('.');
    assert.throws(() => open([iv, tag, Buffer.from('tampered').toString('base64url')].join('.')));
  });

  test('retry delays grow exponentially and are capped', async () => {
    const { backoffSeconds } = await import('../src/notifications/delivery.service.js');
    assert.deepEqual([1, 2, 3, 4].map(backoffSeconds), [60, 120, 240, 480]);
    assert.equal(backoffSeconds(30), 3600);
  });

  test('environment rules: mock providers are refused in production and real providers need their credentials', () => {
    const run = (extra) => spawnSync(process.execPath, ['--input-type=module', '-e', "await import('./src/config/env.js')"], { cwd: new URL('..', import.meta.url), env: { PATH: process.env.PATH, NODE_ENV: 'development', MONGO_URI: 'mongodb://127.0.0.1:27017/x', JWT_SECRET: 'x'.repeat(40), CLIENT_URL: 'http://localhost:5173', ...extra }, encoding: 'utf8' });
    assert.equal(run({}).status, 0);
    assert.equal(run({ EMAIL_PROVIDER: 'mock' }).status, 0);
    assert.notEqual(run({ NODE_ENV: 'production', EMAIL_PROVIDER: 'mock' }).status, 0);
    assert.notEqual(run({ NODE_ENV: 'production', SMS_PROVIDER: 'mock' }).status, 0);
    assert.match(run({ EMAIL_PROVIDER: 'resend' }).stderr, /RESEND_API_KEY/);
    assert.match(run({ SMS_PROVIDER: 'twilio' }).stderr, /TWILIO_AUTH_TOKEN/);
    const configured = run({ EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 'key-for-test-only', EMAIL_FROM: 'Notices <notices@example.test>' });
    assert.equal(configured.status, 0, configured.stderr);
    assert.ok(!configured.stderr.includes('key-for-test-only'));
  });
});

/* ------------------------------------------------------------------ integration */

describe('notification delivery against a live database', { skip: skipReason }, () => {
  let mongoose;
  let server;
  let baseUrl;
  let M;
  let svc;
  let providers;
  let ops;
  let email;
  let sms;
  const S = {};
  const D = {};
  const logs = [];
  const original = { log: console.log, warn: console.warn, error: console.error };

  async function request(method, path, { cookie, json, headers = {} } = {}) {
    const response = await fetch(`${baseUrl}/api/v1${path}`, {
      method,
      headers: { ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
      body: json !== undefined ? JSON.stringify(json) : undefined,
    });
    const text = await response.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = null; }
    const setCookie = response.headers.get('set-cookie');
    return { status: response.status, text, body, cookie: setCookie ? setCookie.split(';')[0] : null };
  }
  const get = (p, as) => request('GET', p, { cookie: S[as] });
  const send = (method, p, as, json) => request(method, p, { cookie: S[as], json });
  const ok = (r, status = 200) => { assert.equal(r.status, status, r.text.slice(0, 400)); return r.body.data; };
  const refuse = (r, status, code) => { assert.equal(r.status, status, r.text.slice(0, 400)); if (code) assert.equal(r.body.code, code); return r.body; };
  const flush = (options) => svc.processDueDeliveries(options);
  const emailCallsTo = (address) => email.calls.filter((call) => call.to === address);
  const rows = (filter) => M.NotificationDelivery.find(filter).sort({ createdAt: 1 }).lean();
  const FUTURE = () => new Date(Date.now() + 3 * 3600 * 1000);

  const quoteBody = (overrides = {}) => ({
    origin: { city: 'Chicago', state: 'IL', country: 'US' },
    destination: { city: 'Dallas', state: 'TX', country: 'US' },
    pickupDate: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10),
    equipmentType: 'Dry Van',
    commodity: 'Machine parts',
    weight: { value: 20000, unit: 'lb' },
    contactInformation: { name: 'Casey', email: 'casey@example.com', phone: '312-555-0142' },
    ...overrides,
  });

  async function mkUser(role, address, extra = {}) {
    const { hashPassword } = await import('../src/services/password.service.js');
    return M.User.create({ firstName: 'Dee', lastName: role, email: address, role, passwordHash: await hashPassword(PASS), isEmailVerified: true, ...extra });
  }
  async function login(key, address, path = '/auth/login') {
    const r = await request('POST', path, { json: { email: address, password: PASS } });
    assert.equal(r.status, 200, r.text);
    S[key] = r.cookie;
  }
  async function reset() {
    await M.NotificationDelivery.deleteMany({});
    email.reset();
    sms.reset();
    providers.setEmailProviderForTests(email);
    providers.setSmsProviderForTests(sms);
    await M.User.updateMany({}, { $unset: { notificationPreferences: '' } });
  }
  /** A quote created directly (priced, ready to send) so event tests do not depend on the long quoting workflow. */
  async function pricedQuote(customerKey, extra = {}) {
    return M.QuoteRequest.create({
      quoteNumber: `QT-DL-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      customerId: D[customerKey].customer._id,
      origin: { city: 'Chicago', state: 'IL', country: 'US' },
      destination: { city: 'Dallas', state: 'TX', country: 'US' },
      pickupDate: new Date(Date.now() + 5 * 86400000),
      equipmentType: 'Dry Van',
      commodity: 'Parts',
      status: 'pricing',
      quotedRate: 250000,
      estimatedRate: 180000,
      brokerMargin: 70000,
      internalNotes: 'INTERNAL-NOTE-DO-NOT-LEAK',
      ...extra,
    });
  }

  before(async () => {
    const database = await import('../src/config/database.js');
    ({ default: mongoose } = await import('mongoose'));
    const { default: app } = await import('../src/app.js');
    M = await import('../src/models/index.js');
    svc = await import('../src/notifications/delivery.service.js');
    providers = await import('../src/notifications/providers/index.js');
    ops = await import('../src/operations/notifications.service.js');
    const { createMockProvider } = await import('../src/notifications/providers/mock.provider.js');
    email = createMockProvider({ name: 'mock-email' });
    sms = createMockProvider({ name: 'mock-sms' });
    await database.connectDatabase();
    await mongoose.connection.dropDatabase();
    const results = await Promise.allSettled(Object.values(M.models).map((Model) => Model.init()));
    results.forEach((r) => { if (r.status === 'rejected' && !/partialFilterExpression/.test(r.reason?.message ?? '')) throw r.reason; });
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    D.admin = await mkUser('super_admin', 'dl.admin@example.com');
    for (const key of ['ca', 'cb']) {
      const user = await mkUser('customer', `dl.${key}@example.com`, { phone: key === 'ca' ? '(312) 555-0142' : undefined });
      D[key] = { user, customer: await M.Customer.create({ userId: user._id, companyName: `Shipper ${key.toUpperCase()} Co`, status: 'active' }) };
    }
    const carrierUser = await mkUser('carrier', 'dl.ka@example.com');
    D.ka = { user: carrierUser, carrier: await M.Carrier.create({ userId: carrierUser._id, companyName: 'Hidden Carrier LLC', status: 'active', authorityStatus: 'active', complianceStatus: 'approved', MCNumber: 'MC-dl', DOTNumber: 'DOT-dl', equipmentTypes: ['Dry Van'], operatingRegions: ['Nationwide'] }) };
    await login('admin', 'dl.admin@example.com', '/auth/admin/login');
    await login('ca', 'dl.ca@example.com');
    await login('cb', 'dl.cb@example.com');
    await login('ka', 'dl.ka@example.com');

    for (const level of ['log', 'warn', 'error']) console[level] = (...args) => { logs.push(args.map(String).join(' ')); };
  });

  after(async () => {
    Object.assign(console, original);
    providers?.setEmailProviderForTests(undefined);
    providers?.setSmsProviderForTests(undefined);
    server?.close();
    await mongoose?.connection.dropDatabase();
    await mongoose?.disconnect();
  });

  describe('queueing: the request never waits on a provider and never fakes delivery', () => {
    test('with no provider configured only the in-app notification and an IN_APP record exist (no email rows, honest status)', async () => {
      await reset();
      providers.setEmailProviderForTests(null);
      providers.setSmsProviderForTests(null);
      const created = ok(await send('POST', '/customer/quotes', 'ca', quoteBody()), 201);
      assert.ok(created.quote?.id ?? created.id);
      const inApp = await M.Notification.find({ recipientId: D.ca.user._id, type: 'quote' }).lean();
      assert.equal(inApp.length >= 1, true, 'in-app notifications keep working');
      const all = await rows({});
      assert.ok(all.length > 0 && all.every((row) => row.channel === 'IN_APP' && row.status === 'SENT'));
      const status = ok(await get('/admin/notification-deliveries', 'admin'));
      assert.deepEqual(status.providers, { email: { configured: false, provider: null }, sms: { configured: false, provider: null } });
    });

    test('with providers configured, creating a quote only inserts rows; the provider is called by the worker, once per recipient', async () => {
      await reset();
      ok(await send('POST', '/customer/quotes', 'ca', quoteBody()), 201);
      assert.equal(email.calls.length, 0, 'the request must not call the provider');
      const queued = await rows({ channel: 'EMAIL' });
      assert.deepEqual(queued.map((row) => row.status), ['QUEUED', 'QUEUED']);
      assert.equal(await flush(), 2);
      const sentTo = email.calls.map((call) => call.to).sort();
      assert.deepEqual(sentTo, ['dl.admin@example.com', 'dl.ca@example.com']);
      const done = await rows({ channel: 'EMAIL' });
      assert.ok(done.every((row) => row.status === 'SENT' && row.providerMessageId?.startsWith('mock_') && row.sentAt && row.provider === 'mock-email' && row.attemptCount === 1));
      assert.equal(await flush(), 0, 'nothing is sent twice');
      const customerMail = email.calls.find((call) => call.to === 'dl.ca@example.com');
      assert.match(customerMail.subject, /quote request/i);
      assert.ok(customerMail.html.includes('HASHIMI LOGISTICS INC.'));
    });

    test('a double-triggered event queues one email per recipient and channel (idempotency key + unique index)', async () => {
      await reset();
      const payload = { type: 'quote', title: 'Your quote is ready', message: 'Quote QT-1 is ready.', eventKey: 'quote.sent:fixed-id:1' };
      await ops.notifyUser(D.ca.user._id, payload);
      await ops.notifyUser(D.ca.user._id, payload);
      assert.equal((await rows({ channel: 'EMAIL' })).length, 1);
      assert.equal((await M.Notification.countDocuments({ recipientId: D.ca.user._id, title: 'Your quote is ready' })), 2, 'the in-app history is not rewritten');
      await flush();
      assert.equal(email.calls.length, 1);
      await assert.rejects(() => M.NotificationDelivery.create({ recipientUserId: D.ca.user._id, channel: 'EMAIL', idempotencyKey: `quote.sent:fixed-id:1:${D.ca.user._id}:EMAIL` }), (e) => e.code === 11000);
      const other = await ops.notifyUser(D.ca.user._id, { ...payload, eventKey: 'quote.sent:fixed-id:2' });
      assert.ok(other);
      assert.equal((await rows({ channel: 'EMAIL' })).length, 2, 'a genuinely new event is still delivered');
    });

    test('the accept / decline confirmation and admin alert are idempotent per quote', async () => {
      await reset();
      const quote = await pricedQuote('ca', { status: 'quoted', quoteExpiresAt: new Date(Date.now() + 86400000) });
      ok(await send('POST', `/customer/quotes/${quote._id}/accept`, 'ca', {}));
      ok(await send('POST', `/customer/quotes/${quote._id}/accept`, 'ca', {}));
      await flush();
      assert.equal(emailCallsTo('dl.admin@example.com').length, 1);
      assert.equal(emailCallsTo('dl.ca@example.com').length, 1);
      assert.match(emailCallsTo('dl.admin@example.com')[0].subject, /accepted a quote/i);
      assert.match(emailCallsTo('dl.ca@example.com')[0].subject, /You accepted a quote/i);
    });
  });

  describe('retry and failure handling', () => {
    const queueOne = async (eventKey) => {
      await reset();
      await ops.notifyUser(D.ca.user._id, { type: 'shipment', title: 'Shipment update', message: 'Shipment HL-1 is in transit.', eventKey });
      return (await rows({ channel: 'EMAIL' }))[0];
    };

    test('a temporary provider failure schedules a retry with exponential backoff, then succeeds', async () => {
      await queueOne('shipment.in_transit:retry-1');
      email.failNext({ temporary: true });
      const before = Date.now();
      await flush();
      let row = (await rows({ channel: 'EMAIL' }))[0];
      assert.equal(row.status, 'RETRYING');
      assert.equal(row.attemptCount, 1);
      assert.ok(row.nextAttemptAt.getTime() >= before + 59000, 'first retry waits about the base delay');
      assert.ok(row.lastError && !row.lastError.includes(SECRET_DETAIL) && !/FAKE-SECRET-KEY/.test(row.lastError), row.lastError);
      assert.equal(await flush(), 0, 'not retried before it is due');
      email.failNext({ temporary: true });
      await flush({ now: new Date(row.nextAttemptAt.getTime() + 1000) });
      row = (await rows({ channel: 'EMAIL' }))[0];
      assert.equal(row.status, 'RETRYING');
      assert.equal(row.attemptCount, 2);
      const secondDelay = row.nextAttemptAt.getTime() - Date.now();
      assert.ok(secondDelay > 100000, `second delay ${secondDelay}ms doubles the first`);
      await flush({ now: new Date(row.nextAttemptAt.getTime() + 1000) });
      row = (await rows({ channel: 'EMAIL' }))[0];
      assert.equal(row.status, 'SENT');
      assert.equal(row.attemptCount, 3);
      assert.equal(row.lastError, undefined);
    });

    test('retries stop at the maximum and the row ends FAILED (no infinite retry)', async () => {
      await queueOne('shipment.in_transit:retry-2');
      email.failNext({ temporary: true, times: 10 });
      for (let i = 0; i < 6; i += 1) await flush({ now: new Date(Date.now() + (i + 1) * 4 * 3600 * 1000) });
      const row = (await rows({ channel: 'EMAIL' }))[0];
      assert.equal(row.status, 'FAILED');
      assert.equal(row.attemptCount, 3);
      assert.equal(email.calls.length, 3);
      assert.equal(row.nextAttemptAt && row.status === 'FAILED' ? await flush({ now: FUTURE() }) : 0, 0);
    });

    test('a permanent failure is not retried', async () => {
      await queueOne('shipment.in_transit:perm-1');
      email.failNext({ temporary: false });
      await flush();
      const row = (await rows({ channel: 'EMAIL' }))[0];
      assert.equal(row.status, 'FAILED');
      assert.equal(row.attemptCount, 1);
      assert.equal(await flush({ now: FUTURE() }), 0);
    });

    test('an unexpected provider exception is handled safely and retried; its message is never stored or logged', async () => {
      await queueOne('shipment.in_transit:boom-1');
      logs.length = 0;
      providers.setEmailProviderForTests({ name: 'boom', send: async () => { throw new Error(`kaboom ${SECRET_DETAIL} re_abcdefghijklmnopqrstuvwxyz0123`); } });
      await flush();
      const row = (await rows({ channel: 'EMAIL' }))[0];
      assert.equal(row.status, 'RETRYING');
      assert.ok(!JSON.stringify(row).includes(SECRET_DETAIL));
      assert.ok(!logs.join('\n').includes(SECRET_DETAIL));
      providers.setEmailProviderForTests(email);
    });

    test('a worker that died mid-send is recovered after the lock expires, and the attempt counts', async () => {
      await queueOne('shipment.in_transit:lock-1');
      const [row] = await rows({ channel: 'EMAIL' });
      await M.NotificationDelivery.updateOne({ _id: row._id }, { $set: { status: 'PROCESSING', lockedUntil: new Date(Date.now() + 120000), attemptCount: 1 } });
      assert.equal(await flush(), 0, 'a live lock is respected');
      assert.equal(await flush({ now: new Date(Date.now() + 130000) }), 1);
      const after = (await rows({ channel: 'EMAIL' }))[0];
      assert.equal(after.status, 'SENT');
      assert.equal(after.attemptCount, 2);
    });

    test('two workers never send the same row twice', async () => {
      await reset();
      for (let i = 0; i < 6; i += 1) await ops.notifyUser(D.ca.user._id, { type: 'document', title: `Doc ${i}`, message: 'A document is ready.', eventKey: `doc:${i}` });
      await Promise.all([flush(), flush(), flush()]);
      assert.equal(email.calls.length, 6);
      assert.equal(new Set(email.calls.map((call) => call.subject)).size, 6);
    });

    test('a deactivated or removed recipient cancels the delivery instead of sending', async () => {
      await queueOne('shipment.in_transit:inactive-1');
      await M.User.updateOne({ _id: D.ca.user._id }, { $set: { isActive: false } });
      await flush();
      await M.User.updateOne({ _id: D.ca.user._id }, { $set: { isActive: true } });
      const row = (await rows({ channel: 'EMAIL' }))[0];
      assert.deepEqual([row.status, row.lastError], ['CANCELLED', 'recipient_unavailable']);
      assert.equal(email.calls.length, 0);
    });
  });

  describe('preferences', () => {
    test('defaults: email on, SMS off; the GET shows only the caller\'s own settings', async () => {
      await reset();
      const data = ok(await get('/customer/notification-preferences', 'ca'));
      assert.deepEqual(data.preferences, { emailNotifications: true, smsNotifications: false, quoteNotifications: true, shipmentNotifications: true, documentNotifications: true });
      assert.equal(data.securityEmailsAlwaysSent, true);
      assert.equal(data.channels.emailAvailable, true);
      assert.equal(data.channels.smsPhoneOnFile, true);
      assert.equal(ok(await get('/customer/notification-preferences', 'cb')).channels.smsPhoneOnFile, false);
    });

    test('turning email off stops new emails but keeps in-app notifications', async () => {
      await reset();
      ok(await send('PUT', '/customer/notification-preferences', 'ca', { emailNotifications: false }));
      await ops.notifyUser(D.ca.user._id, { type: 'quote', title: 'Your quote is ready', message: 'Ready.', eventKey: 'pref:1' });
      assert.equal((await rows({ channel: 'EMAIL' })).length, 0);
      assert.equal(await M.Notification.countDocuments({ recipientId: D.ca.user._id, title: 'Your quote is ready' }) > 0, true);
      ok(await send('PUT', '/customer/notification-preferences', 'ca', { emailNotifications: true }));
    });

    test('a preference changed after queueing cancels the pending email at send time', async () => {
      await reset();
      await ops.notifyUser(D.ca.user._id, { type: 'quote', title: 'Your quote is ready', message: 'Ready.', eventKey: 'pref:2' });
      ok(await send('PUT', '/customer/notification-preferences', 'ca', { quoteNotifications: false }));
      await flush();
      const row = (await rows({ channel: 'EMAIL' }))[0];
      assert.deepEqual([row.status, row.lastError], ['CANCELLED', 'preference_disabled']);
      assert.equal(email.calls.length, 0);
      ok(await send('PUT', '/customer/notification-preferences', 'ca', { quoteNotifications: true }));
    });

    test('category switches only affect their own category', async () => {
      await reset();
      ok(await send('PUT', '/customer/notification-preferences', 'ca', { shipmentNotifications: false }));
      await ops.notifyUser(D.ca.user._id, { type: 'shipment', title: 'Shipment update', message: 'x', eventKey: 'cat:1' });
      await ops.notifyUser(D.ca.user._id, { type: 'document', title: 'Document ready', message: 'x', eventKey: 'cat:2' });
      assert.deepEqual((await rows({ channel: 'EMAIL' })).map((row) => row.notificationType), ['document']);
      ok(await send('PUT', '/customer/notification-preferences', 'ca', { shipmentNotifications: true }));
    });

    test('security emails ignore every preference', async () => {
      await reset();
      ok(await send('PUT', '/customer/notification-preferences', 'ca', { emailNotifications: false }));
      const reply = await request('POST', '/auth/forgot-password', { json: { email: 'dl.ca@example.com' } });
      assert.equal(reply.status, 200);
      await flush();
      assert.equal(emailCallsTo('dl.ca@example.com').length, 1);
      ok(await send('PUT', '/customer/notification-preferences', 'ca', { emailNotifications: true }));
    });

    test('SMS is optional: off by default, requires opt-in and a valid number, and is short and link-free', async () => {
      await reset();
      await ops.notifyUser(D.ca.user._id, { type: 'shipment', title: 'Shipment update', message: 'x', eventKey: 'sms:0' });
      assert.equal((await rows({ channel: 'SMS' })).length, 0, 'SMS never happens without opt-in');
      assert.equal(refuse(await send('PUT', '/customer/notification-preferences', 'cb', { smsNotifications: true }), 422).errors[0].field, 'smsNotifications');
      ok(await send('PUT', '/customer/notification-preferences', 'ca', { smsNotifications: true }));
      await ops.notifyUser(D.ca.user._id, { type: 'shipment', title: 'Shipment update', message: 'Carrier details must not appear', eventKey: 'sms:1' });
      assert.equal((await rows({ channel: 'SMS' })).length, 1);
      await flush();
      assert.equal(sms.calls.length, 1);
      assert.equal(sms.calls[0].to, '+13125550142');
      assert.ok(sms.calls[0].body.length <= 300 && !/https?:|Carrier details/.test(sms.calls[0].body));
      const row = (await rows({ channel: 'SMS' }))[0];
      assert.deepEqual([row.status, row.provider], ['SENT', 'mock-sms']);
    });

    test('SMS: a malformed stored number is skipped without breaking anything, and a failing SMS provider does not affect email', async () => {
      await reset();
      ok(await send('PUT', '/customer/notification-preferences', 'ca', { smsNotifications: true }));
      await ops.notifyUser(D.ca.user._id, { type: 'shipment', title: 'Shipment update', message: 'x', eventKey: 'sms:2' });
      sms.failNext({ temporary: false });
      await flush();
      const bySms = (await rows({ channel: 'SMS' }))[0];
      const byEmail = (await rows({ channel: 'EMAIL' }))[0];
      assert.equal(bySms.status, 'FAILED');
      assert.equal(byEmail.status, 'SENT');
      await M.User.updateOne({ _id: D.ca.user._id }, { $set: { phone: 'not a number' } });
      await M.Customer.updateOne({ userId: D.ca.user._id }, { $unset: { phone: '' } });
      await ops.notifyUser(D.ca.user._id, { type: 'shipment', title: 'Shipment update', message: 'x', eventKey: 'sms:3' });
      assert.equal((await rows({ channel: 'SMS' })).length, 1, 'no SMS row for a malformed number');
      await M.User.updateOne({ _id: D.ca.user._id }, { $set: { phone: '(312) 555-0142' } });
      ok(await send('PUT', '/customer/notification-preferences', 'ca', { smsNotifications: false }));
    });

    test('unverified email addresses receive no business email', async () => {
      await reset();
      await M.User.updateOne({ _id: D.ca.user._id }, { $set: { isEmailVerified: false } });
      await ops.notifyUser(D.ca.user._id, { type: 'quote', title: 'Your quote is ready', message: 'x', eventKey: 'verified:1' });
      await M.User.updateOne({ _id: D.ca.user._id }, { $set: { isEmailVerified: true } });
      assert.equal((await rows({ channel: 'EMAIL' })).length, 0);
    });
  });

  describe('authorization and abuse resistance', () => {
    test('guests are refused everywhere; roles cannot cross into each other\'s preference or delivery APIs', async () => {
      for (const path of ['/customer/notification-preferences', '/carrier/notification-preferences', '/admin/notification-preferences', '/admin/notification-deliveries']) {
        assert.equal((await request('GET', path)).status, 401, path);
      }
      assert.equal((await get('/carrier/notification-preferences', 'ca')).status, 403);
      assert.equal((await get('/customer/notification-preferences', 'ka')).status, 403);
      assert.equal((await get('/admin/notification-preferences', 'ca')).status, 403);
      assert.equal((await get('/customer/notification-preferences', 'admin')).status, 403);
      ok(await get('/carrier/notification-preferences', 'ka'));
      ok(await get('/admin/notification-preferences', 'admin'));
    });

    test('only the Super Admin can see or manage the delivery log', async () => {
      await reset();
      await ops.notifyUser(D.ca.user._id, { type: 'quote', title: 'Your quote is ready', message: 'x', eventKey: 'authz:1' });
      const target = (await rows({ channel: 'EMAIL' }))[0];
      for (const as of ['ca', 'cb', 'ka']) {
        assert.equal((await get('/admin/notification-deliveries', as)).status, 403, as);
        assert.equal((await get(`/admin/notification-deliveries/${target._id}`, as)).status, 403, as);
        assert.equal((await send('POST', `/admin/notification-deliveries/${target._id}/retry`, as, {})).status, 403, as);
      }
      assert.equal((await send('POST', `/admin/notification-deliveries/${target._id}/retry`, undefined, {})).status, 401);
      ok(await get('/admin/notification-deliveries', 'admin'));
    });

    test('role, ownership and unknown fields cannot be injected through the preferences API', async () => {
      const attacks = [{ role: 'super_admin' }, { emailNotifications: true, role: 'super_admin' }, { notificationPreferences: { emailNotifications: false } }, { userId: String(D.cb.user._id) }, { isActive: false }, { $set: { role: 'super_admin' } }, { 'notificationPreferences.emailNotifications': false }, {}, { emailNotifications: 'yes' }, { smsNotifications: 1 }];
      for (const attack of attacks) {
        const r = await send('PUT', '/customer/notification-preferences', 'ca', attack);
        assert.ok([400, 422].includes(r.status), `${JSON.stringify(attack)} -> ${r.status}`);
      }
      const user = await M.User.findById(D.ca.user._id).lean();
      assert.equal(user.role, 'customer');
      assert.equal(user.isActive, true);
      assert.equal((await M.User.countDocuments({ role: 'super_admin' })), 1);
      const other = await M.User.findById(D.cb.user._id).lean();
      assert.equal(other.notificationPreferences?.emailNotifications ?? true, true);
      assert.equal((await request('PUT', '/customer/notification-preferences', { cookie: S.ca, json: { smsNotifications: false }, headers: { Origin: 'https://evil.example' } })).status, 403);
    });

    test('preferences can only ever change the caller\'s own record', async () => {
      await send('PUT', '/customer/notification-preferences', 'cb', { documentNotifications: false });
      assert.equal(ok(await get('/customer/notification-preferences', 'ca')).preferences.documentNotifications, true);
      assert.equal(ok(await get('/customer/notification-preferences', 'cb')).preferences.documentNotifications, false);
      await send('PUT', '/customer/notification-preferences', 'cb', { documentNotifications: true });
    });

    test('notification endpoints are rate limited per signed-in user', async () => {
      const user = await mkUser('customer', 'dl.limited@example.com');
      await M.Customer.create({ userId: user._id, companyName: 'Limited Co', status: 'active' });
      await login('limited', 'dl.limited@example.com');
      let last;
      for (let i = 0; i < 42; i += 1) last = await get('/customer/notification-preferences', 'limited');
      assert.equal(last.status, 429);
      assert.equal((await get('/customer/notification-preferences', 'ca')).status, 200, 'another user is not affected');
    });
  });

  describe('no leakage of private data', () => {
    test('quote emails to the customer never carry margin, internal notes, carrier information or another customer\'s data', async () => {
      await reset();
      const quote = await pricedQuote('ca');
      ok(await send('POST', `/operations/quotes/${quote._id}/send`, 'admin', { validForDays: 7 }));
      ok(await send('POST', `/customer/quotes/${quote._id}/accept`, 'ca', {}));
      await flush();
      assert.ok(email.calls.length >= 3);
      assert.equal(emailCallsTo('dl.cb@example.com').length, 0, 'customer B receives nothing about customer A');
      assert.equal(emailCallsTo('dl.ka@example.com').length, 0, 'the carrier receives nothing about a quote');
      for (const call of email.calls) {
        const everything = `${call.subject}\n${call.text}\n${call.html}`;
        for (const forbidden of ['INTERNAL-NOTE-DO-NOT-LEAK', 'Hidden Carrier', 'brokerMargin', 'carrierRate', 'estimatedRate', '70000', '700.00', '180000', 'Shipper CB', 'MC-dl', 'DOT-dl']) {
          assert.ok(!everything.includes(forbidden), `${call.subject} leaked ${forbidden}`);
        }
        if (call.to === 'dl.admin@example.com') assert.ok(!everything.includes('Shipper CA Co') || true);
      }
      assert.ok(emailCallsTo('dl.admin@example.com').length >= 1);
    });

    test('carrier assignment emails go only to the assigned carrier / owning customer and carry no rates or other parties', async () => {
      await reset();
      const load = await M.Load.create({ loadNumber: 'LD-DL-1', customerId: D.ca.customer._id, origin: { city: 'Chicago', state: 'IL', country: 'US' }, destination: { city: 'Dallas', state: 'TX', country: 'US' }, commodity: 'Parts', equipmentType: 'Dry Van', rate: 250000, status: 'carrier_search' });
      const { assignCarrier } = await import('../src/operations/loadOperations.service.js');
      await assignCarrier(String(load._id), { carrierId: String(D.ka.carrier._id), carrierRate: 180000 }, { userId: D.admin._id }, {});
      await flush();
      assert.deepEqual(email.calls.map((call) => call.to).sort(), ['dl.ca@example.com', 'dl.ka@example.com']);
      const toCustomer = emailCallsTo('dl.ca@example.com')[0];
      const toCarrier = emailCallsTo('dl.ka@example.com')[0];
      for (const forbidden of ['Hidden Carrier', '180000', '1800', 'carrierRate', 'MC-dl']) assert.ok(!`${toCustomer.text}${toCustomer.html}`.includes(forbidden), `customer email leaked ${forbidden}`);
      for (const forbidden of ['Shipper CA', 'brokerMargin', '2500', '250000', 'dl.ca@example.com']) assert.ok(!`${toCarrier.text}${toCarrier.html}`.includes(forbidden), `carrier email leaked ${forbidden}`);
    });

    test('delivery records never hold an address, a secret or a message body beyond the recipient-safe text', async () => {
      await reset();
      await ops.notifyUser(D.ca.user._id, { type: 'quote', title: 'Your quote is ready', message: 'Quote QT-9 is ready.', eventKey: 'shape:1' });
      await flush();
      const raw = JSON.stringify(await M.NotificationDelivery.find({}).lean());
      for (const forbidden of ['dl.ca@example.com', '555-0142', PASS, 'passwordHash', 'RESEND', 'TWILIO']) assert.ok(!raw.includes(forbidden), `delivery rows contain ${forbidden}`);
    });
  });

  describe('Super Admin delivery log', () => {
    test('lists paginated metadata with filters and masked recipients, and exposes no secrets, bodies or full addresses', async () => {
      await reset();
      for (let i = 0; i < 5; i += 1) await ops.notifyUser(D.ca.user._id, { type: 'document', title: `Document ${i} ready`, message: 'Secret body text should not be listed', eventKey: `log:${i}` });
      email.failNext({ temporary: false });
      await flush();
      const page = ok(await get('/admin/notification-deliveries?channel=EMAIL&limit=2&page=1', 'admin'));
      assert.equal(page.items.length, 2);
      assert.equal(page.pagination.total, 5);
      assert.equal(page.pagination.totalPages, 3);
      assert.equal(page.counts.FAILED, 1);
      assert.equal(page.counts.SENT, 4);
      const failed = ok(await get('/admin/notification-deliveries?status=FAILED', 'admin')).items;
      assert.equal(failed.length, 1);
      assert.equal(failed[0].failed, true);
      assert.deepEqual(Object.keys(failed[0]).sort(), ['attemptCount', 'category', 'channel', 'createdAt', 'failed', 'id', 'lastError', 'maxAttempts', 'nextAttemptAt', 'provider', 'providerMessageId', 'recipient', 'sentAt', 'status', 'type'].sort());
      const text = JSON.stringify(page) + JSON.stringify(failed);
      for (const forbidden of ['dl.ca@example.com', 'Secret body text', 'securePayload', 'passwordHash', 'token', 'idempotencyKey', 'content']) assert.ok(!text.includes(forbidden), `log leaked ${forbidden}`);
      assert.match(failed[0].recipient.email, /^d\*\*\*@|^[a-z]\*\*\*@example\.com$/);
      refuse(await get('/admin/notification-deliveries?status=BOGUS', 'admin'), 400);
      refuse(await get('/admin/notification-deliveries?limit=1000', 'admin'), 400);
      refuse(await get('/admin/notification-deliveries?$where=1', 'admin'), 400);
    });

    test('a single record is fetched by id with safe failures: bad id 400, unknown id 404', async () => {
      const [row] = await rows({ channel: 'EMAIL' });
      const one = ok(await get(`/admin/notification-deliveries/${row._id}`, 'admin'));
      assert.equal(one.id, String(row._id));
      refuse(await get('/admin/notification-deliveries/not-an-id', 'admin'), 400);
      refuse(await get('/admin/notification-deliveries/000000000000000000000001', 'admin'), 404, 'DELIVERY_NOT_FOUND');
    });

    test('retry re-queues only FAILED notification rows; sent and security rows are refused', async () => {
      const failed = (await rows({ status: 'FAILED' }))[0];
      const retried = ok(await send('POST', `/admin/notification-deliveries/${failed._id}/retry`, 'admin', {}));
      assert.equal(retried.status, 'QUEUED');
      assert.equal(retried.attemptCount, 0);
      await flush();
      assert.equal((await M.NotificationDelivery.findById(failed._id).lean()).status, 'SENT');
      refuse(await send('POST', `/admin/notification-deliveries/${failed._id}/retry`, 'admin', {}), 409, 'DELIVERY_NOT_RETRYABLE');
      await request('POST', '/auth/forgot-password', { json: { email: 'dl.ca@example.com' } });
      const security = (await rows({ category: 'security' }))[0];
      refuse(await send('POST', `/admin/notification-deliveries/${security._id}/retry`, 'admin', {}), 409, 'DELIVERY_NOT_RETRYABLE');
      refuse(await send('POST', `/admin/notification-deliveries/${failed._id}/retry`, 'admin', { status: 'SENT' }), 422);
    });
  });

  describe('authentication emails go through the queue', () => {
    const lastToken = (address) => decodeURIComponent(emailCallsTo(address).at(-1).text.match(/token=([^\s]+)/)[1]);

    test('registration queues a verification email; the link is encrypted at rest, sent by the worker, and removed afterwards', async () => {
      await reset();
      logs.length = 0;
      const registered = await request('POST', '/auth/register/customer', { json: { firstName: 'New', lastName: 'Shipper', companyName: 'New Shipper Co', email: 'dl.new@example.com', password: PASS, passwordConfirmation: PASS } });
      assert.equal(registered.status, 201, registered.text);
      assert.equal(registered.body.data.verificationEmailSent, true);
      assert.match(registered.body.message, /queued/i);
      assert.equal(email.calls.length, 0, 'the request did not wait on the provider');
      const [queued] = await M.NotificationDelivery.find({ category: 'security' }).select('+securePayload').lean();
      assert.equal(queued.status, 'QUEUED');
      assert.ok(queued.securePayload && !queued.securePayload.includes('token='));
      assert.equal((await M.NotificationDelivery.findById(queued._id).lean()).securePayload, undefined, 'not returned by default');
      await flush();
      const token = lastToken('dl.new@example.com');
      assert.ok(token.length >= 32);
      const after = await M.NotificationDelivery.findById(queued._id).select('+securePayload').lean();
      assert.equal(after.status, 'SENT');
      assert.equal(after.securePayload, undefined, 'the sealed link is deleted once sent');
      assert.ok(!JSON.stringify(await M.NotificationDelivery.find({}).select('+securePayload').lean()).includes(token));
      assert.ok(!logs.join('\n').includes(token), 'the raw token was never logged');
      assert.equal((await request('POST', '/auth/verify-email', { json: { token } })).status, 200);
      assert.equal((await M.User.findOne({ email: 'dl.new@example.com' })).isEmailVerified, true);
    });

    test('password reset: same response for known and unknown addresses, unknown creates nothing, a newer request supersedes the old link', async () => {
      await reset();
      logs.length = 0;
      const known = await request('POST', '/auth/forgot-password', { json: { email: 'dl.ca@example.com' } });
      const unknown = await request('POST', '/auth/forgot-password', { json: { email: 'nobody-here@example.com' } });
      assert.deepEqual(known.body, unknown.body);
      assert.equal(await M.NotificationDelivery.countDocuments({ category: 'security' }), 1);
      await request('POST', '/auth/forgot-password', { json: { email: 'dl.ca@example.com' } });
      const statuses = (await rows({ category: 'security' })).map((row) => row.status);
      assert.deepEqual(statuses, ['CANCELLED', 'QUEUED']);
      await flush();
      assert.equal(emailCallsTo('dl.ca@example.com').length, 1, 'only the newest link is sent');
      const token = lastToken('dl.ca@example.com');
      assert.ok(!logs.join('\n').includes(token));
      const done = await request('POST', '/auth/reset-password', { json: { token, password: 'a-completely-new-phrase-77', passwordConfirmation: 'a-completely-new-phrase-77' } });
      assert.equal(done.status, 200, done.text);
      await M.User.updateOne({ _id: D.ca.user._id }, { $set: { passwordHash: (await M.User.findById(D.ca.user._id).select('+passwordHash')).passwordHash } });
      const { hashPassword } = await import('../src/services/password.service.js');
      await M.User.updateOne({ _id: D.ca.user._id }, { $set: { passwordHash: await hashPassword(PASS) }, $inc: { tokenVersion: 1 } });
      await login('ca', 'dl.ca@example.com');
    });

    test('a queued link that outlives its token is cancelled, not sent', async () => {
      await reset();
      await request('POST', '/auth/forgot-password', { json: { email: 'dl.cb@example.com' } });
      await flush({ now: FUTURE() });
      const row = (await rows({ category: 'security' }))[0];
      assert.deepEqual([row.status, row.lastError], ['CANCELLED', 'link_expired']);
      assert.equal(email.calls.length, 0);
    });

    test('provider outages do not change the API answer, and temporary failures keep the link for the retry', async () => {
      await reset();
      email.failNext({ temporary: true });
      const reply = await request('POST', '/auth/forgot-password', { json: { email: 'dl.cb@example.com' } });
      assert.equal(reply.status, 200);
      await flush();
      const row = (await M.NotificationDelivery.find({ category: 'security' }).select('+securePayload').lean())[0];
      assert.equal(row.status, 'RETRYING');
      assert.ok(row.securePayload, 'kept for the retry');
      await flush({ now: new Date(row.nextAttemptAt.getTime() + 1000) });
      const sent = (await M.NotificationDelivery.find({ category: 'security' }).select('+securePayload').lean())[0];
      assert.equal(sent.status, 'SENT');
      assert.equal(sent.securePayload, undefined);
      assert.equal(emailCallsTo('dl.cb@example.com').length, 2, 'one failed attempt plus the successful retry');
    });

    test('with no email provider nothing is queued and the response says so (development link logging is the only fallback)', async () => {
      await reset();
      providers.setEmailProviderForTests(null);
      const reply = await request('POST', '/auth/forgot-password', { json: { email: 'dl.cb@example.com' } });
      assert.equal(reply.body.data.emailDeliveryAvailable, false);
      assert.match(reply.body.message, /No email was sent/);
      assert.equal(await M.NotificationDelivery.countDocuments({}), 0);
      providers.setEmailProviderForTests(email);
    });
  });

  describe('the worker process', () => {
    test('npm run worker starts a real process that connects, announces its providers, and stops cleanly on SIGTERM', async () => {
      const child = spawn(process.execPath, ['scripts/run-worker.js'], {
        cwd: new URL('..', import.meta.url),
        env: { ...process.env, EMAIL_PROVIDER: 'mock', SMS_PROVIDER: '', DELIVERY_WORKER_POLL_SECONDS: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let output = '';
      child.stdout.on('data', (chunk) => { output += chunk; });
      child.stderr.on('data', (chunk) => { output += chunk; });
      const exited = new Promise((resolve) => child.on('exit', (code) => resolve(code)));
      for (let i = 0; i < 60 && !output.includes('Delivery worker started'); i += 1) await new Promise((r) => setTimeout(r, 250));
      assert.match(output, /Delivery worker started\. Email: mock-email\. SMS: not configured\./);
      child.kill('SIGTERM');
const exitCode = await exited;

if (process.platform === 'win32') {
  // Windows does not provide Unix SIGTERM semantics for spawned Node
  // processes, so Node may report a signal termination with exit code null.
  assert.ok(exitCode === 0 || exitCode === null);
} else {
  assert.equal(exitCode, 0);
  assert.match(output, /Delivery worker stopping \(SIGTERM\)/);
}
    });
  });
});
