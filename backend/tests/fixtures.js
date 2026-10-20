import mongoose from 'mongoose';
import {
  ActivityLog,
  Carrier,
  CarrierApplication,
  Customer,
  Document,
  Load,
  Notification,
  Payment,
  QuoteRequest,
  Shipment,
} from '../src/models/index.js';

export const newId = () => new mongoose.Types.ObjectId();

export const place = (country = 'US', city = 'Chicago', state = 'IL') => ({ city, state, country });

/** Synthetic values for tests only. Nothing here is seeded into any database by the app. */
export const build = {
  customer: (overrides = {}) =>
    new Customer({ userId: newId(), companyName: 'Test Shipper Co', ...overrides }),
  carrier: (overrides = {}) =>
    new Carrier({ userId: newId(), companyName: 'Test Carrier Co', ...overrides }),
  application: (overrides = {}) =>
    new CarrierApplication({
      companyName: 'Applicant Co',
      contactPerson: 'Test Person',
      email: 'applicant@example.com',
      phone: '555-010-0000',
      ...overrides,
    }),
  quote: (overrides = {}) =>
    new QuoteRequest({
      quoteNumber: 'QT-2026-000001',
      customerId: newId(),
      origin: place(),
      destination: place('US', 'Dallas', 'TX'),
      pickupDate: new Date('2026-11-01'),
      commodity: 'Test goods',
      ...overrides,
    }),
  load: (overrides = {}) =>
    new Load({
      loadNumber: 'LD-2026-000001',
      customerId: newId(),
      origin: place(),
      destination: place('US', 'Dallas', 'TX'),
      commodity: 'Test goods',
      ...overrides,
    }),
  shipment: (overrides = {}) =>
    new Shipment({
      trackingNumber: 'HL-TEST000001',
      loadId: newId(),
      customerId: newId(),
      ...overrides,
    }),
  document: (overrides = {}) =>
    new Document({
      name: 'test.pdf',
      type: 'BOL',
      fileUrl: 'https://files.example.com/test.pdf',
      storageKey: 'documents/test.pdf',
      uploadedBy: newId(),
      relatedEntityType: 'load',
      relatedEntityId: newId(),
      ...overrides,
    }),
  payment: (overrides = {}) =>
    new Payment({
      loadId: newId(),
      customerId: newId(),
      amount: 150000,
      paymentType: 'customer_payment',
      ...overrides,
    }),
  notification: (overrides = {}) =>
    new Notification({
      recipientId: newId(),
      type: 'system',
      title: 'Test notification',
      message: 'Test message',
      ...overrides,
    }),
  activity: (overrides = {}) =>
    new ActivityLog({ userId: newId(), action: 'test.action', module: 'system', ...overrides }),
};

export async function invalidPaths(document) {
  try {
    await document.validate();
    return [];
  } catch (error) {
    if (error.name !== 'ValidationError') throw error;
    return Object.keys(error.errors);
  }
}
