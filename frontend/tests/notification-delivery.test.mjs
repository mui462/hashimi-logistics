/**
 * Phase 11 UI: email / text notification settings (customer, carrier, Super Admin) and the Super Admin delivery log.
 * Rendered in jsdom through the real router and axios client; only the transport is mocked. No message is ever sent.
 * Run with: npm test
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { createHarness, page, ROOT } from './cms-harness.mjs';

const stamp = '2026-10-01T12:00:00.000Z';
const prefs = (extra = {}, channels = {}) => ({
  preferences: { emailNotifications: true, smsNotifications: false, quoteNotifications: true, shipmentNotifications: true, documentNotifications: true, ...extra },
  channels: { emailAvailable: true, smsAvailable: true, smsPhoneOnFile: true, ...channels },
  securityEmailsAlwaysSent: true,
});
const note = { id: 'n1', type: 'shipment', title: 'Shipment picked up', message: 'Your freight is on its way.', isRead: false, relatedEntity: null, createdAt: stamp };
const delivery = (extra = {}) => ({
  id: 'x'.repeat(24), channel: 'EMAIL', category: 'notification', type: 'quote', status: 'SENT', provider: 'resend', attemptCount: 1, maxAttempts: 5,
  providerMessageId: 'msg_1', lastError: null, nextAttemptAt: null, sentAt: stamp, createdAt: stamp, failed: false,
  recipient: { userId: 'u1', role: 'customer', name: 'Casey Customer', email: 'c***@example.com' }, ...extra,
});
const LOG = (items, extra = {}) => ({ ...page(items), counts: { QUEUED: 0, PROCESSING: 0, SENT: 1, FAILED: 0, RETRYING: 0, CANCELLED: 0 }, providers: { email: { configured: true, provider: 'resend' }, sms: { configured: false, provider: null } }, ...extra });

describe('Phase 11 notification settings and delivery log UI', () => {
  let h;
  const portalBase = {
    'GET /customer/profile': () => ({ data: { account: { firstName: 'Casey', lastName: 'Customer', email: 'casey@example.com', phone: null, isEmailVerified: true, lastLogin: stamp, memberSince: stamp }, company: { companyName: 'Acme Freight', status: 'active' } } }),
    'GET /customer/notifications': () => ({ data: page([note], { unreadCount: 1 }) }),
    'GET /carrier/notifications': () => ({ data: page([note], { unreadCount: 1 }) }),
    'GET /admin/notifications': () => ({ data: page([note], { unreadCount: 1 }) }),
  };
  const visit = (pathName, { as, routes = {} }) => h.visit(pathName, { as, routes: { ...portalBase, ...routes } });
  const box = (label) => h.labelled(label);

  before(async () => { h = await createHarness(); });
  after(async () => { await h.close(); });

  describe('settings panel', () => {
    for (const [scope, as] of [['customer', 'customer'], ['carrier', 'carrier'], ['admin', 'super_admin']]) {
      test(`${scope}: loads that account's own settings from ${scope}/notification-preferences and explains security emails`, async () => {
        const view = await visit(`/${scope}/notifications`, { as, routes: { [`GET /${scope}/notification-preferences`]: () => ({ data: prefs() }) } });
        assert.equal(h.called(`GET /${scope}/notification-preferences`).length, 1);
        assert.match(h.text(), /Email and text message settings/);
        assert.match(h.text(), /always sent and cannot be turned off/);
        assert.equal(box('Email notifications').checked, true);
        assert.equal(box('Text message notifications').checked, false);
        assert.equal(box('Quotes').checked, true);
        await view.unmount();
      });
    }

    test('toggling a setting sends only that one field (never a role, id or other key) and confirms the save accessibly', async () => {
      const view = await visit('/customer/notifications', { as: 'customer', routes: {
        'GET /customer/notification-preferences': () => ({ data: prefs() }),
        'PUT /customer/notification-preferences': ({ body }) => ({ data: prefs(body) }),
      } });
      await h.click(box('Email notifications'));
      const [put] = h.called('PUT /customer/notification-preferences');
      assert.deepEqual(put.body, { emailNotifications: false });
      assert.equal(box('Email notifications').checked, false);
      assert.match(document.querySelector('[aria-live="polite"]').textContent, /Notification settings saved\./);
      await h.click(box('Documents'));
      assert.deepEqual(h.called('PUT /customer/notification-preferences')[1].body, { documentNotifications: false });
      await view.unmount();
    });

    test('text messages cannot be turned on without a phone number, and the page says why; unavailable email is stated honestly', async () => {
      const view = await visit('/customer/notifications', { as: 'customer', routes: { 'GET /customer/notification-preferences': () => ({ data: prefs({}, { smsPhoneOnFile: false, emailAvailable: false }) }) } });
      assert.equal(box('Text message notifications').disabled, true);
      assert.match(h.text(), /Add a valid mobile number to your profile/);
      assert.match(h.text(), /Email delivery is not set up on this system yet, so no emails are sent\./);
      await view.unmount();
    });

    test('a server refusal is shown in words and the checkbox shows the saved truth', async () => {
      const view = await visit('/customer/notifications', { as: 'customer', routes: {
        'GET /customer/notification-preferences': () => ({ data: prefs({}, { smsPhoneOnFile: true }) }),
        'PUT /customer/notification-preferences': () => ({ status: 422, body: { message: 'Please correct the highlighted fields.', errors: [{ field: 'smsNotifications', message: 'Add a valid mobile number to your profile before turning on text messages.' }] } }),
      } });
      await h.click(box('Text message notifications'));
      assert.match(document.querySelector('[aria-live="polite"]').textContent, /valid mobile number/);
      assert.equal(box('Text message notifications').checked, false);
      await view.unmount();
    });

    test('a failed load offers a retry instead of an empty form', async () => {
      let attempts = 0;
      const view = await visit('/carrier/notifications', { as: 'carrier', routes: { 'GET /carrier/notification-preferences': () => (++attempts === 1 ? { status: 500, body: { message: 'Server error' } } : { data: prefs() }) } });
      assert.match(h.text(), /We could not load your notification settings/);
      await h.click(h.button('Try again'));
      assert.equal(box('Email notifications').checked, true);
      await view.unmount();
    });
  });

  describe('Super Admin delivery log', () => {
    test('lists deliveries with provider, status in plain words, masked recipient and attempts, and never shows bodies or secrets', async () => {
      const failed = delivery({ id: 'f'.repeat(24), status: 'FAILED', failed: true, attemptCount: 5, sentAt: null, providerMessageId: null, lastError: 'http_503: Provider returned HTTP 503.' });
      const sms = delivery({ id: 's'.repeat(24), channel: 'SMS', status: 'QUEUED', sentAt: null, provider: null, attemptCount: 0, recipient: { userId: 'u2', role: 'carrier', name: 'Kai Carrier' } });
      const inApp = delivery({ id: 'i'.repeat(24), channel: 'IN_APP', provider: 'in_app', attemptCount: 1 });
      const view = await visit('/admin/notification-deliveries', { as: 'super_admin', routes: { 'GET /admin/notification-deliveries': () => ({ data: LOG([delivery(), failed, sms, inApp], { counts: { QUEUED: 1, PROCESSING: 0, SENT: 2, FAILED: 1, RETRYING: 0, CANCELLED: 0 } }) }) } });
      assert.equal(h.h1(), 'Delivery log');
      const headers = [...document.querySelectorAll('thead th')].map((th) => th.textContent);
      for (const header of ['Created', 'Message', 'Recipient', 'Status', 'Provider', 'Provider accepted', 'Failure']) assert.ok(headers.includes(header), header);
      const text = h.text();
      for (const expected of ['Email: resend', 'Text messages: not configured (nothing is sent)', 'Sent to provider: 2', 'Failed: 1', 'c***@example.com', 'Attempts: 5 of 5', 'http_503: Provider returned HTTP 503.', 'Text message', 'In-app']) assert.ok(text.includes(expected), expected);
      assert.match(text, /does not prove the recipient received it/);
      assert.ok(!/@example\.com/.test(text.replace(/c\*\*\*@example\.com/g, '')), 'only the masked address appears');
      assert.ok(!/token|secret|password/i.test(text.replace(/Message text, addresses and secrets are never shown here\./, '')));
      await view.unmount();
    });

    test('filters are sent to the server, not applied in the browser', async () => {
      const view = await visit('/admin/notification-deliveries?status=FAILED&channel=EMAIL', { as: 'super_admin', routes: { 'GET /admin/notification-deliveries': ({ params }) => ({ data: LOG(params.status === 'FAILED' ? [delivery({ status: 'FAILED', failed: true })] : [delivery()]) }) } });
      const [call] = h.called('GET /admin/notification-deliveries');
      assert.deepEqual(call.params, { status: 'FAILED', channel: 'EMAIL' });
      await view.unmount();
    });

    test('only failed notification rows offer "Queue again"; it posts no body fields and refreshes the list', async () => {
      let rows = [delivery({ id: 'f'.repeat(24), status: 'FAILED', failed: true, lastError: 'http_503: Provider returned HTTP 503.' }), delivery({ id: 'a'.repeat(24) }), delivery({ id: 'b'.repeat(24), status: 'FAILED', failed: true, category: 'security', type: 'auth' })];
      const retryKey = `POST /admin/notification-deliveries/${'f'.repeat(24)}/retry`;
      const view = await visit('/admin/notification-deliveries', { as: 'super_admin', routes: {
        'GET /admin/notification-deliveries': () => ({ data: LOG(rows) }),
        [retryKey]: () => { rows = [delivery({ id: 'f'.repeat(24), status: 'QUEUED', sentAt: null })]; return { data: {} }; },
      } });
      const buttons = [...document.querySelectorAll('button')].filter((b) => /Queue again/.test(b.getAttribute('aria-label') ?? ''));
      // The table and the phone-width card list are both in the DOM (CSS shows one), so the single failed row appears twice.
      assert.equal(buttons.length, 2, 'only the one failed notification row: not the sent row and not the account-security email');
      await h.click(buttons[0]);
      assert.equal(h.called(retryKey).length, 1);
      assert.deepEqual(h.called(retryKey)[0].body ?? {}, {});
      assert.equal(h.called('GET /admin/notification-deliveries').length, 2, 'list reloaded');
      await view.unmount();
    });

    test('customers and carriers cannot open the delivery log and it requests nothing', async () => {
      for (const as of ['customer', 'carrier']) {
        const view = await visit('/admin/notification-deliveries', { as });
        assert.equal(h.called('GET /admin/notification-deliveries').length, 0, as);
        assert.ok(!/Delivery log/.test(h.h1()), as);
        await view.unmount();
      }
    });

    test('the Super Admin navigation links to the delivery log', async () => {
      const view = await visit('/admin/notifications', { as: 'super_admin', routes: { 'GET /admin/notification-preferences': () => ({ data: prefs() }) } });
      assert.ok(h.link('Delivery log'), 'nav link exists');
      assert.ok(!/No email or text messages are sent/.test(h.text()), 'the old "nothing is emailed" copy is gone');
      await view.unmount();
    });
  });

  describe('static checks', () => {
    const files = ['src/components/common/NotificationPreferencesPanel.jsx', 'src/pages/admin/NotificationDeliveriesPage.jsx', 'src/services/notificationSettingsService.js'];
    test('no raw HTML injection, no browser storage and no credentials in the new files', () => {
      for (const file of files) {
        const source = readFileSync(path.join(ROOT, file), 'utf8');
        assert.ok(!/dangerouslySetInnerHTML|innerHTML|localStorage|sessionStorage/.test(source), file);
        assert.ok(!/RESEND_API_KEY|TWILIO|apiKey|authToken/i.test(source), file);
      }
    });
    test('the settings service only ever targets the three own-account endpoints and rejects other scopes', async () => {
      const { getPreferences } = await h.vite.ssrLoadModule('/src/services/notificationSettingsService.js');
      assert.throws(() => getPreferences('../admin/users'), /Unknown notification settings scope/);
    });
    test('no frontend source contains a provider key', () => {
      const walk = (dir) => readdirSync(dir).flatMap((name) => { const full = path.join(dir, name); return statSync(full).isDirectory() ? walk(full) : [full]; });
      for (const file of walk(path.join(ROOT, 'src')).filter((f) => /\.(jsx?|mjs)$/.test(f))) assert.ok(!/re_[A-Za-z0-9]{20,}|AC[0-9a-f]{32}/.test(readFileSync(file, 'utf8')), file);
    });
  });
});
