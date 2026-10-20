/**
 * Super Admin read models for partners, documents, payments, logs and settings. Every shape is an explicit allow-list:
 * password hashes, token versions, storage keys and file URLs are never copied, even if a model grows a new field.
 */
import { getStorageDriver } from '../storage/index.js';
import { deriveApprovalStatus } from './carrierApproval.service.js';

const id = (value) => (value == null ? undefined : String(value));
const iso = (value) => (value ? new Date(value).toISOString() : null);
const money = (amount, currency) => (amount == null ? null : { amount, currency: currency ?? 'USD' });

const SENSITIVE_KEY = /pass(word)?|secret|token|authorization|cookie|api[-_]?key|credential|hash|private[-_]?key/i;
const MAX_DEPTH = 4;

/** Metadata is already rejected at write time if it looks secret; this is a second, read-time guard. */
export function safeMetadata(value, depth = 0) {
  if (value == null || depth > MAX_DEPTH) return null;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => safeMetadata(item, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [key, child] of Object.entries(value)) {
      if (SENSITIVE_KEY.test(key)) continue;
      out[key] = safeMetadata(child, depth + 1);
    }
    return out;
  }
  if (typeof value === 'string') return value.slice(0, 300);
  return value;
}

const address = (value) =>
  value
    ? { street: value.street ?? null, city: value.city ?? null, state: value.state ?? null, zipCode: value.zipCode ?? null, country: value.country ?? null }
    : null;

const accountView = (user) =>
  user
    ? { email: user.email, isActive: user.isActive !== false, isEmailVerified: Boolean(user.isEmailVerified), lastLogin: iso(user.lastLogin), createdAt: iso(user.createdAt) }
    : null;

export function presentCustomer(customer, { user, counts, detail = false } = {}) {
  return {
    id: id(customer._id),
    companyName: customer.companyName,
    contactPerson: customer.contactPerson ?? null,
    email: customer.email ?? null,
    phone: customer.phone ?? null,
    status: customer.status,
    address: address(customer.address),
    createdAt: iso(customer.createdAt),
    updatedAt: iso(customer.updatedAt),
    ...(detail
      ? {
          account: accountView(user),
          billing: customer.billingInformation
            ? {
                contactName: customer.billingInformation.contactName ?? null,
                email: customer.billingInformation.email ?? null,
                phone: customer.billingInformation.phone ?? null,
                address: address(customer.billingInformation.address),
                paymentTermsDays: customer.billingInformation.paymentTermsDays ?? null,
              }
            : null,
          internalNotes: customer.notes ?? null,
          counts,
        }
      : {}),
  };
}

const insuranceView = (insurance) =>
  insurance
    ? {
        provider: insurance.provider ?? null,
        policyNumber: insurance.policyNumber ?? null,
        liabilityCoverage: money(insurance.liabilityCoverage, insurance.currency),
        cargoCoverage: money(insurance.cargoCoverage, insurance.currency),
        effectiveDate: iso(insurance.effectiveDate),
        expirationDate: iso(insurance.expirationDate),
        expired: insurance.expirationDate ? new Date(insurance.expirationDate) < new Date() : null,
      }
    : null;

export function presentCarrier(carrier, { user, counts, detail = false } = {}) {
  return {
    id: id(carrier._id),
    companyName: carrier.companyName,
    contactPerson: carrier.contactPerson ?? null,
    email: carrier.email ?? null,
    phone: carrier.phone ?? null,
    MCNumber: carrier.MCNumber ?? null,
    DOTNumber: carrier.DOTNumber ?? null,
    status: carrier.status,
    authorityStatus: carrier.authorityStatus,
    complianceStatus: carrier.complianceStatus,
    // Derived on the server; the admin panel only displays it and never decides eligibility itself.
    approvalStatus: deriveApprovalStatus(carrier),
    equipmentTypes: carrier.equipmentTypes ?? [],
    operatingRegions: carrier.operatingRegions ?? [],
    crossBorderCapability: Boolean(carrier.crossBorderCapability),
    createdAt: iso(carrier.createdAt),
    updatedAt: iso(carrier.updatedAt),
    ...(detail
      ? {
          address: address(carrier.address),
          insurance: insuranceView(carrier.insurance),
          rating: carrier.rating ?? null,
          account: accountView(user),
          internalNotes: carrier.notes ?? null,
          documentCount: (carrier.documents ?? []).length,
          counts,
        }
      : {}),
  };
}

export function presentApplication(application, { detail = false, reviewer } = {}) {
  return {
    id: id(application._id),
    companyName: application.companyName,
    contactPerson: application.contactPerson,
    email: application.email,
    phone: application.phone,
    MCNumber: application.MCNumber ?? null,
    DOTNumber: application.DOTNumber ?? null,
    status: application.status,
    equipmentTypes: application.equipmentTypes ?? [],
    crossBorderCapability: Boolean(application.crossBorderCapability),
    createdAt: iso(application.createdAt),
    ...(detail
      ? {
          address: address(application.address),
          operatingRegions: application.operatingRegions ?? [],
          documentCount: (application.submittedDocuments ?? []).length,
          reviewedAt: iso(application.reviewedAt),
          reviewedBy: reviewer ?? null,
          rejectionReason: application.rejectionReason ?? null,
          carrierId: id(application.carrierId) ?? null,
          applicantNotes: application.applicantNotes ?? null,
          internalNotes: application.notes ?? null,
          updatedAt: iso(application.updatedAt),
        }
      : {}),
  };
}

/** A website contact message. The list view leaves the message body out; the detail view carries it. */
export function presentContactMessage(message, { detail = false, handler } = {}) {
  return {
    id: id(message._id),
    name: message.name,
    company: message.company ?? null,
    email: message.email,
    phone: message.phone ?? null,
    interest: message.interest,
    subject: message.subject,
    status: message.status,
    createdAt: iso(message.createdAt),
    handledAt: iso(message.handledAt),
    ...(detail ? { message: message.message, handledBy: handler ?? null, updatedAt: iso(message.updatedAt) } : {}),
  };
}

const PREVIEWABLE = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

/** Phase 10: a file can be opened only when it was stored by the provider that is configured now. File locations are never exposed. */
export function documentDownload(document) {
  const driver = getStorageDriver();
  if (!document.storageProvider) return { available: false, reason: 'This record has no stored file.' };
  if (!driver || driver.name !== document.storageProvider) return { available: false, reason: 'Document storage is not configured yet.' };
  return { available: true };
}

export function presentDocument(document, { customer, carrier, uploader, related } = {}) {
  return {
    id: id(document._id),
    name: document.name,
    originalFileName: document.originalFileName ?? null,
    type: document.type,
    mimeType: document.mimeType ?? null,
    fileSize: document.fileSize ?? null,
    visibility: document.visibility,
    status: document.archivedAt ? 'archived' : 'uploaded',
    isArchived: Boolean(document.archivedAt),
    isPrimary: Boolean(document.isPrimary),
    previewable: PREVIEWABLE.has(document.mimeType),
    relatedEntityType: document.relatedEntityType,
    relatedEntityId: id(document.relatedEntityId),
    related: related ?? null,
    customer: customer ? { id: id(customer._id), companyName: customer.companyName } : null,
    carrier: carrier ? { id: id(carrier._id), companyName: carrier.companyName } : null,
    uploadedBy: uploader ?? null,
    uploadedByRole: document.uploadedByRole ?? null,
    download: documentDownload(document),
    createdAt: iso(document.createdAt),
    updatedAt: iso(document.updatedAt),
    archivedAt: iso(document.archivedAt),
  };
}

export function presentPayment(payment, { load, customer, carrier, detail = false } = {}) {
  return {
    id: id(payment._id),
    paymentType: payment.paymentType,
    status: payment.status,
    amount: money(payment.amount, payment.currency),
    referenceNumber: payment.referenceNumber ?? null,
    paymentDate: iso(payment.paymentDate),
    load: load ? { id: id(load._id), loadNumber: load.loadNumber } : { id: id(payment.loadId), loadNumber: null },
    customer: customer ? { id: id(customer._id), companyName: customer.companyName } : null,
    carrier: carrier ? { id: id(carrier._id), companyName: carrier.companyName } : null,
    createdAt: iso(payment.createdAt),
    ...(detail ? { updatedAt: iso(payment.updatedAt), internalNotes: payment.notes ?? null } : {}),
  };
}

export function presentNotification(notification) {
  return {
    id: id(notification._id),
    type: notification.type,
    title: notification.title,
    message: notification.message,
    isRead: Boolean(notification.isRead),
    relatedEntity: notification.relatedEntity ? { entityType: notification.relatedEntity.entityType, entityId: id(notification.relatedEntity.entityId) } : null,
    createdAt: iso(notification.createdAt),
  };
}

const FAILURE_ACTION = /fail|denied|reject|error|locked/i;
export const resultOf = (action) => (FAILURE_ACTION.test(action ?? '') ? 'failure' : 'success');

export function presentActivity(entry, { actor } = {}) {
  return {
    id: id(entry._id),
    createdAt: iso(entry.createdAt),
    actor: actor ?? null,
    action: entry.action,
    module: entry.module,
    entityId: id(entry.entityId) ?? null,
    description: entry.description ?? null,
    result: resultOf(entry.action),
    ipAddress: entry.IPAddress ?? null,
    metadata: safeMetadata(entry.metadata),
  };
}

export function presentSettings(settings) {
  if (!settings) return null;
  const asset = (value) => (value?.url ? { url: value.url, alt: value.altText ?? null } : null);
  return {
    companyName: settings.companyName,
    websiteTitle: settings.websiteTitle ?? null,
    tagline: settings.tagline ?? null,
    description: settings.description ?? null,
    phone: settings.phone ?? null,
    email: settings.email ?? null,
    address: address(settings.address),
    timezone: settings.timezone ?? null,
    copyrightText: settings.copyrightText ?? null,
    logo: asset(settings.logo),
    favicon: asset(settings.favicon),
    businessHours: (settings.businessHours ?? []).map((row) => ({ day: row.day, isClosed: Boolean(row.isClosed), opensAt: row.opensAt ?? null, closesAt: row.closesAt ?? null })),
    socialLinks: (settings.socialLinks ?? []).map((link) => ({ platform: link.platform, url: link.url })),
    updatedAt: iso(settings.updatedAt),
  };
}
