/**
 * Static guards for the Phase 5 customer module (no database needed). They read the source and fail if someone later
 * reads identity from request input, or names an internal field in a customer response builder.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

const read = (name) => readFileSync(new URL(`../src/customer/${name}`, import.meta.url), 'utf8');
const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('customer module static guards', () => {
  test('controller, service and routes never read identity from request input', () => {
    for (const file of ['customer.controller.js', 'customer.service.js', 'customer.routes.js']) {
      const code = stripComments(read(file));
      assert.ok(!/req\.(body|query|params|headers)\b|req\.get\(/.test(code), `${file} reads raw request input`);
      assert.ok(!/(customerId|userId|ownerId)\s*[:=]\s*(input|body|query|params)\b/.test(code), `${file} takes an owner from input`);
    }
  });

  test('every request schema is strict, so unknown keys (customerId, role, status...) are refused', () => {
    const code = stripComments(read('customer.validator.js'));
    const bodies = ['quoteBody', 'updateProfileSchema', 'changePasswordSchema'];
    for (const name of bodies) assert.ok(code.includes(name), name);
    assert.ok((code.match(/\.strict\(\)/g) ?? []).length >= 9, 'object schemas use .strict()');
  });

  test('presenters never name an internal or secret field in code', () => {
    const code = stripComments(read('customer.presenters.js'));
    for (const field of ['carrierId', 'carrierRate', 'brokerMargin', 'internalNotes', 'estimatedRate', 'assignedTo', 'assignedBy', 'storageKey', 'fileUrl', 'uploadedBy', 'passwordHash', 'tokenVersion', 'rating', 'archivedBy', 'createdBy']) {
      assert.ok(!code.includes(field), `presenters reference ${field}`);
    }
  });

  test('the customer router is only mounted behind authenticate, requireCustomer and requireOwnerContext', () => {
    const routes = readFileSync(new URL('../src/routes/index.js', import.meta.url), 'utf8');
    assert.match(routes, /router\.use\('\/customer', authenticate, requireCustomer, requireOwnerContext, customerRoutes\)/);
  });
});
