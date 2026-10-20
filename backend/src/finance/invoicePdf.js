import { fromMinorUnits } from '../utils/money.js';
import { PdfDocument, wrapText } from './pdfWriter.js';

const money = (amount, currency) => `${fromMinorUnits(amount)} ${currency}`;
const STATUS_LABEL = { issued: 'ISSUED', partially_paid: 'PARTIALLY PAID', paid: 'PAID', void: 'VOID', draft: 'DRAFT' };

const addressLine = (address) => [address?.street, address?.city, address?.state, address?.zipCode, address?.country].filter(Boolean).join(', ');

/**
 * Renders an invoice PDF from persisted data only. Nothing is invented: company contact lines, the customer's billing
 * contact and address, and notes appear only if they are stored. There are no payment instructions, tax identifiers or
 * legal terms because none are configured. The PDF is generated per request and never stored or publicly linked.
 */
export function renderInvoicePdf({ invoice, company, customer, loadNumber, payments = [], overdue = false }) {
  const doc = new PdfDocument();
  const right = 545;
  doc.text(company?.companyName || 'HASHIMI LOGISTICS INC.', { size: 16, bold: true });
  for (const line of [addressLine(company?.address), company?.phone, company?.email].filter(Boolean)) doc.text(line, { size: 9 });
  doc.space(6);
  doc.text('INVOICE', { size: 20, bold: true, gap: 6 });
  doc.text(`Invoice number: ${invoice.invoiceNumber}`, { size: 11, bold: true });
  doc.text(`Status: ${STATUS_LABEL[invoice.status] ?? invoice.status}${overdue ? ' (OVERDUE)' : ''}`, { size: 10 });
  if (invoice.issueDate) doc.text(`Issue date: ${new Date(invoice.issueDate).toISOString().slice(0, 10)}`, { size: 10 });
  if (invoice.dueDate) doc.text(`Due date: ${new Date(invoice.dueDate).toISOString().slice(0, 10)}`, { size: 10 });
  if (loadNumber) doc.text(`Load reference: ${loadNumber}`, { size: 10 });
  doc.text(`Currency: ${invoice.currency}`, { size: 10 });
  doc.space(6);

  doc.text('Bill to', { size: 10, bold: true });
  doc.text(customer?.companyName ?? '', { size: 10 });
  const billing = customer?.billingInformation;
  for (const line of [billing?.contactName, addressLine(billing?.address), billing?.email, billing?.phone].filter(Boolean)) doc.text(line, { size: 9 });
  doc.space(8);
  doc.rule();

  doc.text('Description', { size: 9, bold: true, advance: false });
  doc.text('Qty', { size: 9, bold: true, x: 360, align: 'right', advance: false });
  doc.text('Unit', { size: 9, bold: true, x: 450, align: 'right', advance: false });
  doc.text('Amount', { size: 9, bold: true, x: right, align: 'right' });
  doc.rule();
  for (const item of invoice.lineItems) {
    const [first, ...rest] = wrapText(item.description, 9, 290);
    doc.ensureSpace(16 + rest.length * 12);
    doc.text(first, { size: 9, advance: false });
    doc.text(String(item.quantity), { size: 9, x: 360, align: 'right', advance: false });
    doc.text(fromMinorUnits(item.unitAmount), { size: 9, x: 450, align: 'right', advance: false });
    doc.text(fromMinorUnits(item.amount), { size: 9, x: right, align: 'right', gap: 3 });
    for (const line of rest) doc.text(line, { size: 9, gap: 3 });
    doc.space(3);
  }
  doc.rule();
  const outstanding = invoice.status === 'void' ? 0 : Math.max(0, invoice.total - invoice.amountPaid);
  doc.text(`Subtotal: ${money(invoice.subtotal, invoice.currency)}`, { size: 10, x: right, align: 'right' });
  doc.text(`Total: ${money(invoice.total, invoice.currency)}`, { size: 11, bold: true, x: right, align: 'right' });
  doc.text(`Amount paid (recorded): ${money(invoice.amountPaid, invoice.currency)}`, { size: 10, x: right, align: 'right' });
  doc.text(`Outstanding: ${money(outstanding, invoice.currency)}`, { size: 11, bold: true, x: right, align: 'right' });
  doc.space(6);

  const history = payments.filter((p) => p.status !== 'failed');
  if (history.length) {
    doc.text('Payment history (recorded by the company)', { size: 10, bold: true });
    for (const p of history) {
      const label = p.entryType === 'reversal' ? 'Reversal' : p.status === 'reversed' ? 'Payment (reversed)' : 'Payment';
      doc.text(`${new Date(p.paymentDate).toISOString().slice(0, 10)}  ${label}  ${money(p.amount, p.currency)}`, { size: 9 });
    }
    doc.space(6);
  }
  if (invoice.customerNote) {
    doc.text('Notes', { size: 10, bold: true });
    doc.paragraph(invoice.customerNote, { size: 9 });
  }
  return doc.toBuffer({ title: `Invoice ${invoice.invoiceNumber}` });
}
