import { Carrier } from '../models/Carrier.js';
import { Customer } from '../models/Customer.js';
import { Document } from '../models/Document.js';
import { Load } from '../models/Load.js';
import { Payment } from '../models/Payment.js';
import { QuoteRequest } from '../models/QuoteRequest.js';
import { Shipment } from '../models/Shipment.js';
import { notifySuperAdmins, notifyUser } from '../operations/notifications.service.js';
import { recordActivity } from '../services/activity.service.js';
import { assertOwnsRecord, ownershipFilter } from '../services/ownership.service.js';
import { getStorageDriver, removeQuietly, signedLinkSeconds, storage } from '../storage/index.js';
import { inspectFile } from '../storage/fileValidation.js';
import { storageNotConfigured } from '../storage/storageError.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';

/**
 * Everything that creates, changes or opens a stored document goes through here, so the rules exist once:
 *  - the database record is the authorization source: callers pass the owner's access filter, never an id from the client;
 *  - customer / carrier ids on a document are always derived from the related record on the server;
 *  - files are private, and a file is only ever opened through a short-lived link issued after the check;
 *  - archiving keeps the stored file (no automatic physical deletion: there is no retention policy yet).
 */

export const POD_ALLOWED_STATUSES = Object.freeze(['out_for_delivery', 'delivered', 'completed']);
/** What a carrier may attach to its own shipment. Proof of delivery has its own route and rules. */
export const CARRIER_UPLOAD_TYPES = Object.freeze(['BOL', 'Other']);

const FIELD = (field, message) => ApiError.validation([{ field, message }]);

/* ---------- associations ---------- */

/**
 * Looks the related record up and returns who owns it. The result is the only source for a document's customerId and
 * carrierId. An unknown or archived record is a 404 with the same text for every kind, so nothing is revealed.
 */
export async function resolveAssociation(entityType, entityId) {
  const missing = () => ApiError.notFound('The related record was not found.', 'RELATED_RECORD_NOT_FOUND');
  const base = { relatedEntityType: entityType, relatedEntityId: entityId, customerId: null, carrierId: null };
  switch (entityType) {
    case 'shipment': {
      const shipment = await Shipment.findOne({ _id: entityId, archivedAt: null }).select('customerId carrierId status trackingNumber loadId').lean();
      if (!shipment) throw missing();
      return { ...base, customerId: shipment.customerId ?? null, carrierId: shipment.carrierId ?? null, shipment, label: shipment.trackingNumber };
    }
    case 'load': {
      const load = await Load.findOne({ _id: entityId, archivedAt: null }).select('customerId carrierId loadNumber').lean();
      if (!load) throw missing();
      return { ...base, customerId: load.customerId ?? null, carrierId: load.carrierId ?? null, label: load.loadNumber };
    }
    case 'quote': {
      const quote = await QuoteRequest.findOne({ _id: entityId, archivedAt: null }).select('customerId quoteNumber').lean();
      if (!quote) throw missing();
      return { ...base, customerId: quote.customerId ?? null, label: quote.quoteNumber };
    }
    case 'payment': {
      const payment = await Payment.findOne({ _id: entityId, archivedAt: null }).select('customerId carrierId').lean();
      if (!payment) throw missing();
      return { ...base, customerId: payment.customerId ?? null, carrierId: payment.carrierId ?? null };
    }
    case 'customer': {
      const customer = await Customer.findOne({ _id: entityId, archivedAt: null }).select('companyName').lean();
      if (!customer) throw missing();
      return { ...base, customerId: customer._id, label: customer.companyName };
    }
    case 'carrier': {
      const carrier = await Carrier.findOne({ _id: entityId, archivedAt: null }).select('companyName').lean();
      if (!carrier) throw missing();
      return { ...base, carrierId: carrier._id, label: carrier.companyName };
    }
    default:
      // carrier_application and anything else: documents about an application stay admin-only and have no portal owner.
      throw FIELD('relatedEntityType', 'Documents can be attached to a shipment, load, quote, payment, customer or carrier.');
  }
}

/** A document can only be shown to a customer or carrier that the related record actually belongs to. */
export function assertVisibilityFits(visibility, association) {
  const needsCustomer = visibility === 'customer' || visibility === 'shared';
  const needsCarrier = visibility === 'carrier' || visibility === 'shared';
  if (needsCustomer && !association.customerId) throw FIELD('visibility', 'This record has no customer, so the document cannot be shown to a customer.');
  if (needsCarrier && !association.carrierId) throw FIELD('visibility', 'This record has no carrier assigned, so the document cannot be shown to a carrier.');
}

/* ---------- create ---------- */

const trimName = (value) => String(value).trim().slice(0, 200);

/**
 * Validate the file, store it privately, then create the record. If the record cannot be created the stored file is removed
 * again, so a failed request leaves nothing behind. Returns the created document (lean-like plain object without storage data).
 */
export async function storeDocument({ file, fileName, type, association, visibility, name, actor, role, isPrimary = false, replacesDocumentId, audit }) {
  if (!storage.isConfigured()) throw storageNotConfigured();
  const inspected = inspectFile(file.buffer, { declaredType: file.declaredType, fileName, purpose: 'document' });
  const uploaded = await storage.upload({ buffer: file.buffer, mimeType: inspected.mimeType, fileName: inspected.fileName, folder: 'documents', access: 'private' });

  let document;
  try {
    document = await Document.create({
      name: trimName(name ?? inspected.fileName),
      originalFileName: inspected.fileName,
      type,
      fileUrl: uploaded.url,
      storageKey: uploaded.storageKey,
      storageProvider: getStorageDriver().name,
      fileSize: uploaded.bytes ?? file.size,
      mimeType: inspected.mimeType,
      uploadedBy: actor._id,
      uploadedByRole: role,
      relatedEntityType: association.relatedEntityType,
      relatedEntityId: association.relatedEntityId,
      customerId: association.customerId ?? undefined,
      carrierId: association.carrierId ?? undefined,
      visibility,
      isPrimary,
      ...(replacesDocumentId ? { replacesDocumentId } : {}),
    });
  } catch (error) {
    await removeQuietly(uploaded.storageKey, logger);
    throw error;
  }

  await recordActivity({
    userId: actor._id,
    action: audit.action,
    module: 'documents',
    entityId: document._id,
    description: audit.description,
    metadata: { documentType: type, relatedEntityType: association.relatedEntityType, mimeType: inspected.mimeType, fileSize: document.fileSize, visibility, ...(audit.metadata ?? {}) },
    context: audit.context,
  });
  return document.toObject();
}

/* ---------- secure access ---------- */

/**
 * Opens a document for an already-authorized caller. `filter` is the caller's access filter (ownership + visibility +
 * not archived), built on the server from the authenticated session. A document outside it is a plain 404.
 * Returns an expiring link; the link is never stored and never logged.
 */
export async function issueAccess({ documentId, filter, actor, role, disposition = 'attachment', context }) {
  const document = await Document.findOne({ _id: documentId, ...filter }).select('+storageKey').lean();
  assertOwnsRecordOrAdmin(role, document);
  const driver = getStorageDriver();
  if (!document.storageProvider) throw ApiError.notImplemented('Secure document download is not available yet.', 'DOWNLOAD_UNAVAILABLE');
  if (!driver) throw storageNotConfigured();
  if (driver.name !== document.storageProvider) throw ApiError.notImplemented('Secure document download is not available yet.', 'DOWNLOAD_UNAVAILABLE');
  const fileName = document.originalFileName ?? document.name;
  const access = await storage.createSecureAccess(document.storageKey, { disposition, fileName, mimeType: document.mimeType });
  await recordActivity({
    userId: actor._id,
    action: disposition === 'inline' ? 'document.previewed' : 'document.downloaded',
    module: 'documents',
    entityId: document._id,
    description: `${role === 'super_admin' ? 'Super Admin' : role === 'carrier' ? 'Carrier' : 'Customer'} opened a document.`,
    metadata: { documentType: document.type, disposition },
    context,
  });
  return {
    url: access.url,
    expiresAt: access.expiresAt.toISOString(),
    expiresInSeconds: signedLinkSeconds(),
    disposition,
    fileName,
    mimeType: document.mimeType ?? null,
  };
}

function assertOwnsRecordOrAdmin(_role, document) {
  // The filter already scoped the query; a missing document is a 404 for everyone.
  if (!document) throw ApiError.notFound();
}

/* ---------- carrier: POD and supporting documents ---------- */

async function loadCarrierShipment(owner, shipmentId) {
  const shipment = await Shipment.findOne({ _id: shipmentId, ...ownershipFilter(owner) }).active().select('customerId carrierId status trackingNumber loadId').lean();
  assertOwnsRecord(owner, shipment);
  return shipment;
}

const shipmentAssociation = (shipment) => ({
  relatedEntityType: 'shipment',
  relatedEntityId: shipment._id,
  customerId: shipment.customerId ?? null,
  carrierId: shipment.carrierId ?? null,
  shipment,
});

const activePod = (shipmentId) => ({ type: 'POD', relatedEntityType: 'shipment', relatedEntityId: shipmentId, archivedAt: null });

export async function uploadPod({ owner, user, shipmentId, file, fileName, replace = false, context }) {
  const shipment = await loadCarrierShipment(owner, shipmentId);
  if (!POD_ALLOWED_STATUSES.includes(shipment.status)) {
    throw ApiError.conflict('Proof of delivery can be uploaded once the shipment is out for delivery or delivered.', 'POD_NOT_ALLOWED_YET');
  }
  const existing = await Document.findOne({ ...activePod(shipment._id), isPrimary: true }).select('_id name uploadedByRole').lean();
  if (existing && replace && existing.uploadedByRole !== 'carrier') {
    throw ApiError.conflict('The proof of delivery on file was added by the office and cannot be replaced from the carrier portal. Please contact support.', 'POD_NOT_REPLACEABLE');
  }
  if (existing && !replace) {
    throw ApiError.conflict('A proof of delivery is already on file for this shipment. Choose "Replace" to upload a new one; the old file is kept in the archive.', 'POD_ALREADY_EXISTS');
  }
  const document = await storeDocument({
    file, fileName, type: 'POD', association: shipmentAssociation(shipment), visibility: 'shared', actor: user, role: 'carrier', isPrimary: true,
    replacesDocumentId: existing?._id,
    audit: { action: existing ? 'document.pod_replaced' : 'document.pod_uploaded', description: `Carrier uploaded proof of delivery for shipment ${shipment.trackingNumber}.`, metadata: { shipmentStatus: shipment.status }, context },
  });
  if (existing) await archiveReplaced(existing._id, user, context);
  await notifyPod(shipment, document);
  return document;
}

async function archiveReplaced(documentId, user, context) {
  try {
    const old = await Document.findById(documentId);
    if (old && !old.archivedAt) {
      old.isPrimary = false;
      await old.archive(user._id);
      await recordActivity({ userId: user._id, action: 'document.archived', module: 'documents', entityId: old._id, description: 'A proof of delivery was archived because a replacement was uploaded.', metadata: { documentType: old.type, reason: 'replaced' }, context });
    }
  } catch (error) {
    logger.warn(`Could not archive a replaced document: ${error.message}`);
  }
}

async function notifyPod(shipment, document) {
  // In-app notification, plus email/SMS when the recipient allows it (queued by notifyUser). Messages carry the tracking number and nothing about the carrier or pricing.
  const message = `Proof of delivery was uploaded for shipment ${shipment.trackingNumber}.`;
  const customer = shipment.customerId ? await Customer.findById(shipment.customerId).select('userId').lean() : null;
  const payload = { type: 'document', title: 'Proof of delivery uploaded', message, entityType: 'document', entityId: document._id, eventKey: `pod.uploaded:${document._id}` };
  await Promise.all([customer?.userId ? notifyUser(customer.userId, payload) : null, notifySuperAdmins(payload)]);
}

export async function uploadShipmentDocument({ owner, user, shipmentId, type, file, fileName, name, context }) {
  const shipment = await loadCarrierShipment(owner, shipmentId);
  if (!CARRIER_UPLOAD_TYPES.includes(type)) throw FIELD('type', 'Choose a document type you may upload.');
  if (shipment.status === 'cancelled') throw ApiError.conflict('This shipment was cancelled, so documents can no longer be added.', 'SHIPMENT_CLOSED');
  return storeDocument({
    file, fileName, name, type, association: shipmentAssociation(shipment), visibility: 'carrier', actor: user, role: 'carrier',
    audit: { action: 'document.uploaded', description: `Carrier uploaded a ${type} for shipment ${shipment.trackingNumber}.`, context },
  });
}

/* ---------- Super Admin ---------- */

export async function adminUpload({ user, file, fileName, type, relatedEntityType, relatedEntityId, visibility, name, context }) {
  const association = await resolveAssociation(relatedEntityType, relatedEntityId);
  assertVisibilityFits(visibility, association);
  let isPrimary = false;
  if (type === 'POD' && relatedEntityType === 'shipment') isPrimary = !(await Document.exists({ ...activePod(association.relatedEntityId), isPrimary: true }));
  const document = await storeDocument({
    file, fileName, name, type, association, visibility, actor: user, role: 'super_admin', isPrimary,
    audit: { action: type === 'POD' ? 'document.pod_uploaded' : 'document.uploaded', description: `Super Admin uploaded a ${type} document.`, context },
  });
  if (type === 'POD' && association.shipment) await notifyPod(association.shipment, document);
  return document;
}

export async function adminUpdate({ documentId, changes, user, context }) {
  const document = await Document.findOne({ _id: documentId, archivedAt: null });
  if (!document) throw ApiError.notFound('Document not found.');
  const changed = [];
  if (changes.name !== undefined && changes.name !== document.name) { document.name = changes.name; changed.push('name'); }
  if (changes.type !== undefined && changes.type !== document.type) { document.type = changes.type; changed.push('type'); }

  let association = null;
  if (changes.relatedEntityType) {
    association = await resolveAssociation(changes.relatedEntityType, changes.relatedEntityId);
    document.relatedEntityType = association.relatedEntityType;
    document.relatedEntityId = association.relatedEntityId;
    document.customerId = association.customerId ?? undefined;
    document.carrierId = association.carrierId ?? undefined;
    changed.push('relatedEntity');
  }
  const visibility = changes.visibility ?? document.visibility;
  if (changes.visibility !== undefined && changes.visibility !== document.visibility) { document.visibility = changes.visibility; changed.push('visibility'); }
  if (changed.length === 0) return document.toObject();
  assertVisibilityFits(visibility, association ?? { customerId: document.customerId, carrierId: document.carrierId });
  await document.save();
  await recordActivity({ userId: user._id, action: 'document.updated', module: 'documents', entityId: document._id, description: 'Super Admin updated document details.', metadata: { changedFields: changed, documentType: document.type }, context });
  return document.toObject();
}

export async function adminArchive({ documentId, user, context }) {
  const document = await Document.findOne({ _id: documentId });
  if (!document) throw ApiError.notFound('Document not found.');
  if (document.archivedAt) throw ApiError.conflict('This document is already archived.', 'ALREADY_IN_STATE');
  document.isPrimary = false;
  await document.archive(user._id); // the stored file is kept: archiving never deletes it
  await recordActivity({ userId: user._id, action: 'document.archived', module: 'documents', entityId: document._id, description: 'Super Admin archived a document.', metadata: { documentType: document.type }, context });
  return document.toObject();
}

export async function adminRestore({ documentId, user, context }) {
  const document = await Document.findOne({ _id: documentId });
  if (!document) throw ApiError.notFound('Document not found.');
  if (!document.archivedAt) throw ApiError.conflict('Only an archived document can be restored.', 'ALREADY_IN_STATE');
  await document.restore();
  await recordActivity({ userId: user._id, action: 'document.restored', module: 'documents', entityId: document._id, description: 'Super Admin restored a document.', metadata: { documentType: document.type }, context });
  return document.toObject();
}
