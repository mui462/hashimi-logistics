/**
 * Account-status notices (email verification, carrier approval) in the customer and carrier portals, and the Super Admin
 * carrier approval controls. Rendered in jsdom through the real router; only the transport is mocked. Run with: npm test
 */
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { act, createHarness, page } from './cms-harness.mjs';

const empty = () => ({ data: page([], { unreadCount: 0 }) });
const customerProfile = (isEmailVerified) => () => ({
  data: {
    account: { firstName: 'Casey', lastName: 'Customer', email: 'casey@example.com', phone: null, isEmailVerified, lastLogin: null, memberSince: '2026-09-01T12:00:00.000Z' },
    company: { companyName: 'Acme Freight', contactPerson: 'Dispatch', businessEmail: null, phone: null, address: null, billing: null, status: 'active' },
  },
});
const carrierProfile = () => ({
  data: {
    account: { firstName: 'Kai', lastName: 'Carrier', email: 'k@example.com', phone: null, isEmailVerified: true, lastLogin: null, memberSince: '2026-09-01T12:00:00.000Z' },
    company: { companyName: 'Hauler Trucking', contactPerson: 'Dispatch', businessEmail: null, phone: null, address: null, equipmentTypes: [], operatingRegions: [], crossBorderCapability: false, mcNumber: null, dotNumber: null, authorityStatus: 'pending', complianceStatus: 'pending', status: 'pending' },
  },
});
const accountStatus = (approvalStatus, isEmailVerified = true) => () => ({ data: { approvalStatus, isEmailVerified, canAccessLoadBoard: approvalStatus === 'approved', message: 'server message' } });
const adminCarrier = (approvalStatus, extra = {}) => () => ({
  data: {
    carrier: {
      id: 'k1', companyName: 'Alpha Trucking LLC', contactPerson: 'Kai', email: 'kai@alpha.test', phone: null, MCNumber: null, DOTNumber: null, status: 'pending', authorityStatus: 'pending', complianceStatus: 'pending', approvalStatus,
      equipmentTypes: [], operatingRegions: [], crossBorderCapability: false, createdAt: '2026-09-01T12:00:00.000Z', updatedAt: '2026-09-01T12:00:00.000Z', address: null, insurance: null, rating: null,
      account: { email: 'kai@alpha.test', isActive: true, isEmailVerified: true, lastLogin: null, createdAt: '2026-09-01T12:00:00.000Z' }, internalNotes: null, documentCount: 0, counts: { loads: 0, active: 0, completed: 0 }, recentLoads: [], ...extra,
    },
  },
});

describe('account status and approval controls', () => {
  let h;
  before(async () => { h = await createHarness(); });
  after(async () => { await h.close(); });

  const customerPage = (verified, extra = {}) =>
    h.visit('/customer/profile', { as: 'customer', routes: { 'GET /customer/profile': customerProfile(verified), 'GET /customer/notifications': empty, ...extra } });
  const carrierPage = (status, extra = {}) =>
    h.visit('/carrier/profile', { as: 'carrier', routes: { 'GET /carrier/profile': carrierProfile, 'GET /carrier/notifications': empty, 'GET /carrier/account-status': status, ...extra } });
  const notice = (title) => [...document.querySelectorAll('section[role="status"]')].find((node) => node.getAttribute('aria-label') === title);

  describe('customer', () => {
    test('an unverified customer sees "Email verification required" with a resend button that uses the existing endpoint', async () => {
      const view = await customerPage(false, { 'POST /auth/resend-verification': () => ({ data: {}, message: 'Confirmation email sent.' }) });
      const banner = notice('Email verification required');
      assert.ok(banner, 'banner is shown');
      assert.match(banner.textContent, /Requesting and accepting quotes is locked/);
      await h.click(h.button('Resend confirmation email', banner));
      assert.equal(h.called('POST /auth/resend-verification').length, 1);
      assert.match(banner.textContent, /Confirmation email sent\./);
      await view.unmount();
    });

    test('a verified customer sees no banner', async () => {
      const view = await customerPage(true);
      assert.ok(!notice('Email verification required'), 'no banner for a verified customer');
      await view.unmount();
    });
  });

  describe('carrier', () => {
    for (const [approval, title, pattern] of [
      ['pending', 'Pending approval', /waiting for approval.*Available loads unlock/],
      ['rejected', 'Not approved', /was not approved/],
      ['suspended', 'Account suspended', /suspended/],
      ['deactivated', 'Account deactivated', /not active/],
    ]) {
      test(`${approval}: shows "${title}" and what it means`, async () => {
        const view = await carrierPage(accountStatus(approval));
        await h.tick(60);
        const banner = notice(title);
        assert.ok(banner, `${title} banner`);
        assert.match(banner.textContent, pattern);
        await view.unmount();
      });
    }

    test('approved: no restriction banner; an unverified email still gets its own notice', async () => {
      let view = await carrierPage(accountStatus('approved'));
      await h.tick(60);
      assert.equal(document.querySelectorAll('section[role="status"]').length, 0);
      await view.unmount();
      view = await carrierPage(accountStatus('approved', false));
      await h.tick(60);
      assert.ok(notice('Email verification required'));
      await view.unmount();
    });

    test('a suspended carrier whose portal data is blocked (403) still sees why', async () => {
      const blocked = () => ({ status: 403, body: { message: 'This account is not active. Please contact support.' } });
      const view = await carrierPage(accountStatus('suspended'), { 'GET /carrier/profile': blocked });
      await h.tick(60);
      assert.ok(notice('Account suspended'));
      await view.unmount();
    });
  });

  describe('Super Admin carrier approval controls', () => {
    const buttonsFor = (approval) => ['Approve carrier', 'Reject', 'Suspend', 'Reactivate'].filter((label) => h.button(label));
    const adminPage = (approval, extra = {}) => h.visit('/admin/carriers/k1', { as: 'super_admin', routes: { 'GET /admin/carriers/k1': adminCarrier(approval), 'GET /admin/notifications': empty, ...extra } });

    for (const [approval, expected] of [
      ['pending', ['Approve carrier', 'Reject', 'Suspend']],
      ['approved', ['Reject', 'Suspend']],
      ['rejected', ['Approve carrier', 'Suspend']],
      ['suspended', ['Reactivate']],
      ['deactivated', ['Reactivate']],
    ]) {
      test(`${approval}: offers exactly ${expected.join(', ')}`, async () => {
        const view = await adminPage(approval);
        assert.deepEqual(buttonsFor(approval), expected);
        await view.unmount();
      });
    }

    test('approving asks for confirmation, posts to the approve endpoint with no status in the body, and reloads', async () => {
      let approved = false;
      const view = await adminPage('pending', {
        'POST /admin/carriers/k1/approve': () => { approved = true; return { data: { id: 'k1', approvalStatus: 'approved' } }; },
        'GET /admin/carriers/k1': () => adminCarrier(approved ? 'approved' : 'pending')(),
      });
      await h.click(h.button('Approve carrier'));
      assert.ok(h.dialog(), 'a confirmation dialog opens first');
      assert.equal(h.called('POST /admin/carriers/k1/approve').length, 0, 'nothing is sent before confirming');
      await h.click(h.button('Approve carrier', h.dialog()));
      await h.tick(80);
      const [request] = h.called('POST /admin/carriers/k1/approve');
      assert.deepEqual(request.body, {});
      assert.deepEqual(buttonsFor('approved'), ['Reject', 'Suspend']);
      await view.unmount();
    });

    test('rejecting requires a reason, which is the only thing sent', async () => {
      const view = await adminPage('pending', { 'POST /admin/carriers/k1/reject': () => ({ data: { id: 'k1', approvalStatus: 'rejected' } }) });
      await h.click(h.button('Reject'));
      await h.click(h.button('Reject', h.dialog()));
      assert.equal(h.called('POST /admin/carriers/k1/reject').length, 0, 'empty reason is not sent');
      await h.fill({ 'Reason (required)': 'Authority could not be verified' }, h.dialog());
      await h.click(h.button('Reject', h.dialog()));
      await h.tick(80);
      assert.deepEqual(h.called('POST /admin/carriers/k1/reject')[0].body, { reason: 'Authority could not be verified' });
      await view.unmount();
    });

    test('a refusal from the server (for example a conflicting change) is shown and nothing else happens', async () => {
      const view = await adminPage('pending', { 'POST /admin/carriers/k1/approve': () => ({ status: 409, body: { message: 'This carrier was changed by someone else. Reload and try again.', code: 'CONCURRENT_CHANGE' } }) });
      await h.click(h.button('Approve carrier'));
      await h.click(h.button('Approve carrier', h.dialog()));
      await h.tick(80);
      assert.ok(document.body.textContent.includes('changed by someone else') || document.body.textContent.includes('That did not work'));
      await view.unmount();
    });

    test('carrier applications: a pending one can be approved only after confirming; a decided one has no buttons', async () => {
      const application = (status) => () => ({ data: { application: { id: 'a1', companyName: 'Applicant Haulage', contactPerson: 'A', email: 'a@example.com', phone: '1', MCNumber: null, DOTNumber: null, status, equipmentTypes: [], crossBorderCapability: false, createdAt: '2026-10-05T12:00:00.000Z', address: null, operatingRegions: [], documentCount: 0, reviewedAt: null, reviewedBy: null, rejectionReason: null, carrierId: null, internalNotes: null, updatedAt: '2026-10-05T12:00:00.000Z' } } });
      let view = await h.visit('/admin/carrier-applications/a1', { as: 'super_admin', routes: { 'GET /admin/carrier-applications/a1': application('pending'), 'GET /admin/notifications': empty, 'POST /admin/carrier-applications/a1/decision': () => ({ data: { id: 'a1', status: 'approved' } }) } });
      await h.click(h.button('Approve application'));
      assert.equal(h.called('POST /admin/carrier-applications/a1/decision').length, 0);
      await h.click(h.button('Approve application', h.dialog()));
      await h.tick(80);
      assert.deepEqual(h.called('POST /admin/carrier-applications/a1/decision')[0].body, { decision: 'approved' });
      await view.unmount();
      view = await h.visit('/admin/carrier-applications/a1', { as: 'super_admin', routes: { 'GET /admin/carrier-applications/a1': application('approved'), 'GET /admin/notifications': empty } });
      assert.ok(!h.button('Approve application') && !h.button('Reject application'));
      await view.unmount();
    });

    test('customers and carriers cannot open the admin carrier page, and signed-out visitors go to the admin sign-in', async () => {
      for (const [as, home] of [['customer', '/customer'], ['carrier', '/carrier']]) {
        const view = await h.visit('/admin/carriers/k1', { as, routes: { 'GET /customer/notifications': empty, 'GET /carrier/notifications': empty, 'GET /customer/profile': customerProfile(true), 'GET /carrier/profile': carrierProfile, 'GET /carrier/account-status': accountStatus('approved') }, wait: false });
        for (let attempt = 0; attempt < 60 && !view.path().startsWith(home); attempt += 1) await h.tick(50);
        assert.ok(view.path().startsWith(home), `${as} ended on ${view.path()}`);
        assert.equal(h.called('GET /admin/carriers/k1').length, 0, 'the admin API was never called');
        await view.unmount();
      }
      const view = await h.visit('/admin/carriers/k1', { as: null });
      assert.equal(view.path(), '/admin/login');
      await view.unmount();
    });
  });
});
