import { ActivityLog } from '../models/ActivityLog.js';
import { Load } from '../models/Load.js';
import { QuoteRequest } from '../models/QuoteRequest.js';
import { Shipment } from '../models/Shipment.js';
import { BOARD_LOAD_STATUSES } from './loadStatus.service.js';
import { LIVE_SHIPMENT_STATUSES } from './shipmentStatus.service.js';

const FINANCIAL_LOAD_STATUSES = ['assigned', 'dispatched', 'picked_up', 'in_transit', 'delivered', 'completed'];
const FINANCIAL_ROW_CAP = 5000;

async function countByStatus(Model, extra = {}) {
  const rows = await Model.aggregate([{ $match: { archivedAt: null, ...extra } }, { $group: { _id: '$status', count: { $sum: 1 } } }]);
  return Object.fromEntries(rows.map((row) => [row._id, row.count]));
}

const pick = (counts, keys) => Object.fromEntries(keys.map((key) => [key, counts[key] ?? 0]));

/**
 * Operational counts straight from the collections: nothing is estimated, cached or invented. An empty system reports
 * zeros. Money is summed per currency from real loads that have a carrier (so a margin exists), capped at
 * FINANCIAL_ROW_CAP loads and flagged when the cap applies.
 */
export async function getDashboard(now = new Date()) {
  const [quoteCounts, loadCounts, shipmentCounts, overduePickups, overdueDeliveries, expiredQuotes, crossBorderLive, financialLoads, recent] = await Promise.all([
    countByStatus(QuoteRequest),
    countByStatus(Load),
    countByStatus(Shipment),
    Load.countDocuments({ status: { $in: ['assigned', 'dispatched'] }, 'pickup.latest': { $lt: now }, archivedAt: null }),
    Load.countDocuments({ status: { $in: ['picked_up', 'in_transit'] }, 'delivery.latest': { $lt: now }, archivedAt: null }),
    QuoteRequest.countDocuments({ status: 'quoted', quoteExpiresAt: { $lt: now }, archivedAt: null }),
    Shipment.countDocuments({ status: { $in: LIVE_SHIPMENT_STATUSES }, borderStatus: { $ne: 'not_applicable' }, archivedAt: null }),
    Load.find({ status: { $in: FINANCIAL_LOAD_STATUSES }, archivedAt: null })
      .select('+rate +carrierRate +brokerMargin currency')
      .sort({ createdAt: -1 })
      .limit(FINANCIAL_ROW_CAP + 1)
      .lean(),
    ActivityLog.find({ module: { $in: ['quotes', 'loads', 'shipments'] }, action: /^operations\./ })
      .sort({ createdAt: -1 })
      .limit(10)
      .select('action description module entityId createdAt')
      .lean(),
  ]);

  const truncated = financialLoads.length > FINANCIAL_ROW_CAP;
  const totals = new Map();
  for (const load of financialLoads.slice(0, FINANCIAL_ROW_CAP)) {
    if (!Number.isSafeInteger(load.rate) || !Number.isSafeInteger(load.carrierRate)) continue;
    const key = load.currency ?? 'USD';
    const entry = totals.get(key) ?? { currency: key, customerRevenue: 0, carrierCost: 0, brokerMargin: 0, loads: 0 };
    entry.customerRevenue += load.rate;
    entry.carrierCost += load.carrierRate;
    entry.brokerMargin += load.rate - load.carrierRate;
    entry.loads += 1;
    totals.set(key, entry);
  }

  const sum = (counts) => Object.values(counts).reduce((total, value) => total + value, 0);
  return {
    generatedAt: now.toISOString(),
    quotes: {
      total: sum(quoteCounts),
      submitted: quoteCounts.new ?? 0,
      underReview: quoteCounts.reviewing ?? 0,
      ...pick(quoteCounts, ['pricing', 'quoted']),
      awaitingConversion: quoteCounts.customer_accepted ?? 0,
      ...pick(quoteCounts, ['converted_to_load', 'declined', 'expired', 'cancelled']),
      quotedButPastExpiry: expiredQuotes,
    },
    loads: {
      total: sum(loadCounts),
      ...pick(loadCounts, ['draft', 'open', 'carrier_search', 'assigned', 'dispatched', 'picked_up', 'in_transit', 'delivered', 'completed', 'cancelled']),
      needingCarrier: BOARD_LOAD_STATUSES.reduce((total, status) => total + (loadCounts[status] ?? 0), 0),
      overduePickups,
      overdueDeliveries,
    },
    shipments: {
      total: sum(shipmentCounts),
      live: LIVE_SHIPMENT_STATUSES.reduce((total, status) => total + (shipmentCounts[status] ?? 0), 0),
      crossBorderLive,
      openExceptions: shipmentCounts.exception ?? 0,
      ...pick(shipmentCounts, ['booked', 'dispatched', 'picked_up', 'in_transit', 'at_border', 'border_cleared', 'out_for_delivery', 'delivered', 'completed', 'cancelled']),
    },
    financials: { byCurrency: [...totals.values()], truncated },
    recentActivity: recent.map((entry) => ({
      action: entry.action,
      description: entry.description ?? null,
      module: entry.module,
      entityId: entry.entityId ? String(entry.entityId) : null,
      at: new Date(entry.createdAt).toISOString(),
    })),
  };
}
