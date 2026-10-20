/**
 * Static guards for the Phase 6 carrier module (no database needed). They read the source and fail if someone later
 * reads identity from request input, or names an internal field in a carrier response builder.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

const read = (name) => readFileSync(new URL(`../src/carrier/${name}`, import.meta.url), 'utf8');
const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('carrier module static guards', () => {
  test('controller, service and routes never read identity from request input', () => {
    for (const file of ['carrier.controller.js', 'carrier.service.js', 'carrier.routes.js']) {
      const code = stripComments(read(file));
      assert.ok(!/req\.(body|query|params|headers)\b|req\.get\(/.test(code), `${file} reads raw request input`);
      assert.ok(!/(carrierId|userId|ownerId)\s*[:=]\s*(input|body|query|params)\b/.test(code), `${file} takes an owner from input`);
    }
  });

  test('every request schema is strict, so unknown keys (carrierId, role, status, MCNumber...) are refused', () => {
    const code = stripComments(read('carrier.validator.js'));
    for (const name of ['updateProfileSchema', 'changePasswordSchema', 'listMyLoadsSchema']) assert.ok(code.includes(name), name);
    assert.ok((code.match(/\.strict\(\)/g) ?? []).length >= 4, 'object schemas use .strict()');
    for (const field of ['MCNumber', 'DOTNumber', 'authorityStatus', 'complianceStatus', 'rating', 'role']) {
      assert.ok(!new RegExp(`^\\s*${field}\\s*:`, 'm').test(code), `profile schema must not accept ${field}`);
    }
  });

  test('presenters never name an internal, customer-identity, customer-money or secret field in code', () => {
    const code = stripComments(read('carrier.presenters.js'));
    const forbidden = ['customerId', 'quoteId', 'brokerMargin', 'internalNotes', 'estimatedRate', 'assignedTo', 'assignedBy', 'storageKey', 'fileUrl', 'uploadedBy', 'passwordHash', 'tokenVersion', 'rating', 'archivedBy', 'createdBy', 'contactName', 'contactPhone', 'contactEmail', 'notes', 'insurance'];
    for (const field of forbidden) assert.ok(!new RegExp(`\\b${field}\\b`).test(code), `presenters reference ${field}`);
    assert.ok(!/\.rate\b/.test(code), 'presenters must not read the customer rate');
  });

  test('the service reads Load/Shipment/Payment only through the carrier projection', () => {
    const code = stripComments(read('carrier.service.js'));
    assert.match(code, /selectionFor\(modelName, ROLE\)/);
    assert.match(code, /ROLE = ACCOUNT_TYPES\.CARRIER/);
    assert.ok(!/\+rate|\+brokerMargin|\+assignedBy|\+storageKey|\+notes|\+rating/.test(code), 'the carrier service must not opt in to hidden fields');
  });

  test('the carrier router is only mounted behind authenticate, requireCarrier and requireOwnerContext', () => {
    const routes = readFileSync(new URL('../src/routes/index.js', import.meta.url), 'utf8');
    assert.match(routes, /router\.use\('\/carrier', authenticate, requireCarrier, requireOwnerContext, carrierRoutes\)/);
  });
});
