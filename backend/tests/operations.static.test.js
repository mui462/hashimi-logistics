/**
 * Phase 7 brokerage-operations unit tests that need no database: state machines, pricing, timezone handling,
 * carrier eligibility rules, validators, operator rejection and structural guarantees about the routes.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { describe, test } from 'node:test';

Object.assign(process.env, {
  NODE_ENV: 'development',
  MONGO_URI: 'mongodb://127.0.0.1:27017/static_test',
  JWT_SECRET: 'static-test-secret-static-test-secret-1234567',
  CLIENT_URL: 'http://localhost:5173',
});

const { quoteMachine, quoteOperationsStatus, QUOTE_RATE_VISIBLE_STATUSES } = await import('../src/operations/quoteStatus.service.js');
const { loadMachine, loadOperationsStatus } = await import('../src/operations/loadStatus.service.js');
const { shipmentMachine, shipmentOperationsStatus } = await import('../src/operations/shipmentStatus.service.js');
const { buildPricing, calculateMargin } = await import('../src/operations/pricing.service.js');
const { zonedLocalToUtc, formatInZone, isValidTimeZone, isLocalDateTime } = await import('../src/utils/timezone.js');
const { evaluateCarrierForLoad } = await import('../src/operations/carrierEligibility.service.js');
const { regionCoverage } = await import('../src/operations/geo.js');
const validators = await import('../src/operations/operations.validator.js');
const { rejectOperators } = await import('../src/middleware/rejectOperators.js');
const { default: operationsRoutes } = await import('../src/operations/operations.routes.js');
const { QUOTE_STATUSES, LOAD_STATUSES, SHIPMENT_STATUSES } = await import('../src/models/enums.js');

const throwsCode = (fn, code) => assert.throws(fn, (error) => error.code === code, `expected ${code}`);

describe('state machines', () => {
  test('quote lifecycle follows the brief and nothing else', () => {
    const path = ['new', 'reviewing', 'pricing', 'quoted', 'customer_accepted', 'converted_to_load'];
    for (let i = 0; i < path.length - 1; i += 1) assert.ok(quoteMachine.canTransition(path[i], path[i + 1]), `${path[i]} -> ${path[i + 1]}`);
    for (const to of ['customer_accepted', 'declined', 'expired', 'cancelled']) assert.ok(quoteMachine.canTransition('quoted', to), to);
    assert.equal(quoteMachine.canTransition('new', 'quoted'), false, 'cannot skip review and pricing');
    assert.equal(quoteMachine.canTransition('reviewing', 'quoted'), false);
    assert.equal(quoteMachine.canTransition('new', 'customer_accepted'), false);
    assert.equal(quoteMachine.canTransition('quoted', 'converted_to_load'), false, 'acceptance comes first');
    for (const terminal of ['converted_to_load', 'declined', 'expired', 'cancelled']) assert.deepEqual(quoteMachine.nextStatuses(terminal), []);
  });

  test('every defined quote, load and shipment status is covered by its machine', () => {
    for (const status of QUOTE_STATUSES) assert.ok(quoteMachine.statuses.includes(status), `quote ${status}`);
    for (const status of LOAD_STATUSES) assert.ok(loadMachine.statuses.includes(status), `load ${status}`);
    for (const status of SHIPMENT_STATUSES) assert.ok(shipmentMachine.statuses.includes(status), `shipment ${status}`);
  });

  test('load lifecycle: forward only, cancellable only before pickup', () => {
    const forward = ['draft', 'open', 'carrier_search', 'assigned', 'dispatched', 'picked_up', 'in_transit', 'delivered', 'completed'];
    assert.ok(loadMachine.canTransition('draft', 'open'));
    assert.ok(loadMachine.canTransition('open', 'carrier_search'));
    assert.ok(loadMachine.canTransition('carrier_search', 'assigned'));
    assert.ok(loadMachine.canTransition('assigned', 'dispatched'));
    assert.ok(loadMachine.canTransition('dispatched', 'picked_up'));
    assert.ok(loadMachine.canTransition('picked_up', 'in_transit'));
    assert.ok(loadMachine.canTransition('in_transit', 'delivered'));
    assert.ok(loadMachine.canTransition('delivered', 'completed'));
    assert.equal(loadMachine.canTransition('draft', 'assigned'), false, 'no assignment before opening');
    assert.equal(loadMachine.canTransition('open', 'dispatched'), false);
    assert.equal(loadMachine.canTransition('in_transit', 'cancelled'), false);
    assert.equal(loadMachine.canTransition('picked_up', 'cancelled'), false);
    for (const status of ['draft', 'open', 'carrier_search', 'assigned', 'dispatched']) assert.ok(loadMachine.canTransition(status, 'cancelled'), status);
    for (const terminal of ['completed', 'cancelled']) assert.deepEqual(loadMachine.nextStatuses(terminal), []);
    assert.equal(forward.length, 9);
  });

  test('shipment lifecycle and exception edges', () => {
    const path = ['booked', 'dispatched', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'completed'];
    for (let i = 0; i < path.length - 1; i += 1) assert.ok(shipmentMachine.canTransition(path[i], path[i + 1]), `${path[i]} -> ${path[i + 1]}`);
    assert.equal(shipmentMachine.canTransition('booked', 'picked_up'), false);
    assert.equal(shipmentMachine.canTransition('dispatched', 'delivered'), false);
    assert.equal(shipmentMachine.canTransition('delivered', 'in_transit'), false, 'no going back');
    assert.equal(shipmentMachine.canTransition('delivered', 'exception'), false);
    assert.equal(shipmentMachine.canTransition('exception', 'exception'), false);
    assert.ok(shipmentMachine.canTransition('in_transit', 'exception'));
    assert.ok(shipmentMachine.canTransition('exception', 'in_transit'));
    assert.deepEqual(shipmentMachine.nextStatuses('completed'), []);
    assert.deepEqual(shipmentMachine.nextStatuses('cancelled'), []);
  });

  test('an invalid transition is a 409 INVALID_STATUS_TRANSITION with the allowed next statuses', () => {
    throwsCode(() => quoteMachine.assertTransition('new', 'quoted'), 'INVALID_STATUS_TRANSITION');
    try {
      loadMachine.assertTransition('draft', 'delivered');
      assert.fail('should have thrown');
    } catch (error) {
      assert.equal(error.statusCode, 409);
      assert.match(error.errors[0].message, /open, cancelled/);
    }
    assert.doesNotThrow(() => shipmentMachine.assertTransition('booked', 'dispatched'));
  });

  test('operations names map onto stored statuses', () => {
    assert.equal(quoteOperationsStatus('new'), 'submitted');
    assert.equal(quoteOperationsStatus('reviewing'), 'under_review');
    assert.equal(quoteOperationsStatus('declined'), 'customer_declined');
    assert.equal(loadOperationsStatus('assigned'), 'carrier_assigned');
    assert.equal(shipmentOperationsStatus('booked'), 'scheduled');
    assert.equal(loadOperationsStatus('open'), 'open');
  });

  test('the customer sees a price only once the quote has been sent', () => {
    for (const hidden of ['new', 'reviewing', 'pricing', 'cancelled']) assert.equal(QUOTE_RATE_VISIBLE_STATUSES.includes(hidden), false, hidden);
    for (const visible of ['quoted', 'customer_accepted', 'converted_to_load', 'declined', 'expired']) assert.ok(QUOTE_RATE_VISIBLE_STATUSES.includes(visible), visible);
  });
});

describe('pricing', () => {
  test('margin is customer rate minus carrier rate, in integer cents', () => {
    assert.deepEqual(buildPricing({ customerRate: 300000, carrierRate: 240000 }), { customerRate: 300000, carrierRate: 240000, brokerMargin: 60000, marginPercent: 20, currency: 'USD' });
    assert.equal(calculateMargin(100001, 33333).brokerMargin, 66668);
    assert.equal(buildPricing({ customerRate: 100000 }).brokerMargin, null, 'no carrier cost yet, so no margin');
  });

  test('floats, strings, zero, negatives and unsafe integers are refused', () => {
    for (const bad of [100.5, '1000', 0, -5, Number.MAX_SAFE_INTEGER + 2, NaN, null === undefined]) {
      assert.throws(() => buildPricing({ customerRate: bad, carrierRate: 100 }), (error) => error.statusCode === 422, String(bad));
    }
    throwsCode(() => buildPricing({ customerRate: 100, carrierRate: 5, currency: 'EUR' }), undefined);
  });

  test('selling at a loss needs an explicit confirmation', () => {
    throwsCode(() => buildPricing({ customerRate: 100000, carrierRate: 120000 }), 'NEGATIVE_MARGIN');
    const allowed = buildPricing({ customerRate: 100000, carrierRate: 120000, allowNegativeMargin: true });
    assert.equal(allowed.brokerMargin, -20000);
  });

  test('no validator accepts a margin or a client-set status/owner', () => {
    const forbidden = ['brokerMargin', 'status', 'customerId', 'quotedRate', 'estimatedRate', 'rate', 'quoteId', 'assignedBy', 'role'];
    for (const [name, schema] of Object.entries(validators)) {
      const shape = schema?.shape?.body?.shape ?? schema?.shape?.body?._def?.innerType?.shape;
      if (!shape) continue;
      for (const key of forbidden) assert.equal(key in shape, false, `${name} must not accept "${key}"`);
    }
  });
});

describe('timezones', () => {
  test('wall-clock times convert using the supplied IANA zone, DST included', () => {
    assert.equal(zonedLocalToUtc('2026-12-02T08:00', 'America/Chicago').toISOString(), '2026-12-02T14:00:00.000Z'); // CST, UTC-6
    assert.equal(zonedLocalToUtc('2026-07-02T08:00', 'America/Chicago').toISOString(), '2026-07-02T13:00:00.000Z'); // CDT, UTC-5
    assert.equal(zonedLocalToUtc('2026-12-02T08:00', 'America/Toronto').toISOString(), '2026-12-02T13:00:00.000Z');
    assert.equal(zonedLocalToUtc('2026-12-02T08:00', 'America/Monterrey').toISOString(), '2026-12-02T14:00:00.000Z');
    assert.equal(zonedLocalToUtc('2026-12-02T08:00', 'Asia/Karachi').toISOString(), '2026-12-02T03:00:00.000Z'); // UTC+5, no DST
    assert.equal(zonedLocalToUtc('2026-12-02T08:00', 'UTC').toISOString(), '2026-12-02T08:00:00.000Z');
  });

  test('the same wall-clock time is a different instant in different zones (nothing is assumed)', () => {
    const chicago = zonedLocalToUtc('2026-12-02T09:00', 'America/Chicago').getTime();
    const karachi = zonedLocalToUtc('2026-12-02T09:00', 'Asia/Karachi').getTime();
    assert.equal((karachi - chicago) / 3600000, -11);
  });

  test('impossible dates and unknown zones are refused', () => {
    assert.equal(zonedLocalToUtc('2026-02-30T10:00', 'America/Chicago'), null);
    assert.equal(zonedLocalToUtc('2026-13-01T10:00', 'America/Chicago'), null);
    assert.equal(zonedLocalToUtc('2026-12-02T25:00', 'America/Chicago'), null);
    assert.equal(zonedLocalToUtc('2026-12-02T08:00', 'Mars/Phobos'), null);
    assert.equal(zonedLocalToUtc('2026-12-02 08:00', 'America/Chicago'), null);
    assert.equal(isValidTimeZone('America/Chicago'), true);
    for (const bad of ['Mars/Phobos', '', 'chicago', 'PKT', "America/Chicago'; drop", 42, null]) assert.equal(isValidTimeZone(bad), false, String(bad));
  });

  test('a time skipped by the spring DST jump resolves forward instead of failing', () => {
    assert.equal(zonedLocalToUtc('2026-03-08T02:30', 'America/Chicago').toISOString(), '2026-03-08T08:30:00.000Z');
  });

  test('formatInZone shows the facility-local wall clock and round-trips', () => {
    const instant = zonedLocalToUtc('2026-12-02T08:00', 'America/Chicago');
    assert.equal(formatInZone(instant, 'America/Chicago'), '2026-12-02 08:00');
    assert.equal(formatInZone(instant, 'Asia/Karachi'), '2026-12-02 19:00');
    assert.equal(formatInZone(instant, 'nope'), null);
    assert.equal(isLocalDateTime('2026-12-02T08:00'), true);
    assert.equal(isLocalDateTime('2026-12-02T08:00:00Z'), false);
  });
});

describe('carrier eligibility rules', () => {
  const now = new Date('2026-10-08T00:00:00Z');
  const load = {
    equipmentType: 'Dry Van',
    crossBorder: false,
    origin: { city: 'Dallas', state: 'TX', country: 'US', zipCode: '75201' },
    destination: { city: 'Denver', state: 'CO', country: 'US' },
  };
  const carrier = (overrides = {}) => ({
    _id: 'c1',
    status: 'active',
    authorityStatus: 'active',
    complianceStatus: 'approved',
    equipmentTypes: ['Dry Van'],
    operatingRegions: ['Texas'],
    crossBorderCapability: false,
    ...overrides,
  });
  const user = { isActive: true };
  const check = (c, l = load, extra = {}) => evaluateCarrierForLoad({ load: l, carrier: c, user, now, ...extra });
  const codes = (verdict) => verdict.reasons.map((reason) => reason.code);

  test('a fully cleared carrier with matching equipment and area is eligible and scored', () => {
    const verdict = check(carrier());
    assert.equal(verdict.eligible, true);
    assert.equal(verdict.coverage.pickup, 'state');
    assert.ok(verdict.score > 50);
  });

  test('each rule excludes with its own reason code', () => {
    assert.deepEqual(codes(check(carrier({ status: 'suspended' }))), ['CARRIER_NOT_ACTIVE']);
    assert.deepEqual(codes(check(carrier({ status: 'pending' }))), ['CARRIER_NOT_ACTIVE']);
    assert.deepEqual(codes(check(carrier({ authorityStatus: 'revoked' }))), ['AUTHORITY_NOT_ACTIVE']);
    assert.deepEqual(codes(check(carrier({ complianceStatus: 'expired' }))), ['COMPLIANCE_NOT_APPROVED']);
    assert.deepEqual(codes(check(carrier({ equipmentTypes: ['Flatbed'] }))), ['EQUIPMENT_MISMATCH']);
    assert.deepEqual(codes(check(carrier({ operatingRegions: ['California'] }))), ['OUTSIDE_SERVICE_AREA']);
    assert.deepEqual(codes(check(carrier({ operatingRegions: [] }))), ['NO_SERVICE_AREA']);
    assert.deepEqual(codes(check(carrier({ archivedAt: new Date() }))), ['CARRIER_ARCHIVED']);
    assert.deepEqual(codes(check(carrier({ insurance: { expirationDate: new Date('2026-01-01') } }))), ['INSURANCE_EXPIRED']);
    assert.deepEqual(codes(evaluateCarrierForLoad({ load, carrier: carrier(), user: { isActive: false }, now })), ['USER_INACTIVE']);
    assert.deepEqual(codes(check(carrier(), load, { removedCarrierIds: ['c1'] })), ['PREVIOUSLY_UNASSIGNED']);
  });

  test('cross-border freight needs a cross-border capable carrier', () => {
    const border = { ...load, crossBorder: true, destination: { city: 'Toronto', state: 'ON', country: 'CA' } };
    assert.deepEqual(codes(check(carrier(), border)), ['CROSS_BORDER_NOT_PERMITTED']);
    assert.equal(check(carrier({ crossBorderCapability: true }), border).eligible, true);
  });

  test('a load with no equipment requirement matches any equipment', () => {
    assert.equal(check(carrier({ equipmentTypes: ['Reefer'] }), { ...load, equipmentType: undefined }).eligible, true);
  });

  test('several failures are all reported', () => {
    const verdict = check(carrier({ status: 'suspended', equipmentTypes: ['Flatbed'], operatingRegions: ['Ohio'] }));
    assert.deepEqual(codes(verdict).sort(), ['CARRIER_NOT_ACTIVE', 'EQUIPMENT_MISMATCH', 'OUTSIDE_SERVICE_AREA']);
    assert.equal(verdict.score, 0);
  });

  test('service-area coverage: abbreviations, names, cities, zips, countries, wildcards', () => {
    const stop = { city: 'Dallas', state: 'TX', country: 'US', zipCode: '75201' };
    assert.equal(regionCoverage(['TX'], stop), 'state');
    assert.equal(regionCoverage(['texas'], stop), 'state');
    assert.equal(regionCoverage(['Dallas'], stop), 'city');
    assert.equal(regionCoverage(['752'], stop), 'zip');
    assert.equal(regionCoverage(['United States'], stop), 'country');
    assert.equal(regionCoverage(['Nationwide'], stop), 'wildcard');
    assert.equal(regionCoverage(['Oklahoma', 'Canada'], stop), null);
    assert.equal(regionCoverage(['Ontario'], { city: 'Toronto', state: 'ON', country: 'CA' }), 'state');
    assert.equal(regionCoverage(['Nuevo León'], { city: 'Monterrey', state: 'NLE', country: 'MX' }), 'state');
    assert.equal(regionCoverage([], stop), null);
  });
});

describe('request validation', () => {
  const parse = (schema, input) => schema.safeParse(input);

  test('lists reject unknown keys, bad enums and oversized pages', () => {
    assert.equal(parse(validators.listLoadsSchema, { query: { status: 'open' } }).success, true);
    assert.equal(parse(validators.listLoadsSchema, { query: { status: 'hacked' } }).success, false);
    assert.equal(parse(validators.listLoadsSchema, { query: { limit: '500' } }).success, false);
    assert.equal(parse(validators.listLoadsSchema, { query: { password: 'x' } }).success, false);
    assert.equal(parse(validators.listLoadsSchema, { query: { sort: 'brokerMargin' } }).success, false);
    assert.equal(parse(validators.listLoadsSchema, { query: { status: { $ne: 'open' } } }).success, false);
    assert.equal(parse(validators.listLoadsSchema, { query: { q: { $regex: '.*' } } }).success, false);
    assert.equal(parse(validators.listLoadsSchema, { query: { q: 'a' } }).success, false, 'search needs 2+ characters');
  });

  test('money must be integer cents', () => {
    const base = { params: { id: 'a'.repeat(24) } };
    assert.equal(parse(validators.quotePricingSchema, { ...base, body: { customerRate: 300000, carrierRate: 240000 } }).success, true);
    for (const bad of [300000.5, '300000', -1, 0, 1e21]) {
      assert.equal(parse(validators.quotePricingSchema, { ...base, body: { customerRate: bad } }).success, false, String(bad));
    }
    assert.equal(parse(validators.quotePricingSchema, { ...base, body: { customerRate: 1, brokerMargin: 5 } }).success, false);
    assert.equal(parse(validators.quotePricingSchema, { ...base, body: { customerRate: 1, status: 'quoted' } }).success, false);
  });

  test('schedules need a real IANA timezone and a valid time format', () => {
    const base = { params: { id: 'a'.repeat(24) } };
    const ok = { pickup: { earliest: '2026-12-02T08:00', latest: '2026-12-02T12:00', timezone: 'America/Chicago' } };
    assert.equal(parse(validators.scheduleLoadSchema, { ...base, body: ok }).success, true);
    assert.equal(parse(validators.scheduleLoadSchema, { ...base, body: { pickup: { earliest: '2026-12-02T08:00' } } }).success, false, 'timezone is mandatory');
    assert.equal(parse(validators.scheduleLoadSchema, { ...base, body: { pickup: { ...ok.pickup, timezone: 'Mars/Phobos' } } }).success, false);
    assert.equal(parse(validators.scheduleLoadSchema, { ...base, body: { pickup: { ...ok.pickup, earliest: 'tomorrow' } } }).success, false);
    assert.equal(parse(validators.scheduleLoadSchema, { ...base, body: {} }).success, false);
    assert.equal(parse(validators.scheduleLoadSchema, { ...base, body: { pickup: { ...ok.pickup, earliest: '2026-12-02T14:00:00Z' } } }).success, true, 'absolute instants are fine');
  });

  test('ids must be 24-hex strings', () => {
    assert.equal(parse(validators.idParamSchema, { params: { id: '5f'.repeat(12) } }).success, true);
    assert.equal(parse(validators.idParamSchema, { params: { id: { $ne: null } } }).success, false);
    assert.equal(parse(validators.assignSchema, { params: { id: 'a'.repeat(24) }, body: { carrierId: { $ne: null } } }).success, false);
  });

  test('reassign and unassign require a reason', () => {
    const base = { params: { id: 'a'.repeat(24) } };
    assert.equal(parse(validators.reassignSchema, { ...base, body: { carrierId: 'b'.repeat(24) } }).success, false);
    assert.equal(parse(validators.unassignSchema, { ...base, body: {} }).success, false);
    assert.equal(parse(validators.cancelSchema, { ...base, body: {} }).success, false);
  });
});

describe('operator rejection middleware', () => {
  const run = (req) => {
    let error = null;
    try {
      rejectOperators(req, {}, () => {});
    } catch (caught) {
      error = caught;
    }
    return error;
  };

  test('refuses $-keys and dotted keys at any depth in query and body', () => {
    for (const req of [
      { query: { $where: '1' } },
      { query: { 'status[$ne]': 'open' } },
      { query: { status: { $ne: 'open' } } },
      { query: { q: { $regex: '.*' } } },
      { query: {}, body: { carrierId: { $ne: null } } },
      { query: {}, body: { a: { b: [{ $or: [] }] } } },
      { query: {}, body: { 'pickup.timezone': 'x' } },
    ]) {
      const error = run(req);
      assert.equal(error?.statusCode, 400, JSON.stringify(req));
      assert.equal(error.code, 'OPERATOR_NOT_ALLOWED');
    }
  });

  test('lets ordinary input through', () => {
    assert.equal(run({ query: { status: 'open', q: '$100 load' }, body: { reason: 'cost is $5.00' } }), null);
  });
});

describe('route structure', () => {
  const routes = operationsRoutes.stack.filter((layer) => layer.route).map((layer) => ({ path: layer.route.path, methods: Object.keys(layer.route.methods) }));

  test('there are routes, and none accepts a free-form status', () => {
    assert.ok(routes.length >= 40);
    for (const { path, methods } of routes) {
      assert.ok(!/\/status$/.test(path), `${path} must not be a status setter`);
      if (methods.includes('patch')) assert.ok(['/loads/:id', '/quotes/:id/internal-notes'].includes(path), `unexpected PATCH ${path}`);
    }
  });

  test('operations is mounted behind authenticate and requireSuperAdmin, and only there', () => {
    const index = readFileSync(new URL('../src/routes/index.js', import.meta.url), 'utf8');
    assert.match(index, /router\.use\('\/operations', authenticate, requireSuperAdmin, operationsRoutes\)/);
  });

  test('the operations module is not imported by any customer or carrier presenter', () => {
    for (const file of ['customer/customer.presenters.js', 'carrier/carrier.presenters.js']) {
      const source = readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');
      assert.equal(/operations\.presenters/.test(source), false, file);
    }
  });

  test('customer and carrier presenters never name admin-only money or note fields', () => {
    const forbidden = ['brokerMargin', 'internalNotes', 'estimatedRate', 'assignmentHistory', 'cancelledReason'];
    for (const file of ['customer/customer.presenters.js', 'carrier/carrier.presenters.js']) {
      const source = readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      for (const word of forbidden) assert.equal(source.includes(word), false, `${file} mentions ${word}`);
    }
  });

  test('operations source contains no email sending and no console logging of secrets', () => {
    const dir = new URL('../src/operations/', import.meta.url);
    for (const name of readdirSync(dir)) {
      const source = readFileSync(new URL(name, dir), 'utf8');
      assert.equal(/sendEmail|nodemailer|smtp/i.test(source), false, `${name} must not send email`);
      assert.equal(/console\.(log|info|warn|error)/.test(source), false, `${name} must not use console`);
    }
  });
});
