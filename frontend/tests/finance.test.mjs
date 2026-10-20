/**
 * Phase 12 UI: Super Admin finance (overview, invoices, payables, payment records), the customer Billing pages and the
 * carrier Payables pages. Rendered in jsdom through the real router and axios client; only the transport is mocked, so no
 * money moves and no gateway is contacted. Run with: npm test
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { createHarness, page, ROOT } from './cms-harness.mjs';

const stamp = '2026-10-01T12:00:00.000Z';
const tx = (extra = {}) => ({ id: 't1', kind: 'customer_receipt', entryType: 'payment', status: 'succeeded', amount: 30000, currency: 'USD', method: 'bank_transfer', source: 'manual', confirmation: 'admin_recorded', reference: 'WIRE-9', paymentDate: '2026-10-01', invoiceId: 'i1', payableId: null, recordedAt: stamp, reversalReason: null, failureNote: null, ...extra });
const invoice = (extra = {}) => ({
  id: 'i1', invoiceNumber: 'INV-2026-000001', customerId: 'c1', customerName: 'Acme Freight', loadId: 'l1', loadNumber: 'LD-2026-000001', currency: 'USD',
  lineItems: [{ description: 'Linehaul Chicago to Dallas', quantity: 1, unitAmount: 100000, amount: 100000 }], subtotal: 100000, total: 100000, amountPaid: 0, outstanding: 100000,
  status: 'issued', isOverdue: false, issueDate: '2026-10-01', dueDate: '2026-10-31', customerNote: null, internalNotes: 'INTERNAL-ONLY', transactions: [], ...extra,
});
const payable = (extra = {}) => ({ id: 'p1', payableNumber: 'CP-2026-000001', carrierId: 'k1', carrierName: 'Road Runner LLC', loadId: 'l1', loadNumber: 'LD-2026-000001', currency: 'USD', amount: 80000, amountSource: 'load_carrier_rate', amountPaid: 0, outstanding: 80000, status: 'approved', dueDate: null, approvedAt: stamp, holdReason: null, adjustments: [], transactions: [], internalNotes: null, ...extra });
const summary = (extra = {}) => ({
  generatedAt: stamp, basis: 'Calculated from persisted records. Receipts and payouts are administrative records, not bank-verified.', totals: { invoices: 3, payables: 1, transactions: 1 },
  perCurrency: { USD: {
    customerInvoices: { issuedCount: 3, draftCount: 1, voidCount: 0, paidCount: 1, paidInvoiceTotal: 100000, outstandingBalance: 60000, overdueCount: 1, overdueOutstanding: 40000 },
    customerReceiptsRecorded: { recordedCount: 2, recordedAmount: 110000, reversedCount: 0, failedAttempts: 0 },
    carrierPayables: { draftCount: 0, approvedCount: 0, onHoldCount: 0, partiallyPaidCount: 1, paidCount: 0, approvedOwedOutstanding: 50000, paidPayableTotal: 0 },
    carrierPayoutsRecorded: { recordedCount: 1, recordedAmount: 20000, reversedCount: 0 },
  } },
  recentActivity: [tx()], ...extra,
});
const gateway = { configured: false, provider: null, onlinePaymentAvailable: false, mode: 'manual_recording_only', status: 'NOT CONFIGURED / NOT LIVE TESTED', message: 'Online payment is not currently available. Payments are recorded manually by the Super Admin and are not bank-verified.' };
const customerInvoice = (extra = {}) => ({
  id: 'i1', invoiceNumber: 'INV-2026-000001', loadNumber: 'LD-2026-000001', currency: 'USD', subtotal: 100000, total: 100000, amountPaid: 30000, outstanding: 70000, status: 'partially_paid', isOverdue: false, issueDate: '2026-10-01', dueDate: '2026-10-31',
  lineItems: [{ description: 'Linehaul', quantity: 1, unitAmount: 100000, amount: 100000 }], customerNote: 'Thank you', payments: [{ id: 't1', entryType: 'payment', status: 'recorded', amount: 30000, currency: 'USD', method: 'bank_transfer', paymentDate: '2026-10-01' }], onlinePaymentAvailable: false, paymentInstructions: null, ...extra,
});

describe('Phase 12 finance UI', () => {
  let h;
  const base = {
    'GET /customer/profile': () => ({ data: { account: { firstName: 'Casey', lastName: 'Customer', email: 'casey@example.com', phone: null, isEmailVerified: true, lastLogin: stamp, memberSince: stamp }, company: { companyName: 'Acme Freight', status: 'active' } } }),
    'GET /customer/notifications': () => ({ data: page([], { unreadCount: 0 }) }),
    'GET /carrier/notifications': () => ({ data: page([], { unreadCount: 0 }) }),
    'GET /admin/notifications': () => ({ data: page([], { unreadCount: 0 }) }),
  };
  const visit = (p, { as = 'super_admin', routes = {} } = {}) => h.visit(p, { as, routes: { ...base, ...routes } });
  before(async () => { h = await createHarness(); });
  after(async () => { await h.close(); });

  describe('Super Admin overview', () => {
    test('shows billed, recorded and owed amounts separately with honest wording and no profit figure', async () => {
      const view = await visit('/admin/finance', { routes: { 'GET /finance/summary': () => ({ data: summary() }), 'GET /finance/payment-gateway': () => ({ data: gateway }) } });
      assert.equal(h.h1(), 'Finance overview');
      const text = h.text();
      assert.match(text, /Payment gateway: not configured/);
      assert.match(text, /Online payment is not currently available/);
      assert.match(text, /not bank-verified/);
      assert.match(text, /Customer invoices \(billed\)/);
      assert.match(text, /Customer payments recorded/);
      assert.match(text, /Carrier payables \(owed\)/);
      assert.match(text, /Carrier payouts recorded/);
      assert.match(text, /\$600\.00/);
      assert.match(text, /\$500\.00/);
      assert.doesNotMatch(text, /profit|net income|cash received/i);
      await view.unmount();
    });

    test('empty state when nothing exists yet, and the reconciliation check only reads', async () => {
      const view = await visit('/admin/finance', { routes: { 'GET /finance/summary': () => ({ data: summary({ perCurrency: {}, recentActivity: [] }) }), 'GET /finance/payment-gateway': () => ({ data: gateway }), 'GET /finance/reconciliation': () => ({ data: { consistent: true, invoices: { checked: 4, mismatches: [] }, payables: { checked: 1, mismatches: [] } } }) } });
      assert.match(h.text(), /No financial records yet/);
      await h.click(h.button('Run check'));
      assert.match(h.text(), /Consistent: 4 invoices and 1 payables checked/);
      assert.equal(h.state.calls.filter((c) => c.key.startsWith('POST')).length, 0);
      await view.unmount();
    });

    test('a reconciliation difference is announced as an alert', async () => {
      const view = await visit('/admin/finance', { routes: { 'GET /finance/summary': () => ({ data: summary() }), 'GET /finance/payment-gateway': () => ({ data: gateway }), 'GET /finance/reconciliation': () => ({ data: { consistent: false, invoices: { checked: 1, mismatches: [{ id: 'i1', number: 'INV-1', currency: 'USD', storedPaid: 7000, ledgerPaid: 5000, total: 10000 }] }, payables: { checked: 0, mismatches: [] } } }) } });
      await h.click(h.button('Run check'));
      assert.ok(document.querySelector('[role="alert"]'));
      assert.match(h.text(), /INV-1: stored \$70\.00 but entries add up to \$50\.00/);
      await view.unmount();
    });

    test('shows an error state when the summary fails', async () => {
      const view = await visit('/admin/finance', { routes: { 'GET /finance/summary': () => ({ status: 500, body: { message: 'Something went wrong on our side.' } }), 'GET /finance/payment-gateway': () => ({ data: gateway }) } });
      assert.match(h.text(), /We could not load the finance summary/);
      await view.unmount();
    });
  });

  describe('Super Admin invoices', () => {
    test('the list sends only validated filters and shows overdue next to the real status', async () => {
      const view = await visit('/admin/finance/invoices?status=overdue&q=INV', { routes: { 'GET /finance/invoices': () => ({ data: page([invoice({ isOverdue: true }), invoice({ id: 'i2', invoiceNumber: 'INV-2026-000002', status: 'paid', amountPaid: 100000, outstanding: 0 })]) }) } });
      const [call] = h.called('GET /finance/invoices');
      assert.deepEqual(call.params, { status: 'overdue', q: 'INV' });
      assert.match(h.text(), /INV-2026-000001/);
      assert.match(h.text(), /Overdue/);
      assert.ok(h.link('INV-2026-000001'));
      await view.unmount();
    });

    test('empty list explains how to start', async () => {
      const view = await visit('/admin/finance/invoices', { routes: { 'GET /finance/invoices': () => ({ data: page([]) }) } });
      assert.match(h.text(), /No invoices yet/);
      assert.ok(h.link('New invoice'));
      await view.unmount();
    });

    test('creating an invoice sends cents computed from the text amount, the load id, and nothing owned by the server', async () => {
      const view = await visit('/admin/finance/invoices/new', { routes: {
        'GET /operations/loads': () => ({ data: page([{ id: 'l1', loadNumber: 'LD-2026-000001', status: 'delivered', customer: { id: 'c1', companyName: 'Acme Freight' }, carrier: { id: 'k1', companyName: 'Road Runner LLC' }, pricing: {} }]) }),
        'POST /finance/invoices': ({ body }) => ({ status: 201, data: invoice({ id: 'i9', status: 'draft', lineItems: body.lineItems }) }),
        'GET /finance/invoices/i9': () => ({ data: invoice({ id: 'i9', status: 'draft', invoiceNumber: 'INV-2026-000009' }) }),
      } });
      await h.fill({ 'Load to invoice': 'l1', Description: 'Linehaul', Quantity: '2', 'Unit amount': '1,250.50' });
      await h.submit(document.querySelector('form'));
      const [post] = h.called('POST /finance/invoices');
      assert.deepEqual(post.body, { loadId: 'l1', lineItems: [{ description: 'Linehaul', quantity: 2, unitAmount: 125050 }] });
      for (const forbidden of ['customerId', 'status', 'total', 'currency', 'amountPaid', 'invoiceNumber']) assert.ok(!(forbidden in post.body));
      // The detail page is a lazy route; on a cold module cache it needs longer than the harness's fixed settle time.
      for (let attempt = 0; attempt < 60 && view.path() !== '/admin/finance/invoices/i9'; attempt += 1) await h.tick(50);
      assert.equal(view.path(), '/admin/finance/invoices/i9');
      await view.unmount();
    });

    test('invalid amounts are refused in the browser before any request', async () => {
      const view = await visit('/admin/finance/invoices/new', { routes: { 'GET /operations/loads': () => ({ data: page([{ id: 'l1', loadNumber: 'LD-1', status: 'open', customer: { companyName: 'A' }, carrier: null }]) }) } });
      await h.fill({ 'Load to invoice': 'l1', Description: 'x', 'Unit amount': '12.345' });
      await h.submit(document.querySelector('form'));
      assert.equal(h.called('POST /finance/invoices').length, 0);
      assert.match(h.text(), /Enter a description, a whole quantity and a unit amount/);
      await view.unmount();
    });

    test('a draft invoice offers Issue and Void but never Record payment', async () => {
      const view = await visit('/admin/finance/invoices/i1', { routes: { 'GET /finance/invoices/i1': () => ({ data: invoice({ status: 'draft' }) }) } });
      assert.ok(h.button('Issue invoice'));
      assert.ok(h.button('Void invoice'));
      assert.equal(h.button('Record payment'), undefined);
      await view.unmount();
    });

    test('issuing asks for confirmation first and explains immutability', async () => {
      const view = await visit('/admin/finance/invoices/i1', { routes: {
        'GET /finance/invoices/i1': () => ({ data: invoice({ status: 'draft' }) }),
        'POST /finance/invoices/i1/issue': () => ({ data: invoice() }),
      } });
      await h.click(h.button('Issue invoice'));
      assert.ok(h.dialog());
      assert.match(h.dialog().textContent, /can no longer be edited/);
      assert.equal(h.called('POST /finance/invoices/i1/issue').length, 0);
      await h.click(h.button('Issue invoice', h.dialog()));
      assert.deepEqual(h.called('POST /finance/invoices/i1/issue')[0].body, {});
      await view.unmount();
    });

    test('recording a payment converts text to cents, labels it manual, and sends an idempotency key with no card fields', async () => {
      const view = await visit('/admin/finance/invoices/i1', { routes: {
        'GET /finance/invoices/i1': () => ({ data: invoice() }),
        'POST /finance/invoices/i1/payments': () => ({ status: 201, data: { transaction: tx(), replayed: false } }),
      } });
      assert.match(h.text(), /not bank-verified/);
      await h.click(h.button('Record payment'));
      assert.match(h.dialog().textContent, /does not collect money and is not bank-verified/);
      assert.doesNotMatch(h.dialog().textContent, /card number|cvv|expiry/i);
      await h.fill({ 'Amount (USD)': '300.00', Reference: 'WIRE-9' }, h.dialog());
      await h.click(h.button('Record payment', h.dialog()));
      const [post] = h.called('POST /finance/invoices/i1/payments');
      assert.equal(post.body.amount, 30000);
      assert.equal(post.body.currency, 'USD');
      assert.equal(post.body.method, 'bank_transfer');
      assert.equal(post.body.reference, 'WIRE-9');
      assert.equal(post.body.outcome, 'succeeded');
      assert.match(post.body.idempotencyKey, /^ui-[A-Za-z0-9._:-]{8,}$/);
      assert.deepEqual(Object.keys(post.body).sort(), ['amount', 'currency', 'idempotencyKey', 'method', 'outcome', 'paymentDate', 'reference']);
      await view.unmount();
    });

    test('a bad amount or a missing reference is explained inside the dialog and nothing is sent', async () => {
      const view = await visit('/admin/finance/invoices/i1', { routes: { 'GET /finance/invoices/i1': () => ({ data: invoice() }) } });
      await h.click(h.button('Record payment'));
      await h.fill({ 'Amount (USD)': '10.999', Reference: 'W' }, h.dialog());
      await h.click(h.button('Record payment', h.dialog()));
      assert.match(h.dialog().textContent, /at most two decimals/);
      await h.fill({ 'Amount (USD)': '10.99', Reference: '' }, h.dialog());
      await h.click(h.button('Record payment', h.dialog()));
      assert.match(h.dialog().textContent, /Enter the reference/);
      assert.equal(h.called('POST /finance/invoices/i1/payments').length, 0);
      await view.unmount();
    });

    test('a server refusal such as an overpayment is shown and keeps the dialog open', async () => {
      const view = await visit('/admin/finance/invoices/i1', { routes: {
        'GET /finance/invoices/i1': () => ({ data: invoice() }),
        'POST /finance/invoices/i1/payments': () => ({ status: 409, body: { message: 'This payment is larger than the outstanding balance.', code: 'OVERPAYMENT' } }),
      } });
      await h.click(h.button('Record payment'));
      await h.fill({ 'Amount (USD)': '5000.00', Reference: 'W1' }, h.dialog());
      await h.click(h.button('Record payment', h.dialog()));
      assert.ok(h.dialog());
      assert.match(h.dialog().textContent, /larger than the outstanding balance/);
      await view.unmount();
    });

    test('a paid invoice cannot be paid again or voided; a payment can be reversed with a reason', async () => {
      const view = await visit('/admin/finance/invoices/i1', { routes: {
        'GET /finance/invoices/i1': () => ({ data: invoice({ status: 'partially_paid', amountPaid: 30000, outstanding: 70000, transactions: [tx()] }) }),
        'POST /finance/payments/t1/reverse': () => ({ data: { transaction: tx({ status: 'reversed' }), replayed: false } }),
      } });
      const voidButton = h.button('Void invoice');
      assert.equal(voidButton.disabled, true);
      assert.match(h.text(), /Reverse them first/);
      await h.click([...document.querySelectorAll('button')].find((b) => /^Reverse payment of/.test(b.getAttribute('aria-label') ?? '')));
      await h.fill({ Reason: 'Bank returned it' }, h.dialog());
      await h.click(h.button('Reverse payment', h.dialog()));
      assert.deepEqual(h.called('POST /finance/payments/t1/reverse')[0].body, { reason: 'Bank returned it' });
      await view.unmount();
    });

    test('downloading the PDF uses the authenticated blob endpoint', async () => {
      globalThis.URL.createObjectURL = () => 'blob:test';
      globalThis.URL.revokeObjectURL = () => {};
      const view = await visit('/admin/finance/invoices/i1', { routes: { 'GET /finance/invoices/i1': () => ({ data: invoice() }), 'GET /finance/invoices/i1/pdf': () => ({ data: new Blob(['%PDF']) }) } });
      await h.click(h.button('Download PDF'));
      assert.equal(h.called('GET /finance/invoices/i1/pdf').length, 1);
      await view.unmount();
    });

    test('an unknown invoice id shows a not-found state', async () => {
      const view = await visit('/admin/finance/invoices/zzz', { routes: { 'GET /finance/invoices/zzz': () => ({ status: 404, body: { message: 'Invoice not found.' } }) } });
      assert.match(h.text(), /That invoice was not found/);
      await view.unmount();
    });
  });

  describe('Super Admin carrier payables', () => {
    test('a draft payable can be approved; approval is described as not a payment', async () => {
      const view = await visit('/admin/finance/payables/p1', { routes: {
        'GET /finance/payables/p1': () => ({ data: payable({ status: 'draft', approvedAt: null }) }),
        'POST /finance/payables/p1/approve': () => ({ data: payable() }),
      } });
      assert.equal(h.button('Record payout'), undefined);
      await h.click(h.button('Approve payable'));
      assert.match(h.dialog().textContent, /Approval is not a payment/);
      await h.click(h.button('Approve payable', h.dialog()));
      assert.equal(h.called('POST /finance/payables/p1/approve').length, 1);
      await view.unmount();
    });

    test('recording a payout says no funds are transferred by this system', async () => {
      const view = await visit('/admin/finance/payables/p1', { routes: {
        'GET /finance/payables/p1': () => ({ data: payable() }),
        'POST /finance/payables/p1/payments': () => ({ status: 201, data: { transaction: tx({ kind: 'carrier_payout', invoiceId: null, payableId: 'p1' }), replayed: false } }),
      } });
      await h.click(h.button('Record payout'));
      assert.match(h.dialog().textContent, /does not transfer funds/);
      await h.fill({ 'Amount (USD)': '800.00', Reference: 'ACH-1' }, h.dialog());
      await h.click(h.button('Record payout', h.dialog()));
      const [post] = h.called('POST /finance/payables/p1/payments');
      assert.equal(post.body.amount, 80000);
      assert.match(post.body.idempotencyKey, /^ui-/);
      await view.unmount();
    });

    test('hold requires a reason and a held payable offers release only', async () => {
      const view = await visit('/admin/finance/payables/p1', { routes: { 'GET /finance/payables/p1': () => ({ data: payable({ status: 'on_hold', holdReason: 'POD missing' }) }) } });
      assert.ok(h.button('Release hold'));
      assert.equal(h.button('Record payout'), undefined);
      assert.match(h.text(), /Hold reason \(hidden from the carrier\)/);
      await view.unmount();
    });

    test('creating a payable lists only loads with an assigned carrier and sends no carrier id or status', async () => {
      const view = await visit('/admin/finance/payables/new', { routes: {
        'GET /operations/loads': () => ({ data: page([
          { id: 'l1', loadNumber: 'LD-1', status: 'assigned', customer: { companyName: 'A' }, carrier: { id: 'k1', companyName: 'Road Runner LLC' } },
          { id: 'l2', loadNumber: 'LD-2', status: 'open', customer: { companyName: 'B' }, carrier: null },
        ]) }),
        'POST /finance/payables': () => ({ status: 201, data: payable({ id: 'p9', status: 'draft' }) }),
        'GET /finance/payables/p9': () => ({ data: payable({ id: 'p9', status: 'draft' }) }),
      } });
      const select = h.labelled('Load');
      assert.deepEqual([...select.options].map((o) => o.textContent), ['Choose a load', 'LD-1 · Road Runner LLC']);
      await h.fill({ Load: 'l1' });
      await h.submit(document.querySelector('form'));
      assert.deepEqual(h.called('POST /finance/payables')[0].body, { loadId: 'l1' });
      await view.unmount();
    });

    test('payment records list is read only and labels entries as manual', async () => {
      const view = await visit('/admin/finance/payments', { routes: { 'GET /finance/payments': () => ({ data: page([tx()]) }) } });
      assert.match(h.text(), /not bank-verified/);
      assert.match(h.text(), /WIRE-9/);
      assert.equal(h.state.calls.filter((c) => c.key.startsWith('POST') || c.key.startsWith('PUT')).length, 0);
      await view.unmount();
    });
  });

  describe('Customer billing', () => {
    test('lists own invoices and states that online payment is not available; there is no Pay Now button', async () => {
      const view = await visit('/customer/billing', { as: 'customer', routes: { 'GET /customer/billing/invoices': () => ({ data: { ...page([customerInvoice()]), payment: gateway } }) } });
      assert.equal(h.h1(), 'Billing');
      assert.match(h.text(), /INV-2026-000001/);
      assert.match(h.text(), /Online payment is not currently available/);
      assert.equal(h.button('Pay now'), undefined);
      assert.equal(h.link('Pay now'), undefined);
      assert.doesNotMatch(h.text(), /pay now/i);
      await view.unmount();
    });

    test('the detail page shows paid and outstanding, payment history, and downloads the PDF; no internal data', async () => {
      globalThis.URL.createObjectURL = () => 'blob:test';
      globalThis.URL.revokeObjectURL = () => {};
      const view = await visit('/customer/billing/i1', { as: 'customer', routes: { 'GET /customer/billing/invoices/i1': () => ({ data: customerInvoice() }), 'GET /customer/billing/invoices/i1/pdf': () => ({ data: new Blob(['%PDF']) }) } });
      const text = h.text();
      assert.match(text, /Invoice INV-2026-000001/);
      assert.match(text, /\$700\.00/);
      assert.match(text, /Payment history/);
      assert.match(text, /Bank transfer/);
      assert.doesNotMatch(text, /INTERNAL|margin|carrier/i);
      await h.click(h.button('Download PDF'));
      assert.equal(h.called('GET /customer/billing/invoices/i1/pdf').length, 1);
      await view.unmount();
    });

    test('another customer\'s invoice id shows a not-found state', async () => {
      const view = await visit('/customer/billing/other', { as: 'customer', routes: { 'GET /customer/billing/invoices/other': () => ({ status: 404, body: { message: 'Not found.' } }) } });
      assert.match(h.text(), /That invoice was not found/);
      await view.unmount();
    });

    test('empty billing state is honest', async () => {
      const view = await visit('/customer/billing', { as: 'customer', routes: { 'GET /customer/billing/invoices': () => ({ data: { ...page([]), payment: gateway } }) } });
      assert.match(h.text(), /No invoices yet/);
      await view.unmount();
    });

    test('the legacy Invoices page keeps working', async () => {
      const view = await visit('/customer/invoices', { as: 'customer', routes: { 'GET /customer/invoices': () => ({ data: { ...page([]), summary: { outstandingCount: 0, outstandingTotals: [] } } }) } });
      assert.equal(h.h1(), 'Invoices');
      await view.unmount();
    });
  });

  describe('Carrier payables', () => {
    const carrierPayable = (extra = {}) => ({ id: 'p1', payableNumber: 'CP-2026-000001', loadNumber: 'LD-2026-000001', currency: 'USD', amount: 80000, amountPaid: 20000, outstanding: 60000, status: 'partially_paid', dueDate: null, approvedAt: stamp, ...extra });
    test('lists own payables and says approval is not a payment; the carrier has no write controls', async () => {
      const view = await visit('/carrier/payables', { as: 'carrier', routes: { 'GET /carrier/payables': () => ({ data: page([carrierPayable()]) }) } });
      assert.equal(h.h1(), 'Payables');
      assert.match(h.text(), /CP-2026-000001/);
      assert.match(h.text(), /An approved payable is not a payment/);
      assert.equal(h.button('Mark as paid'), undefined);
      assert.equal(document.querySelectorAll('main input, main textarea').length, 0);
      await view.unmount();
    });

    test('the detail shows the approved amount and recorded payments with references, and no customer data', async () => {
      const view = await visit('/carrier/payables/p1', { as: 'carrier', routes: { 'GET /carrier/payables/p1': () => ({ data: carrierPayable({ payments: [{ id: 't1', entryType: 'payment', status: 'recorded', amount: 20000, currency: 'USD', method: 'bank_transfer', paymentDate: '2026-10-02', reference: 'ACH-77' }] }) }) } });
      const text = h.text();
      assert.match(text, /\$800\.00/);
      assert.match(text, /ACH-77/);
      assert.doesNotMatch(text, /customer|invoice|margin/i);
      await view.unmount();
    });

    test('an on-hold payable never shows a reason', async () => {
      const view = await visit('/carrier/payables/p1', { as: 'carrier', routes: { 'GET /carrier/payables/p1': () => ({ data: carrierPayable({ status: 'on_hold', payments: [] }) }) } });
      assert.match(h.text(), /on hold\. Please contact our team/);
      await view.unmount();
    });

    test('another carrier\'s payable id shows a not-found state', async () => {
      const view = await visit('/carrier/payables/zz', { as: 'carrier', routes: { 'GET /carrier/payables/zz': () => ({ status: 404, body: { message: 'Not found.' } }) } });
      assert.match(h.text(), /That payable was not found/);
      await view.unmount();
    });
  });

  describe('source safety', () => {
    const files = (dir) => readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name);
      return statSync(full).isDirectory() ? files(full) : [full];
    });
    const financeSources = [...files(path.join(ROOT, 'src')).filter((f) => /finance|Finance|Billing|Payable/.test(f))];

    test('finance UI never stores tokens or card data and has no card inputs', () => {
      assert.ok(financeSources.length >= 10);
      for (const file of financeSources) {
        const source = readFileSync(file, 'utf8');
        assert.doesNotMatch(source, /localStorage|sessionStorage/, file);
        assert.doesNotMatch(source, /dangerouslySetInnerHTML/, file);
        assert.doesNotMatch(source, /cardNumber|cvv|cvc|autocomplete="cc-/i, file);
        assert.doesNotMatch(source, /stripe|paypal|checkout/i, file);
      }
    });

    test('portal pages never send an owner id or a paid flag', () => {
      for (const file of financeSources.filter((f) => /customer|carrier/.test(f))) {
        const source = readFileSync(file, 'utf8');
        assert.doesNotMatch(source, /customerId|carrierId|amountPaid:\s|status:\s*'paid'/, file);
      }
    });
  });
});
