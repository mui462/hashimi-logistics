import { randomInt } from 'node:crypto';
import { Counter } from '../models/Counter.js';

const TRACKING_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const TRACKING_LENGTH = 10;

async function nextSequentialNumber(prefix, date, padding) {
  const key = `${prefix}-${date.getUTCFullYear()}`;
  const counter = await Counter.findOneAndUpdate(
    { _id: key },
    { $inc: { sequence: 1 } },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  );
  return `${key}-${String(counter.sequence).padStart(padding, '0')}`;
}

export const nextQuoteNumber = (date = new Date()) => nextSequentialNumber('QT', date, 6);

export const nextLoadNumber = (date = new Date()) => nextSequentialNumber('LD', date, 6);

export const nextShipmentNumber = (date = new Date()) => nextSequentialNumber('SH', date, 6);

/**
 * Tracking numbers are random, not sequential, because they will be usable on a public page:
 * a sequential number would let anyone enumerate other customers' shipments.
 * The unique index remains the final guard against a (very unlikely) collision.
 */
export function generateTrackingNumber() {
  let code = '';
  for (let index = 0; index < TRACKING_LENGTH; index += 1) {
    code += TRACKING_ALPHABET[randomInt(TRACKING_ALPHABET.length)];
  }
  return `HL-${code}`;
}

export const nextInvoiceNumber = (date = new Date()) => nextSequentialNumber('INV', date, 6);

export const nextPayableNumber = (date = new Date()) => nextSequentialNumber('CP', date, 6);
