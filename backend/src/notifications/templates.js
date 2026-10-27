import { env } from '../config/env.js';

const FALLBACK_BRAND = 'HASHIMI LOGISTICS LLC';

export const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

/** Only same-origin links to the portal are ever built: actionPath must be a plain path, never a full URL. */
export function actionUrl(path) {
  if (typeof path !== 'string' || !/^\/[A-Za-z0-9/_\-?=&%.]*$/.test(path) || path.startsWith('//')) return null;
  return `${env.CLIENT_URL}${path}`;
}

function layout({ brand, heading, paragraphs, button, footer }) {
  const body = paragraphs.map((text) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.5;color:#1f2937;">${escapeHtml(text)}</p>`).join('');
  const link = button
    ? `<p style="margin:24px 0;"><a href="${escapeHtml(button.url)}" style="background:#0f3d5e;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:600;display:inline-block;">${escapeHtml(button.label)}</a></p><p style="margin:0 0 16px;font-size:13px;color:#4b5563;word-break:break-all;">Or copy this link: ${escapeHtml(button.url)}</p>`
    : '';
  return `<!doctype html><html lang="en"><body style="margin:0;padding:24px;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;"><table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;"><tr><td style="padding:24px 28px;"><p style="margin:0 0 20px;font-size:13px;font-weight:700;letter-spacing:.06em;color:#0f3d5e;">${escapeHtml(brand)}</p><h1 style="margin:0 0 16px;font-size:20px;color:#111827;">${escapeHtml(heading)}</h1>${body}${link}<p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:#6b7280;">${escapeHtml(footer)}</p></td></tr></table></body></html>`;
}

/** Notification email: only the already role-safe title/message of the in-app notification, plus a link into the portal. */
export function renderNotificationEmail({ brand = FALLBACK_BRAND, recipientName, title, message, actionPath }) {
  const url = actionUrl(actionPath);
  const greeting = recipientName ? `Hello ${recipientName},` : 'Hello,';
  const footer = `You are receiving this because of activity on your ${brand} account. You can change which notifications you receive in your account's notification settings.`;
  return {
    subject: `${title} - ${brand}`,
    text: `${greeting}\n\n${message}\n\n${url ? `Open it here: ${url}\n\n` : ''}${footer}`,
    html: layout({ brand, heading: title, paragraphs: [greeting, message], button: url ? { url, label: 'Open in your account' } : null, footer }),
  };
}

/** Security emails: always sent, never mention anything but the account action. */
export function renderSecurityEmail({ brand = FALLBACK_BRAND, kind, recipientName, link }) {
  const greeting = recipientName ? `Hello ${recipientName},` : 'Hello,';
  const reset = kind === 'password_reset';
  const heading = reset ? `Reset your ${brand} password` : `Confirm your email address for ${brand}`;
  const intro = reset
    ? `Use this link to choose a new password. It expires in ${env.PASSWORD_RESET_TTL_MINUTES} minutes and works once.`
    : `Confirm your email address with this link. It expires in ${env.EMAIL_VERIFICATION_TTL_HOURS} hours and works once.`;
  const outro = reset ? 'If you did not request this, you can ignore this message. Your password has not changed.' : 'If you did not create this account, you can ignore this message.';
  return {
    subject: heading,
    text: `${greeting}\n\n${intro}\n\n${link}\n\n${outro}`,
    html: layout({ brand, heading, paragraphs: [greeting, intro], button: { url: link, label: reset ? 'Choose a new password' : 'Confirm email address' }, footer: outro }),
  };
}

/** SMS: short, plain, no links with tokens, no pricing, no names. */
export function renderSms({ brand = FALLBACK_BRAND, title }) {
  return `${brand}: ${title}. Sign in to your account for details.`.slice(0, 300);
}
