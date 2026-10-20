/**
 * Payment gateway status. No gateway is installed or configured: there is no checkout, no webhook endpoint and no stored
 * provider credential. All payment entries are administrative records made by the Super Admin. A future gateway would
 * need confirmed requirements and credentials, signature-verified webhooks, idempotent event handling and replay
 * protection before any entry could be marked as gateway-confirmed (see docs/PAYMENTS_AND_INVOICING.md).
 */
export function getGatewayStatus() {
  return {
    configured: false,
    provider: null,
    onlinePaymentAvailable: false,
    mode: 'manual_recording_only',
    status: 'NOT CONFIGURED / NOT LIVE TESTED',
    message: 'Online payment is not currently available. Payments are recorded manually by the Super Admin and are not bank-verified.',
  };
}
