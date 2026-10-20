import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

const AUTH_MESSAGE = 'Too many attempts. Please wait a while and try again.';

function createLimiter({ windowMinutes, limit, message, ...options }) {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, _res, next) => next(ApiError.tooManyRequests(message)),
    ...options,
  });
}

export const globalLimiter = createLimiter({ windowMinutes: 15, limit: env.GLOBAL_RATE_LIMIT_MAX });

/** One limiter per endpoint, each with its own counter, so heavy use of one never blocks another. */
export const createAuthLimiter = () =>
  createLimiter({
    windowMinutes: env.AUTH_RATE_LIMIT_WINDOW_MINUTES,
    limit: env.AUTH_RATE_LIMIT_MAX,
    message: AUTH_MESSAGE,
  });

/**
 * Counts failed sign-ins per email address (any IP), which slows down a distributed guessing attack
 * on a single account. Runs after validation so req.validated.body.email is a normalized string.
 * Successful sign-ins are not counted.
 */
export const createLoginAccountLimiter = () =>
  createLimiter({
    windowMinutes: env.AUTH_RATE_LIMIT_WINDOW_MINUTES,
    limit: env.LOGIN_ACCOUNT_LIMIT_MAX,
    message: AUTH_MESSAGE,
    skipSuccessfulRequests: true,
    keyGenerator: (req) => `account:${req.validated.body.email}`,
  });

/**
 * Limits current-password guesses on the password-change endpoint per signed-in user (not per IP), so a stolen
 * session cannot be used to brute-force the current password. Only failed attempts count. Runs after authenticate.
 */
export const createPasswordChangeLimiter = () =>
  createLimiter({
    windowMinutes: env.AUTH_RATE_LIMIT_WINDOW_MINUTES,
    limit: env.LOGIN_ACCOUNT_LIMIT_MAX,
    message: AUTH_MESSAGE,
    skipSuccessfulRequests: true,
    keyGenerator: (req) => `password-change:${req.user.id}`,
    validate: { keyGeneratorIpFallback: false },
  });

/**
 * Per target e-mail address (any IP) on forgot-password: stops one victim being mail-bombed from many addresses and stops
 * a flood of requests from overwriting their pending reset link. Every request counts, found or not, so it cannot be used
 * to tell whether an account exists.
 */
export const createResetEmailLimiter = () =>
  createLimiter({
    windowMinutes: 60,
    limit: env.RESET_EMAIL_LIMIT_MAX,
    message: 'Too many requests for this address. Please wait a while and try again.',
    keyGenerator: (req) => `reset-email:${req.validated.body.email}`,
  });

/** Per signed-in user on resend-verification. Runs after authenticate. */
export const createResendVerificationLimiter = () =>
  createLimiter({
    windowMinutes: 60,
    limit: env.RESET_EMAIL_LIMIT_MAX,
    message: 'Too many verification emails requested. Please wait a while and try again.',
    keyGenerator: (req) => `resend-verification:${req.user.id}`,
    validate: { keyGeneratorIpFallback: false },
  });

/** Per client IP on quote creation, on top of the per-user limiter, so many throw-away accounts cannot flood the office. */
export const createQuoteIpLimiter = () =>
  createLimiter({
    windowMinutes: 60,
    limit: env.QUOTE_IP_LIMIT_MAX,
    message: 'Too many quote requests from this network. Please wait a while and try again.',
  });

/**
 * Per client IP on a public website form (no account, so IP is the only key). `form` keeps each form's counter separate,
 * so heavy use of the contact form never blocks a carrier application from the same office.
 */
export const createPublicFormLimiter = (form) =>
  createLimiter({
    windowMinutes: 60,
    limit: env.PUBLIC_FORM_LIMIT_MAX,
    message: 'Too many submissions from this network. Please wait a while and try again.',
    keyGenerator: (req) => `public-form:${form}:${ipKeyGenerator(req.ip)}`,
  });

/** Per client IP on public tracking look-ups. Found and not-found answers both count, so guessing numbers stays slow. */
export const createTrackingLimiter = () =>
  createLimiter({
    windowMinutes: 15,
    limit: env.TRACKING_LIMIT_MAX,
    message: 'Too many tracking look-ups. Please wait a few minutes and try again.',
    keyGenerator: (req) => `tracking:${ipKeyGenerator(req.ip)}`,
  });

/** Per client IP on the public AI assistant: a short burst window (each answer uses the local AI machine) and a daily ceiling. */
export const createChatbotLimiter = () =>
  createLimiter({
    windowMinutes: 10,
    limit: env.CHATBOT_RATE_LIMIT_MAX,
    message: 'You are sending messages very quickly. Please wait a few minutes and try again.',
    keyGenerator: (req) => `chatbot:${ipKeyGenerator(req.ip)}`,
  });

export const createChatbotDailyLimiter = () =>
  createLimiter({
    windowMinutes: 24 * 60,
    limit: env.CHATBOT_DAILY_LIMIT_MAX,
    message: 'The assistant has reached its daily limit for this network. Please try again tomorrow or contact our team.',
    keyGenerator: (req) => `chatbot-daily:${ipKeyGenerator(req.ip)}`,
  });

/** Per signed-in user on file uploads (each upload is buffered in memory), counted per hour. */
export const createUploadLimiter = () =>
  createLimiter({
    windowMinutes: 60,
    limit: env.UPLOAD_RATE_LIMIT_MAX,
    message: 'Too many uploads in a short time. Please wait a while and try again.',
    keyGenerator: (req) => `upload:${req.user?.id ?? req.ip}`,
    validate: { keyGeneratorIpFallback: false },
  });

/** Per signed-in user (not per IP) on notification and preference endpoints, so one account cannot hammer them. */
export const createNotificationLimiter = () =>
  createLimiter({
    windowMinutes: 15,
    limit: env.NOTIFICATION_RATE_LIMIT_MAX,
    message: 'Too many requests. Please wait a moment and try again.',
    keyGenerator: (req) => `notifications:${req.user?.id ?? req.ip}`,
    validate: { keyGeneratorIpFallback: false },
  });

/** Per signed-in Super Admin (not per IP) on finance write endpoints (create, issue, void, record payment, reverse...). */
export const createFinanceLimiter = () =>
  createLimiter({
    windowMinutes: 15,
    limit: env.FINANCE_RATE_LIMIT_MAX,
    message: 'Too many financial changes in a short time. Please wait a moment and try again.',
    keyGenerator: (req) => `finance:${req.user?.id ?? req.ip}`,
    validate: { keyGeneratorIpFallback: false },
  });
