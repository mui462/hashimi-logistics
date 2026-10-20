/**
 * Integration tests that need a live MongoDB-compatible server.
 *
 *   MONGO_TEST_URI=mongodb://127.0.0.1:27017/hashimi_test npm run test:db
 *
 * The database name MUST end in "_test": the suite drops the database when it finishes.
 * Without MONGO_TEST_URI every test here is reported as skipped (never as passed).
 */
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { build, newId, place } from './fixtures.js';

const testUri = process.env.MONGO_TEST_URI;
const skipReason = testUri ? false : 'MONGO_TEST_URI is not set; database tests require a live MongoDB';

if (testUri) {
  const databaseName = new URL(testUri).pathname.replace(/^\//, '');
  if (!databaseName.endsWith('_test')) {
    throw new Error(`Refusing to run: database "${databaseName}" must end with "_test" because it is dropped afterwards.`);
  }
  process.env.MONGO_URI = testUri;
  process.env.JWT_SECRET ??= 'database-test-secret-database-test-secret';
  process.env.CLIENT_URL ??= 'http://localhost:5173';
}

const isUnsupportedPartialIndex = (error) => /partialFilterExpression/.test(error?.message ?? '');
const duplicateKey = { code: 11000 };

describe('models against a live database', { skip: skipReason }, () => {
  let mongoose;
  let models;
  let numbering;
  let partialIndexesSupported = true;

  before(async () => {
    const database = await import('../src/config/database.js');
    ({ default: mongoose } = await import('mongoose'));
    models = await import('../src/models/index.js');
    numbering = await import('../src/services/numbering.service.js');
    await database.connectDatabase();
    await mongoose.connection.dropDatabase();

    const results = await Promise.allSettled(Object.values(models.models).map((Model) => Model.init()));
    results.forEach((result, position) => {
      if (result.status === 'fulfilled') return;
      if (isUnsupportedPartialIndex(result.reason)) {
        partialIndexesSupported = false;
        return;
      }
      throw new Error(`${Object.keys(models.models)[position]}.init(): ${result.reason.message}`);
    });
  });

  after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  test('indexes are created for every model', async () => {
    const expected = {
      customers: ['userId_1', 'companyName_1', 'email_1', 'status_1_createdAt_-1'],
      carriers: ['userId_1', 'MCNumber_1', 'DOTNumber_1', 'companyName_1', 'status_1_complianceStatus_1'],
      carrier_applications: ['status_1_createdAt_-1', 'email_1', 'MCNumber_1', 'DOTNumber_1'],
      quote_requests: ['quoteNumber_1', 'customerId_1_createdAt_-1', 'status_1_createdAt_-1', 'createdAt_-1'],
      loads: ['loadNumber_1', 'customerId_1_createdAt_-1', 'carrierId_1_status_1', 'status_1_createdAt_-1'],
      shipments: ['trackingNumber_1', 'loadId_1', 'customerId_1_createdAt_-1', 'carrierId_1_status_1'],
      documents: ['relatedEntityType_1_relatedEntityId_1', 'customerId_1_visibility_1', 'carrierId_1_visibility_1'],
      payments: ['loadId_1', 'carrierId_1_status_1', 'customerId_1_status_1', 'status_1_createdAt_-1'],
      notifications: ['recipientId_1_isRead_1_createdAt_-1'],
      activity_logs: ['userId_1_createdAt_-1', 'module_1_createdAt_-1', 'entityId_1_createdAt_-1', 'createdAt_-1'],
      pages: ['slug_1', 'status_1_displayOrder_1'],
      services: ['slug_1', 'isActive_1_displayOrder_1'],
      blog_posts: ['slug_1', 'status_1_publishedAt_-1'],
      site_settings: ['key_1'],
      homepage: ['key_1'],
    };
    for (const [collection, names] of Object.entries(expected)) {
      const actual = (await mongoose.connection.collection(collection).indexes()).map((index) => index.name);
      for (const name of names) assert.ok(actual.includes(name), `${collection} is missing index ${name} (has ${actual})`);
    }
  });

  test('User: email is unique, and only one Super Admin can exist', async (t) => {
    const { User } = models;
    const base = { firstName: 'T', lastName: 'U', passwordHash: 'hash' };
    await User.create({ ...base, email: 'dup@example.com' });
    await assert.rejects(User.create({ ...base, email: 'DUP@example.com' }), duplicateKey);

    if (!partialIndexesSupported) {
      t.skip('this server does not implement partial indexes, so single_super_admin cannot be verified here');
      return;
    }
    await User.create({ ...base, email: 'root@example.com', role: 'super_admin' });
    await assert.rejects(User.create({ ...base, email: 'root2@example.com', role: 'super_admin' }), duplicateKey);
  });

  test('Customer/Carrier: one profile per user, timestamps, MC/DOT uniqueness', async () => {
    const { Customer, Carrier } = models;
    const userId = newId();
    const customer = await Customer.create({ userId, companyName: 'Acme Test' });
    assert.ok(customer.createdAt instanceof Date && customer.updatedAt instanceof Date);
    await assert.rejects(Customer.create({ userId, companyName: 'Second profile' }), duplicateKey);

    const before = customer.updatedAt.getTime();
    await new Promise((resolve) => setTimeout(resolve, 15));
    customer.phone = '555-010-1111';
    await customer.save();
    assert.ok(customer.updatedAt.getTime() > before, 'updatedAt advances on save');

    await Carrier.create({ userId: newId(), companyName: 'No Authority 1' });
    await Carrier.create({ userId: newId(), companyName: 'No Authority 2', MCNumber: '' });
    await Carrier.create({ userId: newId(), companyName: 'With MC', MCNumber: 'mc100', DOTNumber: '200' });
    await assert.rejects(Carrier.create({ userId: newId(), companyName: 'Dup MC', MCNumber: 'MC100' }), duplicateKey);
    await assert.rejects(Carrier.create({ userId: newId(), companyName: 'Dup DOT', DOTNumber: '200' }), duplicateKey);
  });

  test('Quote -> Load -> Shipment relationships populate and enforce uniqueness', async () => {
    const { Customer, Carrier, QuoteRequest, Load, Shipment, User } = models;
    const customer = await Customer.create({ userId: newId(), companyName: 'Rel Shipper' });
    const carrier = await Carrier.create({ userId: newId(), companyName: 'Rel Carrier' });
    const admin = await User.create({ firstName: 'A', lastName: 'B', email: 'rel-admin@example.com', passwordHash: 'h' });

    const quote = await QuoteRequest.create({
      quoteNumber: 'QT-REL-1',
      customerId: customer._id,
      origin: place(),
      destination: place('CA', 'Toronto', 'ON'),
      pickupDate: new Date('2026-12-01'),
      commodity: 'Relationship goods',
      isCrossBorder: true,
      borderCrossing: 'Test crossing',
      assignedTo: admin._id,
      internalNotes: 'internal only',
      estimatedRate: 180000,
    });
    await assert.rejects(build.quote({ quoteNumber: 'QT-REL-1', customerId: customer._id }).save(), duplicateKey);

    const loadDoc = await Load.create({
      loadNumber: 'LD-REL-1',
      quoteId: quote._id,
      customerId: customer._id,
      carrierId: carrier._id,
      origin: quote.origin,
      destination: quote.destination,
      commodity: quote.commodity,
      status: 'assigned',
      rate: 250000,
      carrierRate: 200000,
      assignedBy: admin._id,
    });
    assert.equal(loadDoc.brokerMargin, 50000);
    await assert.rejects(Load.create({ loadNumber: 'LD-REL-1', customerId: customer._id, origin: place(), destination: place(), commodity: 'x' }), duplicateKey);

    const shipment = await Shipment.create({
      trackingNumber: 'HL-REL0000001',
      loadId: loadDoc._id,
      customerId: customer._id,
      carrierId: carrier._id,
      borderStatus: 'pending',
    });
    await assert.rejects(Shipment.create({ trackingNumber: 'HL-REL0000001', loadId: newId(), customerId: customer._id }), duplicateKey);
    await assert.rejects(Shipment.create({ trackingNumber: 'HL-REL0000002', loadId: loadDoc._id, customerId: customer._id }), duplicateKey, 'one shipment per load');

    const populated = await Shipment.findById(shipment._id).populate({ path: 'loadId', populate: [{ path: 'quoteId' }, { path: 'carrierId' }, { path: 'customerId' }] });
    assert.equal(populated.loadId.loadNumber, 'LD-REL-1');
    assert.equal(populated.loadId.quoteId.quoteNumber, 'QT-REL-1');
    assert.equal(populated.loadId.carrierId.companyName, 'Rel Carrier');
    assert.equal(populated.loadId.customerId.companyName, 'Rel Shipper');

    const plain = await Load.findById(loadDoc._id).lean();
    assert.equal('rate' in plain || 'carrierRate' in plain || 'brokerMargin' in plain || 'assignedBy' in plain, false, 'internal money fields excluded by default');
    const customerView = await Load.findById(loadDoc._id).select('+rate -carrierId').lean();
    assert.equal(customerView.rate, 250000);
    assert.equal('carrierRate' in customerView || 'brokerMargin' in customerView || 'carrierId' in customerView, false);
    const carrierView = await Load.findById(loadDoc._id).select('+carrierRate -customerId -quoteId').lean();
    assert.equal(carrierView.carrierRate, 200000);
    assert.equal('rate' in carrierView || 'brokerMargin' in carrierView || 'customerId' in carrierView, false);
    const adminView = await Load.findById(loadDoc._id).select('+rate +carrierRate +brokerMargin +assignedBy');
    assert.equal(adminView.brokerMargin, 50000);
    assert.equal(adminView.toInternalJSON().carrierRate, 200000);

    const defaultQuote = await QuoteRequest.findById(quote._id);
    assert.equal(defaultQuote.internalNotes, undefined);
    assert.equal(defaultQuote.estimatedRate, undefined);
    assert.equal(defaultQuote.assignedTo, undefined);
    const adminQuote = await QuoteRequest.findById(quote._id).select('+internalNotes +estimatedRate +assignedTo');
    assert.equal(adminQuote.internalNotes, 'internal only');
    assert.equal(adminQuote.estimatedRate, 180000);
  });

  test('identifiers are immutable once saved', async () => {
    const { QuoteRequest } = models;
    const quote = await build.quote({ quoteNumber: 'QT-IMM-1' }).save();
    const owner = quote.customerId;
    quote.quoteNumber = 'QT-CHANGED';
    quote.customerId = newId();
    await quote.save();
    const reloaded = await QuoteRequest.findById(quote._id);
    assert.equal(reloaded.quoteNumber, 'QT-IMM-1');
    assert.equal(String(reloaded.customerId), String(owner));
  });

  test('embedded tracking events and border events persist and re-validate', async () => {
    const { Shipment } = models;
    const createdBy = newId();
    const shipment = await build
      .shipment({
        trackingNumber: 'HL-EVT0000001',
        borderStatus: 'pending',
        trackingEvents: [{ status: 'booked', description: 'Booked', createdBy }],
      })
      .save();
    shipment.trackingEvents.push({ status: 'picked_up', location: place(), description: 'Picked up', createdBy });
    shipment.status = 'at_border';
    shipment.borderStatus = 'at_border';
    shipment.borderEvents.push(
      { event: 'at_border', location: { city: 'Detroit', state: 'MI', country: 'US' }, createdBy },
      { event: 'customs_processing', description: 'Customs processing', createdBy },
      { event: 'border_delayed', description: 'Inspection', createdBy },
      { event: 'border_cleared', createdBy }
    );
    await shipment.save();

    const reloaded = await Shipment.findById(shipment._id);
    assert.equal(reloaded.trackingEvents.length, 2);
    assert.equal(reloaded.borderEvents.length, 4);
    assert.deepEqual(reloaded.borderEvents.map((event) => event.event), ['at_border', 'customs_processing', 'border_delayed', 'border_cleared']);
    assert.ok(reloaded.trackingEvents.every((event) => event._id && event.timestamp instanceof Date));
    assert.equal(String(reloaded.trackingEvents[1].createdBy), String(createdBy));

    const domestic = await build.shipment({ trackingNumber: 'HL-EVT0000002' }).save();
    domestic.borderEvents.push({ event: 'at_border' });
    await assert.rejects(domestic.save(), { name: 'ValidationError' });
  });

  test('Document: polymorphic relatedEntityId populates the right collection', async () => {
    const { Document, Load, Shipment, Customer } = models;
    const customer = await Customer.create({ userId: newId(), companyName: 'Doc Shipper' });
    const load = await build.load({ loadNumber: 'LD-DOC-1', customerId: customer._id }).save();
    const shipment = await build.shipment({ trackingNumber: 'HL-DOC0000001', loadId: load._id, customerId: customer._id }).save();

    const onLoad = await Document.create(build.document({ relatedEntityType: 'load', relatedEntityId: load._id, customerId: customer._id, visibility: 'customer' }).toObject());
    const onShipment = await Document.create(build.document({ type: 'POD', relatedEntityType: 'shipment', relatedEntityId: shipment._id }).toObject());
    assert.equal((await Document.findById(onLoad._id).populate('relatedEntityId')).relatedEntityId.loadNumber, 'LD-DOC-1');
    assert.equal((await Document.findById(onShipment._id).populate('relatedEntityId')).relatedEntityId.trackingNumber, 'HL-DOC0000001');

    const stored = await Document.findById(onLoad._id).lean();
    assert.equal('storageKey' in stored, false, 'storage key is hidden by default');
    assert.ok(Load && Shipment);

    const visibleToCustomer = await Document.find({ customerId: customer._id, visibility: 'customer' });
    assert.equal(visibleToCustomer.length, 1);
  });

  test('Notification: createdAt only; scoped by recipient; entity populates', async () => {
    const { Notification, User } = models;
    const user = await User.create({ firstName: 'N', lastName: 'U', email: 'notify@example.com', passwordHash: 'h' });
    const note = await Notification.create(build.notification({ recipientId: user._id, relatedEntity: { entityType: 'shipment', entityId: newId() } }).toObject());
    assert.ok(note.createdAt instanceof Date);
    assert.equal(note.updatedAt, undefined);
    assert.equal((await Notification.find({ recipientId: user._id, isRead: false })).length, 1);
    assert.equal((await Notification.find({ recipientId: newId() })).length, 0);
  });

  test('ActivityLog is append-only in the database too', async () => {
    const { ActivityLog } = models;
    const entry = await ActivityLog.create({ action: 'quote.created', module: 'quotes', description: 'Created', IPAddress: '203.0.113.9', metadata: { fields: ['status'] } });
    await assert.rejects(ActivityLog.updateOne({ _id: entry._id }, { description: 'Edited' }), { name: 'ImmutableRecordError' });
    await assert.rejects(ActivityLog.findByIdAndDelete(entry._id), { name: 'HardDeleteBlockedError' });
    assert.equal((await ActivityLog.findById(entry._id)).description, 'Created');
    assert.equal(await ActivityLog.countDocuments({ _id: entry._id }), 1);
    await ActivityLog.deleteOne({ _id: entry._id }, { allowHardDelete: true });
    assert.equal(await ActivityLog.countDocuments({ _id: entry._id }), 0, 'explicit maintenance delete still works');
  });

  test('soft delete: archive hides from .active(), hard delete is blocked, restore works', async () => {
    const { Payment } = models;
    const payment = await build.payment().save();
    await assert.rejects(Payment.deleteOne({ _id: payment._id }), { name: 'HardDeleteBlockedError' });
    const reloaded = await Payment.findById(payment._id);
    await assert.rejects(reloaded.deleteOne(), { name: 'HardDeleteBlockedError' });

    const adminId = newId();
    await reloaded.archive(adminId);
    assert.equal(await Payment.countDocuments({ _id: payment._id }), 1, 'archived records are retained');
    assert.equal((await Payment.find({ _id: payment._id }).active()).length, 0);
    const archived = await Payment.findById(payment._id).select('+archivedBy');
    assert.equal(String(archived.archivedBy), String(adminId));

    await archived.restore();
    assert.equal((await Payment.find({ _id: payment._id }).active()).length, 1);
  });

  test('singletons: only one SiteSettings and one Homepage document can exist', async () => {
    const { SiteSettings, Homepage } = models;
    const first = await SiteSettings.getPrimary();
    const second = await SiteSettings.getPrimary();
    assert.equal(String(first._id), String(second._id));
    assert.equal(await SiteSettings.countDocuments(), 1);
    assert.equal(first.companyName, 'HASHIMI LOGISTICS INC.');
    await assert.rejects(SiteSettings.create({}), duplicateKey);

    const home = await Homepage.getPrimary();
    assert.equal(String((await Homepage.getPrimary())._id), String(home._id));
    assert.equal(await Homepage.countDocuments(), 1);
    assert.equal(home.stats.length, 0, 'no fabricated statistics');
    await assert.rejects(Homepage.create({}), duplicateKey);
  });

  test('CMS slugs are unique and generated; blog publish date persists', async () => {
    const { Page, Service, BlogPost, Testimonial, Faq } = models;
    await Page.create({ title: 'Privacy Policy' });
    await assert.rejects(Page.create({ title: 'Privacy Policy' }), duplicateKey);
    await Page.create({ title: 'Privacy Policy', slug: 'privacy-policy-2' });
    const service = await Service.create({ name: 'Full Truckload' });
    assert.equal(service.slug, 'full-truckload');
    const post = await BlogPost.create({ title: 'Published post', status: 'published' });
    assert.ok((await BlogPost.findById(post._id)).publishedAt instanceof Date);
    assert.equal(await Testimonial.countDocuments(), 0, 'no seeded testimonials');
    assert.equal(await Faq.countDocuments(), 0);
  });

  test('document numbering is sequential per type and restarts each year', async () => {
    const date = new Date('2030-06-01T00:00:00Z');
    assert.equal(await numbering.nextQuoteNumber(date), 'QT-2030-000001');
    assert.equal(await numbering.nextQuoteNumber(date), 'QT-2030-000002');
    assert.equal(await numbering.nextLoadNumber(date), 'LD-2030-000001', 'separate sequence per document type');
    assert.equal(await numbering.nextQuoteNumber(new Date('2031-01-01T00:00:00Z')), 'QT-2031-000001', 'restarts each year');
  });

  test('document numbering stays unique under concurrent requests', async (t) => {
    const probe = mongoose.connection.collection('atomicity_probe');
    await probe.insertOne({ _id: 'k', value: 0 });
    await Promise.all(Array.from({ length: 40 }, () => probe.updateOne({ _id: 'k' }, { $inc: { value: 1 } })));
    if ((await probe.findOne({ _id: 'k' })).value !== 40) {
      t.skip('this server loses concurrent $inc updates (not atomic), so concurrency cannot be verified here');
      return;
    }

    const date = new Date('2032-06-01T00:00:00Z');
    const batch = await Promise.all(Array.from({ length: 40 }, () => numbering.nextLoadNumber(date)));
    assert.equal(new Set(batch).size, 40, 'no duplicates under concurrent requests');
    assert.equal((await models.Counter.findById('LD-2032')).sequence, 40);
  });
});
