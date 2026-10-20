import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import mongoose from 'mongoose';
import {
  ActivityLog,
  BlogPost,
  Carrier,
  Faq,
  Homepage,
  Industry,
  Load,
  Media,
  Page,
  Service,
  ServiceArea,
  SiteSettings,
  Testimonial,
  User,
  models,
} from '../src/models/index.js';
import { ACCESS_SELECTIONS, selectionFor } from '../src/models/accessProjections.js';
import { ENTITY_MODEL_NAMES, RELATED_ENTITY_TYPES } from '../src/models/enums.js';
import { fromMinorUnits, toMinorUnits } from '../src/utils/money.js';
import { generateTrackingNumber } from '../src/services/numbering.service.js';
import { build, invalidPaths, newId, place } from './fixtures.js';

const expectInvalid = async (document, path) =>
  assert.ok((await invalidPaths(document)).includes(path), `expected "${path}" to be invalid`);
const expectValid = async (document) =>
  assert.deepEqual(await invalidPaths(document), [], 'expected the document to be valid');

const indexKeys = (Model) => Model.schema.indexes().map(([keys]) => JSON.stringify(keys));
const hasIndex = (Model, keys) => indexKeys(Model).includes(JSON.stringify(keys));
const uniquePaths = (Model) => {
  const paths = [];
  Model.schema.eachPath((path, type) => type.options.unique && paths.push(path));
  return paths;
};
const selectFalsePaths = (Model) => {
  const paths = [];
  Model.schema.eachPath((path, type) => type.options.select === false && paths.push(path));
  return paths.sort();
};

describe('model registry', () => {
  test('exports all 30 models (22 from Phases 1-10, the two Phase 11 delivery models, the five Phase 12 finance models, and the website ContactMessage) with the requested collection names', () => {
    const collections = Object.fromEntries(
      Object.entries(models).map(([name, Model]) => [name, Model.collection.name])
    );
    assert.deepEqual(collections, {
      ActivityLog: 'activity_logs',
      BlogPost: 'blog_posts',
      Carrier: 'carriers',
      CarrierPayable: 'carrier_payables',
      CarrierApplication: 'carrier_applications',
      ContactMessage: 'contact_messages',
      Counter: 'counters',
      Customer: 'customers',
      Document: 'documents',
      Faq: 'faqs',
      FinancialLock: 'financial_locks',
      Homepage: 'homepage',
      Industry: 'industries',
      Invoice: 'invoices',
      Load: 'loads',
      Media: 'media',
      Notification: 'notifications',
      NotificationDelivery: 'notification_deliveries',
      NotificationDeliveryClaim: 'notification_delivery_claims',
      Page: 'pages',
      Payment: 'payments',
      PaymentTransaction: 'payment_transactions',
      QuoteRequest: 'quote_requests',
      Service: 'services',
      ServiceArea: 'service_areas',
      Shipment: 'shipments',
      SiteSettings: 'site_settings',
      Testimonial: 'testimonials',
      User: 'users',
    });
  });

  test('every registered model is exported from the barrel (no stray or duplicate models)', () => {
    assert.deepEqual(mongoose.modelNames().sort(), Object.keys(models).sort());
  });

  test('the Phase 1 User model is untouched and still the only user model', () => {
    assert.equal(mongoose.modelNames().filter((name) => /user/i.test(name)).length, 1);
    assert.deepEqual(User.schema.path('role').enumValues, ['super_admin', 'customer', 'carrier']);
    assert.equal(User.schema.path('passwordHash').options.select, false);
    assert.ok(User.schema.indexes().some(([, options]) => options.name === 'single_super_admin'));
  });
});

describe('reference integrity', () => {
  function collectRefs(schema, found = []) {
    schema.eachPath((path, type) => {
      const own = type.options.ref ?? type.caster?.options?.ref;
      if (own) found.push({ path, ref: own });
      if (type.schema) collectRefs(type.schema, found);
    });
    return found;
  }

  test('every static ref points at a registered model', () => {
    const registered = new Set(mongoose.modelNames());
    for (const [name, Model] of Object.entries(models)) {
      for (const { path, ref } of collectRefs(Model.schema)) {
        if (typeof ref === 'string') assert.ok(registered.has(ref), `${name}.${path} -> ${ref}`);
      }
    }
  });

  test('every polymorphic entity type resolves to a registered model', () => {
    for (const type of [...RELATED_ENTITY_TYPES, 'document']) {
      assert.ok(mongoose.modelNames().includes(ENTITY_MODEL_NAMES[type]), type);
    }
  });

  test('relationships use ObjectId, not strings', () => {
    const checks = [
      [models.Customer, 'userId'],
      [models.Carrier, 'userId'],
      [models.QuoteRequest, 'customerId'],
      [models.Load, 'quoteId'],
      [models.Load, 'carrierId'],
      [models.Shipment, 'loadId'],
      [models.Payment, 'loadId'],
      [models.Notification, 'recipientId'],
      [models.ActivityLog, 'userId'],
      [models.Document, 'relatedEntityId'],
    ];
    for (const [Model, path] of checks) {
      assert.equal(Model.schema.path(path).instance, 'ObjectId', `${Model.modelName}.${path}`);
    }
  });
});

describe('indexes and uniqueness', () => {
  test('unique identifiers are unique', () => {
    assert.ok(uniquePaths(models.Customer).includes('userId'));
    assert.ok(uniquePaths(models.Carrier).includes('userId'));
    assert.ok(uniquePaths(models.Carrier).includes('MCNumber'));
    assert.ok(uniquePaths(models.Carrier).includes('DOTNumber'));
    assert.ok(uniquePaths(models.QuoteRequest).includes('quoteNumber'));
    assert.ok(uniquePaths(models.Load).includes('loadNumber'));
    assert.ok(uniquePaths(models.Shipment).includes('trackingNumber'));
    assert.ok(uniquePaths(models.Shipment).includes('loadId'));
    for (const Model of [Page, Service, Industry, BlogPost]) {
      assert.ok(uniquePaths(Model).includes('slug'), Model.modelName);
    }
    assert.ok(uniquePaths(SiteSettings).includes('key'));
    assert.ok(uniquePaths(Homepage).includes('key'));
  });

  test('carrier MC/DOT uniqueness is sparse so carriers without one do not collide', () => {
    for (const path of ['MCNumber', 'DOTNumber']) {
      assert.equal(Carrier.schema.path(path).options.sparse, true);
    }
  });

  test('carrier application MC/DOT/email are indexed but not unique (re-applications are allowed)', () => {
    const { CarrierApplication } = models;
    for (const keys of [{ MCNumber: 1 }, { DOTNumber: 1 }, { email: 1 }, { status: 1, createdAt: -1 }]) {
      assert.ok(hasIndex(CarrierApplication, keys), JSON.stringify(keys));
    }
    assert.deepEqual(uniquePaths(CarrierApplication), []);
  });

  test('expected query indexes exist', () => {
    const expectations = [
      [models.Customer, [{ companyName: 1 }, { email: 1 }]],
      [models.Carrier, [{ companyName: 1 }, { status: 1, complianceStatus: 1 }]],
      [models.QuoteRequest, [{ customerId: 1, createdAt: -1 }, { status: 1, createdAt: -1 }, { createdAt: -1 }]],
      [models.Load, [{ customerId: 1, createdAt: -1 }, { carrierId: 1, status: 1 }, { status: 1, createdAt: -1 }]],
      [models.Shipment, [{ customerId: 1, createdAt: -1 }, { carrierId: 1, status: 1 }, { status: 1, createdAt: -1 }]],
      [models.Document, [{ relatedEntityType: 1, relatedEntityId: 1 }, { customerId: 1, visibility: 1 }, { carrierId: 1, visibility: 1 }]],
      [models.Payment, [{ loadId: 1 }, { carrierId: 1, status: 1 }, { customerId: 1, status: 1 }]],
      [models.Notification, [{ recipientId: 1, isRead: 1, createdAt: -1 }]],
      [models.ActivityLog, [{ userId: 1, createdAt: -1 }, { module: 1, createdAt: -1 }, { entityId: 1, createdAt: -1 }]],
      [Page, [{ status: 1, displayOrder: 1 }]],
      [Service, [{ isActive: 1, displayOrder: 1 }]],
      [BlogPost, [{ status: 1, publishedAt: -1 }]],
    ];
    for (const [Model, list] of expectations) {
      for (const keys of list) assert.ok(hasIndex(Model, keys), `${Model.modelName} ${JSON.stringify(keys)}`);
    }
  });

  test('no model declares the same index twice', () => {
    for (const [name, Model] of Object.entries(models)) {
      const keys = indexKeys(Model);
      assert.equal(new Set(keys).size, keys.length, name);
    }
  });
});

describe('required fields, enums, and invalid values', () => {
  test('required fields are enforced', async () => {
    const cases = [
      [new models.Customer({}), ['userId', 'companyName']],
      [new models.Carrier({}), ['userId', 'companyName']],
      [new models.CarrierApplication({}), ['companyName', 'contactPerson', 'email', 'phone']],
      [new models.QuoteRequest({}), ['quoteNumber', 'customerId', 'origin', 'destination', 'pickupDate', 'commodity']],
      [new Load({}), ['loadNumber', 'customerId', 'origin', 'destination', 'commodity']],
      [new models.Shipment({}), ['trackingNumber', 'loadId', 'customerId']],
      [new models.Document({}), ['name', 'type', 'fileUrl', 'storageKey', 'uploadedBy', 'relatedEntityType', 'relatedEntityId']],
      [new models.Payment({}), ['loadId', 'amount', 'paymentType']],
      [new models.Notification({}), ['recipientId', 'type', 'title', 'message']],
      [new ActivityLog({}), ['module', 'action']],
      [new Page({}), ['title', 'slug']],
      [new Service({}), ['name', 'slug']],
      [new Industry({}), ['name', 'slug']],
      [new BlogPost({}), ['title', 'slug']],
      [new ServiceArea({}), ['country', 'title']],
      [new Faq({}), ['question', 'answer']],
      [new Testimonial({}), ['customerName', 'testimonial']],
      [new Media({}), ['fileName', 'fileUrl', 'storageKey', 'type', 'uploadedBy']],
    ];
    for (const [document, paths] of cases) {
      const found = await invalidPaths(document);
      for (const path of paths) {
        assert.ok(found.includes(path), `${document.constructor.modelName}: "${path}" should be required (got ${found})`);
      }
    }
  });

  test('optional business fields are not forced', async () => {
    await expectValid(build.customer());
    await expectValid(build.carrier());
    await expectValid(build.quote());
    await expectValid(build.load());
    await expectValid(build.shipment());
    await expectValid(build.payment());
    await expectValid(build.document());
  });

  test('enum values are enforced', async () => {
    await expectInvalid(build.customer({ status: 'deleted' }), 'status');
    await expectInvalid(build.carrier({ status: 'banned' }), 'status');
    await expectInvalid(build.carrier({ authorityStatus: 'maybe' }), 'authorityStatus');
    await expectInvalid(build.carrier({ complianceStatus: 'unknown' }), 'complianceStatus');
    await expectInvalid(build.carrier({ equipmentTypes: ['Hovercraft'] }), 'equipmentTypes.0');
    await expectInvalid(build.application({ status: 'archived' }), 'status');
    await expectInvalid(build.quote({ status: 'won' }), 'status');
    await expectInvalid(build.quote({ equipmentType: 'Submarine' }), 'equipmentType');
    await expectInvalid(build.load({ status: 'lost' }), 'status');
    await expectInvalid(build.shipment({ status: 'teleported' }), 'status');
    await expectInvalid(build.shipment({ borderStatus: 'nearby' }), 'borderStatus');
    await expectInvalid(build.document({ type: 'Selfie' }), 'type');
    await expectInvalid(build.document({ visibility: 'public' }), 'visibility');
    await expectInvalid(build.document({ relatedEntityType: 'planet' }), 'relatedEntityType');
    await expectInvalid(build.payment({ status: 'refunded' }), 'status');
    await expectInvalid(build.payment({ paymentType: 'barter' }), 'paymentType');
    await expectInvalid(build.notification({ type: 'gossip' }), 'type');
    await expectInvalid(build.activity({ module: 'nowhere' }), 'module');
    await expectInvalid(new Page({ title: 'x', status: 'live' }), 'status');
    await expectInvalid(new ServiceArea({ country: 'US', title: 'x', coverageType: 'galactic' }), 'coverageType');
    await expectInvalid(new ServiceArea({ country: 'FR', title: 'x' }), 'country');
    await expectInvalid(new Faq({ question: 'q', answer: 'a', category: 'Gossip' }), 'category');
  });

  test('every requested equipment type, status, and category is accepted', async () => {
    for (const type of ['Dry Van', 'Reefer', 'Flatbed', 'Step Deck', 'Box Truck', 'Straight Truck', 'Cargo Van', 'Sprinter', 'Other']) {
      await expectValid(build.carrier({ equipmentTypes: [type] }));
    }
    for (const status of ['new', 'reviewing', 'quoted', 'negotiating', 'approved', 'booked', 'completed', 'declined', 'cancelled']) {
      await expectValid(build.quote({ status }));
    }
    for (const status of ['booked', 'dispatched', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'cancelled']) {
      await expectValid(build.shipment({ status }));
    }
    for (const category of ['Shippers', 'Carriers', 'Quotes', 'Tracking', 'Cross-Border', 'General']) {
      await expectValid(new Faq({ question: 'q', answer: 'a', category }));
    }
  });

  test('malformed strings, numbers, dates, ratings, and emails are rejected', async () => {
    await expectInvalid(build.customer({ email: 'not-an-email' }), 'email');
    await expectInvalid(build.customer({ phone: 'abc' }), 'phone');
    await expectInvalid(build.customer({ companyName: 'x'.repeat(151) }), 'companyName');
    await expectInvalid(build.carrier({ rating: 6 }), 'rating');
    await expectInvalid(build.carrier({ rating: -1 }), 'rating');
    await expectInvalid(new Testimonial({ customerName: 'a', testimonial: 'b', rating: 0 }), 'rating');
    await expectInvalid(new Testimonial({ customerName: 'a', testimonial: 'b', rating: 6 }), 'rating');
    await expectInvalid(build.quote({ pickupDate: 'not a date' }), 'pickupDate');
    await expectInvalid(build.quote({ quantity: -3 }), 'quantity');
    await expectInvalid(build.quote({ pallets: 1.5 }), 'pallets');
    await expectInvalid(build.quote({ weight: { value: -5 } }), 'weight.value');
    await expectInvalid(build.document({ fileSize: 60 * 1024 * 1024 }), 'fileSize');
    await expectInvalid(build.document({ mimeType: 'pdf' }), 'mimeType');
    await expectInvalid(build.document({ fileUrl: 'ftp://nope' }), 'fileUrl');
    await expectInvalid(build.carrier({ insurance: { effectiveDate: new Date('2026-06-01'), expirationDate: new Date('2026-01-01') } }), 'insurance.expirationDate');
  });

  test('carrier MC/DOT numbers are normalized and blank values are treated as absent', () => {
    const carrier = build.carrier({ MCNumber: '  mc123456 ', DOTNumber: '' });
    assert.equal(carrier.MCNumber, 'MC123456');
    assert.equal(carrier.DOTNumber, undefined);
  });
});

describe('carrier applications', () => {
  test('a decision requires a reviewer and review date; rejection requires a reason', async () => {
    const approved = await invalidPaths(build.application({ status: 'approved' }));
    assert.ok(approved.includes('reviewedBy') && approved.includes('reviewedAt'));
    const rejected = await invalidPaths(
      build.application({ status: 'rejected', reviewedBy: newId(), reviewedAt: new Date() })
    );
    assert.deepEqual(rejected, ['rejectionReason']);
    await expectValid(
      build.application({ status: 'rejected', reviewedBy: newId(), reviewedAt: new Date(), rejectionReason: 'Expired insurance' })
    );
    await expectValid(build.application({ status: 'under_review' }));
  });
});

describe('cross-border architecture', () => {
  test('domestic quotes are normalized: not cross-border, customs not applicable', async () => {
    const quote = build.quote();
    await expectValid(quote);
    assert.equal(quote.isCrossBorder, false);
    assert.equal(quote.customsStatus, 'not_applicable');
    assert.equal(quote.originCountry, 'US');
    assert.equal(quote.destinationCountry, 'US');
  });

  test('all four supported lanes are accepted', async () => {
    for (const [from, to] of [['US', 'CA'], ['CA', 'US'], ['US', 'MX'], ['MX', 'US']]) {
      const quote = build.quote({
        isCrossBorder: true,
        origin: place(from),
        destination: place(to, 'Somewhere'),
        borderCrossing: 'Test crossing',
      });
      await expectValid(quote);
      assert.equal(quote.customsStatus, 'not_started');
      await expectValid(build.load({ origin: place(from), destination: place(to, 'Somewhere') }));
    }
  });

  test('unsupported or inconsistent lanes are rejected', async () => {
    await expectInvalid(build.quote({ isCrossBorder: true, origin: place('CA'), destination: place('MX') }), 'isCrossBorder');
    await expectInvalid(build.quote({ isCrossBorder: true }), 'isCrossBorder');
    await expectInvalid(build.quote({ origin: place('US'), destination: place('CA') }), 'isCrossBorder');
    await expectInvalid(build.quote({ originCountry: 'CA' }), 'originCountry');
    await expectInvalid(build.load({ origin: place('CA'), destination: place('MX') }), 'destination.country');
    assert.equal(build.load({ origin: place('US'), destination: place('CA') }).isCrossBorder, true);
    assert.equal(build.load().isCrossBorder, false);
  });

  test('delivery cannot precede pickup', async () => {
    await expectInvalid(build.quote({ deliveryDate: new Date('2026-10-01') }), 'deliveryDate');
  });

  test('temperature range must be coherent', async () => {
    await expectInvalid(build.quote({ temperatureRequirements: { minimum: 40, maximum: 30 } }), 'temperatureRequirements.maximum');
    await expectValid(build.quote({ temperatureRequirements: { minimum: 30, maximum: 40 } }));
  });
});

describe('shipments: tracking events and border events', () => {
  test('domestic shipment defaults to borderStatus not_applicable with no border data', async () => {
    const shipment = build.shipment();
    await expectValid(shipment);
    assert.equal(shipment.borderStatus, 'not_applicable');
    assert.equal(shipment.borderEvents.length, 0);
    assert.equal(shipment.status, 'booked');
  });

  test('domestic shipments reject border events and border statuses', async () => {
    await expectInvalid(build.shipment({ borderEvents: [{ event: 'at_border' }] }), 'borderEvents');
    await expectInvalid(build.shipment({ status: 'at_border' }), 'borderStatus');
    await expectInvalid(build.shipment({ trackingEvents: [{ status: 'border_cleared' }] }), 'borderStatus');
  });

  test('cross-border shipments represent At Border, Customs Processing, Border Cleared, Border Delayed', async () => {
    const shipment = build.shipment({
      borderStatus: 'at_border',
      status: 'at_border',
      borderEvents: ['at_border', 'customs_processing', 'border_delayed', 'border_cleared'].map((event) => ({
        event,
        location: { city: 'Detroit', state: 'MI', country: 'US' },
        description: 'test',
        createdBy: newId(),
      })),
    });
    await expectValid(shipment);
    assert.equal(shipment.borderEvents.length, 4);
    for (const event of shipment.borderEvents) {
      assert.ok(event._id, 'border events are individually addressable');
      assert.ok(event.timestamp instanceof Date, 'timestamp defaults to now');
    }
    for (const status of ['pending', 'at_border', 'cleared', 'delayed']) {
      await expectValid(build.shipment({ borderStatus: status }));
    }
  });

  test('tracking events embed status, location, description, timestamp, createdBy', async () => {
    const createdBy = newId();
    const shipment = build.shipment({
      trackingEvents: [{ status: 'picked_up', location: place(), description: 'Picked up', createdBy }],
    });
    await expectValid(shipment);
    const [event] = shipment.trackingEvents;
    assert.equal(event.status, 'picked_up');
    assert.equal(event.location.city, 'Chicago');
    assert.equal(String(event.createdBy), String(createdBy));
    assert.ok(event.timestamp instanceof Date);
    await expectInvalid(build.shipment({ trackingEvents: [{ status: 'warp_speed' }] }), 'trackingEvents.0.status');
    await expectInvalid(build.shipment({ trackingEvents: [{}] }), 'trackingEvents.0.status');
    await expectInvalid(build.shipment({ borderStatus: 'pending', borderEvents: [{ event: 'lunch_break' }] }), 'borderEvents.0.event');
  });

  test('exception status requires exception details', async () => {
    await expectInvalid(build.shipment({ status: 'exception' }), 'exception');
    await expectValid(build.shipment({ status: 'exception', exception: { reason: 'breakdown', description: 'Flat tire' } }));
    await expectInvalid(build.shipment({ status: 'exception', exception: { reason: 'aliens' } }), 'exception.reason');
  });

  test('position coordinates are range-checked', async () => {
    await expectInvalid(build.shipment({ currentLocation: { latitude: 120 } }), 'currentLocation.latitude');
    await expectInvalid(build.shipment({ currentLocation: { longitude: -200 } }), 'currentLocation.longitude');
  });
});

describe('loads and financial data', () => {
  test('money must be a whole number of cents', async () => {
    await expectInvalid(build.load({ rate: 1999.5 }), 'rate');
    await expectInvalid(build.load({ rate: -1 }), 'rate');
    await expectInvalid(build.load({ carrierRate: 0.1 + 0.2 }), 'carrierRate');
    await expectInvalid(build.payment({ amount: 10.5 }), 'amount');
    await expectInvalid(build.quote({ quotedRate: 12.34 }), 'quotedRate');
    await expectValid(build.load({ rate: 250000, carrierRate: 200000 }));
  });

  test('brokerMargin is computed exactly from integer cents (and may be negative)', async () => {
    const profitable = build.load({ rate: 250000, carrierRate: 215050 });
    await expectValid(profitable);
    assert.equal(profitable.brokerMargin, 34950);

    const losing = build.load({ rate: 100000, carrierRate: 120000, brokerMargin: 999 });
    await expectValid(losing);
    assert.equal(losing.brokerMargin, -20000, 'a supplied margin is overwritten by the computed value');
  });

  test('a carrier is required once a load is assigned or beyond', async () => {
    await expectValid(build.load({ status: 'open' }));
    await expectValid(build.load({ status: 'cancelled' }));
    for (const status of ['assigned', 'dispatched', 'picked_up', 'in_transit', 'delivered']) {
      await expectInvalid(build.load({ status }), 'carrierId');
      await expectValid(build.load({ status, carrierId: newId() }));
    }
  });

  test('currency is restricted to USD, CAD, MXN', async () => {
    await expectInvalid(build.load({ currency: 'EUR' }), 'currency');
    await expectValid(build.load({ currency: 'CAD' }));
  });

  test('money helper converts without floating-point error', () => {
    assert.equal(toMinorUnits('19.99'), 1999);
    assert.equal(toMinorUnits(19.99), 1999);
    assert.equal(toMinorUnits('1.1'), 110);
    assert.equal(toMinorUnits('0.07'), 7);
    assert.equal(toMinorUnits('-5'), -500);
    assert.equal(toMinorUnits(1234567.89), 123456789);
    assert.equal(fromMinorUnits(1999), '19.99');
    assert.equal(fromMinorUnits(7), '0.07');
    assert.equal(fromMinorUnits(-1050), '-10.50');
    assert.equal(fromMinorUnits(toMinorUnits('0.30')), '0.30');
    assert.throws(() => toMinorUnits('1.005'), RangeError);
    assert.throws(() => toMinorUnits('abc'), RangeError);
    assert.throws(() => toMinorUnits(1e21), RangeError);
    assert.throws(() => fromMinorUnits(1.5), RangeError);
  });
});

describe('payments', () => {
  test('payments must reference the right party and have a date once paid', async () => {
    await expectInvalid(build.payment({ customerId: undefined }), 'customerId');
    await expectInvalid(build.payment({ paymentType: 'carrier_payment', customerId: undefined }), 'carrierId');
    await expectValid(build.payment({ paymentType: 'carrier_payment', carrierId: newId(), customerId: undefined }));
    await expectValid(build.payment({ paymentType: 'other', customerId: undefined }));
    await expectInvalid(build.payment({ status: 'paid' }), 'paymentDate');
    await expectValid(build.payment({ status: 'paid', paymentDate: new Date() }));
  });
});

describe('notifications and activity logs', () => {
  test('notifications validate related entity and carry createdAt only', async () => {
    await expectValid(build.notification({ relatedEntity: { entityType: 'shipment', entityId: newId() } }));
    await expectValid(build.notification({ relatedEntity: { entityType: 'document', entityId: newId() } }));
    await expectInvalid(build.notification({ relatedEntity: { entityType: 'planet', entityId: newId() } }), 'relatedEntity.entityType');
    assert.equal(build.notification().isRead, false);
    assert.ok(models.Notification.schema.path('createdAt'));
    assert.equal(models.Notification.schema.path('updatedAt'), undefined);
  });

  test('activity log metadata may not contain secrets, at any depth', async () => {
    await expectValid(build.activity({ metadata: { changed: ['status'], from: 'new', to: 'quoted' } }));
    await expectInvalid(build.activity({ metadata: { password: 'x' } }), 'metadata');
    await expectInvalid(build.activity({ metadata: { body: { passwordHash: 'x' } } }), 'metadata');
    await expectInvalid(build.activity({ metadata: { headers: { Authorization: 'Bearer abc' } } }), 'metadata');
    await expectInvalid(build.activity({ metadata: { list: [{ apiKey: 'k' }] } }), 'metadata');
    await expectInvalid(build.activity({ metadata: { jwtSecret: 's' } }), 'metadata');
  });

  test('activity log validates IP addresses and has no updatedAt', async () => {
    await expectValid(build.activity({ IPAddress: '203.0.113.7' }));
    await expectValid(build.activity({ IPAddress: '2001:db8::1' }));
    await expectInvalid(build.activity({ IPAddress: 'not-an-ip' }), 'IPAddress');
    assert.equal(ActivityLog.schema.path('updatedAt'), undefined);
  });

  test('activity logs are append-only and business records cannot be hard-deleted', async () => {
    await assert.rejects(ActivityLog.updateOne({ action: 'x' }, { action: 'y' }).exec(), { name: 'ImmutableRecordError' });
    await assert.rejects(ActivityLog.deleteMany({}).exec(), { name: 'HardDeleteBlockedError' });
    const saved = build.activity();
    saved.isNew = false;
    await assert.rejects(saved.save(), { name: 'ImmutableRecordError' });
    for (const Model of [models.Customer, models.Carrier, models.CarrierApplication, models.QuoteRequest, Load, models.Shipment, models.Payment, models.Document]) {
      await assert.rejects(Model.deleteOne({}).exec(), { name: 'HardDeleteBlockedError' }, Model.modelName);
      await assert.rejects(Model.deleteMany({}).exec(), { name: 'HardDeleteBlockedError' }, Model.modelName);
      await assert.rejects(Model.findOneAndDelete({}).exec(), { name: 'HardDeleteBlockedError' }, Model.modelName);
    }
    const load = build.load();
    load.isNew = false;
    await assert.rejects(load.deleteOne(), { name: 'HardDeleteBlockedError' });
  });

  test('archive-able models expose archivedAt, archive(), restore(), and .active()', () => {
    for (const Model of [models.Customer, models.Carrier, models.CarrierApplication, models.QuoteRequest, Load, models.Shipment, models.Payment, models.Document]) {
      assert.ok(Model.schema.path('archivedAt'), Model.modelName);
      const document = new Model();
      assert.equal(typeof document.archive, 'function');
      assert.equal(typeof document.restore, 'function');
      assert.equal(document.archivedAt, null);
      assert.equal(typeof Model.find().active, 'function');
    }
  });
});

describe('CMS models', () => {
  test('slugs are generated from the name/title and validated', async () => {
    const service = new Service({ name: 'Full Truckload (FTL) & Réfrigéré!' });
    await expectValid(service);
    assert.equal(service.slug, 'full-truckload-ftl-refrigere');
    assert.equal(new Page({ title: 'About Us' }).slug, undefined, 'slug is filled on validate, not construction');
    const page = new Page({ title: 'About Us' });
    await page.validate();
    assert.equal(page.slug, 'about-us');
    await expectInvalid(new Page({ title: 'x', slug: 'Bad Slug!' }), 'slug');
    await expectInvalid(new Page({ title: 'x', slug: 'double--hyphen' }), 'slug');
    await expectValid(new Page({ title: 'x', slug: 'custom-slug' }));
  });

  test('blog posts stamp publishedAt when published', async () => {
    const post = new BlogPost({ title: 'Cross-border tips', status: 'published' });
    await expectValid(post);
    assert.ok(post.publishedAt instanceof Date);
    const draft = new BlogPost({ title: 'Draft', status: 'draft' });
    await draft.validate();
    assert.equal(draft.publishedAt, undefined);
    assert.equal(new BlogPost({ title: 'T', tags: ['  Freight '] }).tags[0], 'freight');
  });

  test('SEO subdocument validates and is reused', async () => {
    await expectValid(new Page({ title: 'x', SEO: { title: 'Title', keywords: ['a'], canonicalUrl: '/about', noIndex: true } }));
    await expectInvalid(new Page({ title: 'x', SEO: { canonicalUrl: 'javascript:alert(1)' } }), 'SEO.canonicalUrl');
    await expectInvalid(new Page({ title: 'x', SEO: { ogImage: 'not a url' } }), 'SEO.ogImage');
    await expectInvalid(new Page({ title: 'x', SEO: { keywords: Array(31).fill('k') } }), 'SEO.keywords');
    assert.equal(new Page({ title: 'x', SEO: {} }).SEO.noIndex, false);
    const seoSchemas = [Page, Service, Industry, BlogPost].map((Model) => Model.schema.path('SEO').schema);
    assert.ok(seoSchemas.every((schema) => schema === seoSchemas[0]), 'one shared SEO schema object');
    assert.equal(SiteSettings.schema.path('defaultSEO').schema, seoSchemas[0]);
    assert.equal(Homepage.schema.path('SEO').schema, seoSchemas[0]);
  });

  test('homepage ships with NO fake content: no stats, testimonials, or hero copy', async () => {
    const homepage = new Homepage({});
    await expectValid(homepage);
    assert.equal(homepage.stats.length, 0);
    assert.equal(homepage.hero, undefined);
    assert.equal(homepage.whyChooseUs, undefined);
    assert.equal(homepage.key, 'primary');
  });

  test('homepage hero, stats, and sections validate', async () => {
    const hero = {
      title: 'T',
      backgroundVideo: { url: 'https://cdn.example.com/v.mp4' },
      fallbackImage: { url: 'https://cdn.example.com/i.jpg', altText: 'x' },
      primaryButton: { label: 'Request a Quote', url: '/request-quote' },
      overlay: { opacity: 0.4 },
    };
    const homepage = new Homepage({
      hero,
      stats: [{ label: 'Label', value: '123', displayOrder: 1 }],
      howItWorks: { steps: [{ title: 'Step' }] },
      finalCTA: { primaryButton: { label: 'Go', url: '/x' } },
    });
    await expectValid(homepage);
    assert.deepEqual(
      [homepage.hero.autoplay, homepage.hero.muted, homepage.hero.loop, homepage.hero.isActive],
      [true, true, true, true]
    );
    assert.equal(homepage.stats[0].isActive, true);
    await expectInvalid(new Homepage({ hero: { overlay: { opacity: 2 } } }), 'hero.overlay.opacity');
    await expectInvalid(new Homepage({ stats: [{ label: 'only label' }] }), 'stats.0.value');
    await expectInvalid(new Homepage({ hero: { primaryButton: { label: 'no link' } } }), 'hero.primaryButton.url');
    await expectInvalid(new Homepage({ hero: { fallbackImage: { altText: 'no url' } } }), 'hero.fallbackImage.url');
  });

  test('site settings: sensible brand defaults, no invented contact details, singleton key', async () => {
    const settings = new SiteSettings({});
    await expectValid(settings);
    assert.equal(settings.companyName, 'HASHIMI LOGISTICS INC.');
    assert.equal(settings.tagline, 'Freight Brokerage & Transportation Solutions');
    for (const field of ['phone', 'email', 'address', 'copyrightText', 'timezone', 'logo']) {
      assert.equal(settings[field], undefined, `${field} must not be invented`);
    }
    await expectInvalid(new SiteSettings({ key: 'secondary' }), 'key');
    await expectInvalid(new SiteSettings({ timezone: 'Mars/Olympus' }), 'timezone');
    await expectValid(new SiteSettings({ timezone: 'America/Chicago' }));
    await expectInvalid(new SiteSettings({ businessHours: [{ day: 'monday' }, { day: 'monday' }] }), 'businessHours');
    await expectInvalid(new SiteSettings({ businessHours: [{ day: 'monday', opensAt: '9am' }] }), 'businessHours.0.opensAt');
    await expectValid(new SiteSettings({ businessHours: [{ day: 'monday', opensAt: '08:00', closesAt: '17:30' }] }));
    await expectInvalid(new SiteSettings({ socialLinks: [{ platform: 'myspace', url: 'https://x.example' }] }), 'socialLinks.0.platform');
    assert.equal(typeof SiteSettings.getPrimary, 'function');
    assert.equal(typeof Homepage.getPrimary, 'function');
  });

  test('ordering and activation defaults for CMS lists', () => {
    for (const Model of [Service, Industry, ServiceArea, Faq, Testimonial]) {
      const document = new Model();
      assert.equal(document.displayOrder, 0, Model.modelName);
      assert.equal(document.isActive, true, Model.modelName);
    }
    assert.equal(new Page().status, 'draft');
    assert.equal(new BlogPost().status, 'draft');
    assert.equal(new ServiceArea().coverageType, 'domestic');
    assert.equal(new Media().folder, 'general');
  });
});

describe('privacy: internal brokerage data is hidden by default', () => {
  test('exactly the intended fields are select:false', () => {
    assert.deepEqual(selectFalsePaths(models.Customer), ['archivedBy', 'notes']);
    assert.deepEqual(selectFalsePaths(Carrier), ['archivedBy', 'notes', 'rating']);
    assert.deepEqual(selectFalsePaths(models.CarrierApplication), ['archivedBy', 'notes']);
    assert.deepEqual(selectFalsePaths(models.QuoteRequest), ['archivedBy', 'assignedTo', 'brokerMargin', 'cancelledReason', 'createdBy', 'estimatedRate', 'internalNotes', 'reviewedBy', 'updatedBy']);
    assert.deepEqual(selectFalsePaths(Load), [
      'archivedBy',
      'assignedBy',
      'assignmentHistory',
      'brokerMargin',
      'cancelledReason',
      'carrierRate',
      'convertedBy',
      'createdBy',
      'internalNotes',
      'rate',
      'updatedBy',
    ]);
    assert.deepEqual(selectFalsePaths(models.Payment), ['archivedBy', 'notes']);
    assert.deepEqual(selectFalsePaths(models.Document), ['archivedBy', 'storageKey']);
    assert.deepEqual(selectFalsePaths(User), [
      'emailVerificationExpires',
      'emailVerificationTokenHash',
      'googleSubject',
      'passwordChangedAt',
      'passwordHash',
      'passwordResetExpires',
      'passwordResetTokenHash',
      'tokenVersion',
    ]);
  });

  test('toJSON never serializes internal fields, even on a freshly built document', () => {
    const load = build.load({ rate: 250000, carrierRate: 200000, assignedBy: newId() });
    const json = load.toJSON();
    for (const field of ['rate', 'carrierRate', 'brokerMargin', 'assignedBy', '_id', '__v']) {
      assert.equal(field in json, false, field);
    }
    assert.ok(json.id && json.loadNumber);

    const quote = build.quote({ internalNotes: 'secret', estimatedRate: 1 }).toJSON();
    assert.equal('internalNotes' in quote || 'estimatedRate' in quote, false);
    assert.equal('notes' in build.customer({ notes: 'secret' }).toJSON(), false);
    assert.equal('rating' in build.carrier({ rating: 4 }).toJSON(), false);
    assert.equal('storageKey' in build.document().toJSON(), false);
  });

  test('toInternalJSON is the explicit way to read everything (Super Admin only)', () => {
    const load = build.load({ rate: 250000, carrierRate: 200000 });
    load.brokerMargin = 50000;
    const internal = load.toInternalJSON();
    assert.equal(internal.rate, 250000);
    assert.equal(internal.carrierRate, 200000);
    assert.equal(internal.brokerMargin, 50000);
    assert.equal('_id' in internal, false);
  });

  test('role projections: admin sees every internal field; others only what they are entitled to', () => {
    const roleSees = (Model, role) => {
      const selection = selectionFor(Model.modelName, role) ?? '';
      return selection.split(/\s+/).filter((token) => token.startsWith('+')).map((token) => token.slice(1)).sort();
    };
    for (const name of Object.keys(ACCESS_SELECTIONS)) {
      const Model = models[name];
      const internal = selectFalsePaths(Model).filter((path) => path !== 'archivedBy');
      for (const path of internal) {
        assert.ok(roleSees(Model, 'super_admin').includes(path), `${name}: admin must be able to read ${path}`);
      }
      for (const role of ['customer', 'carrier']) {
        const allowed = roleSees(Model, role);
        const expected = name === 'Load' ? (role === 'customer' ? ['rate'] : ['carrierRate']) : [];
        assert.deepEqual(allowed, expected, `${name}/${role} opt-ins`);
        assert.ok(!allowed.includes('brokerMargin') && !allowed.includes('internalNotes') && !allowed.includes('notes'));
      }
    }
    assert.equal(selectionFor('Carrier', 'customer'), null, 'customers have no access to carrier records');
    assert.equal(selectionFor('Customer', 'carrier'), null);
    assert.equal(selectionFor('ActivityLog', 'customer'), null, 'activity logs are Super Admin only');
    assert.equal(selectionFor('ActivityLog', 'carrier'), null);
    assert.equal(selectionFor('CarrierApplication', 'carrier'), null);
    assert.equal(selectionFor('Nonexistent', 'customer'), null);
    assert.match(selectionFor('Load', 'customer'), /-carrierId/);
    assert.match(selectionFor('Load', 'carrier'), /-customerId/);
  });

  test('ownership fields exist for server-side enforcement', () => {
    const ownerPaths = {
      QuoteRequest: ['customerId'],
      Load: ['customerId', 'carrierId'],
      Shipment: ['customerId', 'carrierId'],
      Payment: ['customerId', 'carrierId'],
      Document: ['customerId', 'carrierId', 'uploadedBy'],
      Notification: ['recipientId'],
    };
    for (const [name, paths] of Object.entries(ownerPaths)) {
      for (const path of paths) assert.ok(models[name].schema.path(path), `${name}.${path}`);
    }
    for (const [name, path] of [['QuoteRequest', 'customerId'], ['Load', 'customerId'], ['Shipment', 'customerId'], ['Shipment', 'loadId'], ['Notification', 'recipientId'], ['Customer', 'userId'], ['Carrier', 'userId']]) {
      assert.equal(models[name].schema.path(path).options.immutable, true, `${name}.${path} must be immutable`);
    }
  });
});

describe('tracking numbers', () => {
  test('are random, well-formed, and non-sequential', () => {
    const numbers = Array.from({ length: 2000 }, generateTrackingNumber);
    assert.equal(new Set(numbers).size, numbers.length);
    for (const number of numbers) assert.match(number, /^HL-[A-HJKMNP-Z2-9]{10}$/);
    const sorted = [...numbers].sort();
    assert.notDeepEqual(numbers, sorted, 'generation order must not be sorted/sequential');
  });
});
