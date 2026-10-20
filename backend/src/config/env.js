import 'dotenv/config';
import { z } from 'zod';

const jwtLifetime = /^\d+[smhd]$/;

const positiveInt = (fallback, { min = 1, max } = {}) => {
  let schema = z.coerce.number().int().min(min);
  if (max) schema = schema.max(max);
  return schema.default(fallback);
};

const booleanFlag = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  MONGO_URI: z
    .string()
    .trim()
    .regex(/^mongodb(\+srv)?:\/\/.+/, 'must start with mongodb:// or mongodb+srv://'),
  JWT_SECRET: z.string().min(32, 'must be at least 32 characters'),
  JWT_EXPIRES_IN: z
    .string()
    .trim()
    .regex(jwtLifetime, 'must look like 30m, 12h, or 7d')
    .default('7d'),
  CLIENT_URL: z
    .string()
    .trim()
    .url('must be a valid URL, for example http://localhost:5173')
    .transform((value) => new URL(value).origin),
  // Google Sign-In (optional). The OAuth client ID is public; there is no client secret because the ID token is verified against Google's public keys.
  GOOGLE_CLIENT_ID: z.string().trim().regex(/^[\w-]+\.apps\.googleusercontent\.com$/, 'must look like 123-abc.apps.googleusercontent.com').optional(),
  COOKIE_NAME: z.string().trim().min(1).default('hashimi_token'),
  COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),

  GLOBAL_RATE_LIMIT_MAX: positiveInt(300),
  AUTH_RATE_LIMIT_MAX: positiveInt(20),
  AUTH_RATE_LIMIT_WINDOW_MINUTES: positiveInt(15, { max: 1440 }),
  LOGIN_ACCOUNT_LIMIT_MAX: positiveInt(10),

  PASSWORD_RESET_TTL_MINUTES: positiveInt(30, { min: 5, max: 120 }),
  EMAIL_VERIFICATION_TTL_HOURS: positiveInt(24, { min: 1, max: 168 }),
  DEV_LOG_AUTH_LINKS: booleanFlag,

  // File storage (Phase 10). With STORAGE_PROVIDER unset, Cloudinary is used automatically once all three CLOUDINARY_* values
  // exist, and uploads report 501 STORAGE_NOT_CONFIGURED until then. `local` stores files on this server's disk for development only.
  STORAGE_PROVIDER: z.enum(['cloudinary', 'local']).optional(),
  STORAGE_LOCAL_DIR: z.string().trim().min(1).default('storage-data'),
  API_PUBLIC_URL: z.string().trim().url().transform((value) => new URL(value).origin).optional(),
  STORAGE_SIGNED_URL_TTL_SECONDS: positiveInt(300, { min: 30, max: 3600 }),
  UPLOAD_IMAGE_MAX_MB: positiveInt(10, { max: 50 }),
  UPLOAD_VIDEO_MAX_MB: positiveInt(200, { max: 500 }),
  UPLOAD_DOCUMENT_MAX_MB: positiveInt(25, { max: 50 }),

  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),

  // Notification delivery (Phase 11). Providers are optional: with EMAIL_PROVIDER / SMS_PROVIDER unset nothing is sent and
  // the system says so honestly. `mock` records messages in memory/logs only and is refused in production.
  EMAIL_PROVIDER: z.enum(['resend', 'mock']).optional(),
  EMAIL_FROM: z.string().trim().min(3).max(200).optional(),
  EMAIL_REPLY_TO: z.string().trim().email().optional(),
  RESEND_API_KEY: z.string().trim().min(8).optional(),
  SMS_PROVIDER: z.enum(['twilio', 'mock']).optional(),
  TWILIO_ACCOUNT_SID: z.string().trim().regex(/^AC[0-9a-fA-F]{32}$/, 'must look like an AC... account SID').optional(),
  TWILIO_AUTH_TOKEN: z.string().trim().min(16).optional(),
  TWILIO_FROM_NUMBER: z.string().trim().regex(/^\+[1-9]\d{7,14}$/, 'must be an E.164 number such as +15555550123').optional(),
  DELIVERY_MAX_ATTEMPTS: positiveInt(5, { min: 1, max: 10 }),
  DELIVERY_BACKOFF_BASE_SECONDS: positiveInt(60, { min: 1, max: 3600 }),
  DELIVERY_BACKOFF_MAX_SECONDS: positiveInt(3600, { min: 1, max: 86400 }),
  DELIVERY_WORKER_POLL_SECONDS: positiveInt(10, { min: 1, max: 600 }),
  DELIVERY_BATCH_SIZE: positiveInt(20, { min: 1, max: 200 }),
  DELIVERY_LOCK_SECONDS: positiveInt(120, { min: 10, max: 3600 }),
  NOTIFICATION_RATE_LIMIT_MAX: positiveInt(60),
  FINANCE_RATE_LIMIT_MAX: positiveInt(300),
  ENFORCE_HTTPS: z.enum(['true', 'false']).optional(),
  TRUST_PROXY_HOPS: positiveInt(1, { min: 0, max: 5 }),
  RESET_EMAIL_LIMIT_MAX: positiveInt(5),
  UPLOAD_RATE_LIMIT_MAX: positiveInt(60),
  QUOTE_IP_LIMIT_MAX: positiveInt(60),
  // Public website forms (guest quote, carrier application, contact): per client IP per hour, each form counted separately.
  PUBLIC_FORM_LIMIT_MAX: positiveInt(10),
  // Public tracking look-ups per client IP per 15 minutes. Tracking numbers are random; this keeps guessing impractical.
  TRACKING_LIMIT_MAX: positiveInt(30),

  // AI assistant (public website chatbot), answered by Ollama running on a machine the backend can reach (see docs/AI_ASSISTANT.md).
  // The browser never talks to Ollama: only this server does. OLLAMA_API_KEY is optional and is sent as a Bearer token to an
  // authenticated reverse proxy placed in front of Ollama (Ollama itself has no login). Never expose port 11434 to the internet.
  OLLAMA_BASE_URL: z
    .string()
    .trim()
    .url('must be a URL such as http://127.0.0.1:11434')
    .refine((value) => !new URL(value).username && !new URL(value).password, 'must not contain a username or password (use OLLAMA_API_KEY)')
    .transform((value) => value.replace(/\/+$/, ''))
    .default('http://127.0.0.1:11434'),
  OLLAMA_MODEL: z.string().trim().min(1).max(100).default('qwen2.5:3b'),
  OLLAMA_API_KEY: z.string().trim().min(8).optional(),
  // A first answer after the model was idle loads it into memory, which can take a while on a CPU-only machine.
  OLLAMA_TIMEOUT_MS: positiveInt(120000, { min: 3000, max: 600000 }),
  OLLAMA_NUM_CTX: positiveInt(4096, { min: 1024, max: 32768 }),
  OLLAMA_MAX_TOKENS: positiveInt(400, { min: 64, max: 2048 }),
  OLLAMA_TEMPERATURE: z.coerce.number().min(0).max(1).default(0.2),
  OLLAMA_KEEP_ALIVE: z.string().trim().regex(/^(-1|\d+[smh]?)$/, 'must look like 30m, 1h, 300 or -1').default('30m'),
  // How many website facts are given to the model per question, and how many answers may be pending at once (a local
  // machine answers one at a time; more than this many waiting visitors get a polite "busy" instead of a long queue).
  CHATBOT_CONTEXT_CHUNKS: positiveInt(3, { min: 1, max: 10 }),
  CHATBOT_MAX_PENDING: positiveInt(4, { min: 1, max: 50 }),
  // Per client IP: a short burst limit and a daily limit.
  CHATBOT_RATE_LIMIT_MAX: positiveInt(20),
  CHATBOT_DAILY_LIMIT_MAX: positiveInt(150),
});

function checkCrossFieldRules(config, context) {
  if (config.COOKIE_SAME_SITE === 'none') {
    context.addIssue({
      code: 'custom',
      path: ['COOKIE_SAME_SITE'],
      message:
        'SameSite=None is blocked until CSRF token protection exists. Use "lax" or "strict" (see docs/AUTHENTICATION.md).',
    });
  }
  if (config.STORAGE_PROVIDER === 'local' && config.NODE_ENV === 'production') {
    context.addIssue({
      code: 'custom',
      path: ['STORAGE_PROVIDER'],
      message: 'The local disk provider is for development only. Use cloudinary in production.',
    });
  }
  if (config.EMAIL_PROVIDER === 'resend') {
    for (const key of ['RESEND_API_KEY', 'EMAIL_FROM']) {
      if (!config[key]) context.addIssue({ code: 'custom', path: [key], message: 'Required when EMAIL_PROVIDER=resend.' });
    }
  }
  if (config.SMS_PROVIDER === 'twilio') {
    for (const key of ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER']) {
      if (!config[key]) context.addIssue({ code: 'custom', path: [key], message: 'Required when SMS_PROVIDER=twilio.' });
    }
  }
  if (config.NODE_ENV === 'production' && config.OLLAMA_BASE_URL) {
    const url = new URL(config.OLLAMA_BASE_URL);
    const privateHost = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(url.hostname);
    if (url.protocol === 'http:' && !privateHost) {
      context.addIssue({ code: 'custom', path: ['OLLAMA_BASE_URL'], message: 'Ollama must be reached over https, or over http only on this machine or a private network (never across the public internet).' });
    }
    if (url.port === '11434' && !privateHost) {
      context.addIssue({ code: 'custom', path: ['OLLAMA_BASE_URL'], message: 'Ollama port 11434 must not be exposed publicly. Put an authenticated https reverse proxy in front of it.' });
    }
  }
  if (config.NODE_ENV === 'production') {
    if (!config.CLIENT_URL.startsWith('https://')) {
      context.addIssue({ code: 'custom', path: ['CLIENT_URL'], message: 'Must be an https:// origin in production (secure cookies and CORS depend on it).' });
    }
    if (/change[-_ ]?me|example|placeholder|secret-here|replace[-_ ]?me|^(.)\1+$/i.test(config.JWT_SECRET)) {
      context.addIssue({ code: 'custom', path: ['JWT_SECRET'], message: 'Looks like a placeholder. Generate a random value, for example: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))"' });
    }
    if (config.ENFORCE_HTTPS === 'false') {
      context.addIssue({ code: 'custom', path: ['ENFORCE_HTTPS'], message: 'Must not be disabled in production.' });
    }
  }
  if (config.NODE_ENV === 'production') {
    for (const key of ['EMAIL_PROVIDER', 'SMS_PROVIDER']) {
      if (config[key] === 'mock') context.addIssue({ code: 'custom', path: [key], message: 'The mock provider sends nothing and must not be used in production.' });
    }
  }
  if (config.DEV_LOG_AUTH_LINKS && config.NODE_ENV === 'production') {
    context.addIssue({
      code: 'custom',
      path: ['DEV_LOG_AUTH_LINKS'],
      message: 'Must not be enabled in production: it writes password reset and verification links to the log.',
    });
  }
}

function loadEnv() {
  const definedValues = Object.fromEntries(
    Object.entries(process.env).filter(([, value]) => value !== '')
  );
  const result = envSchema.superRefine(checkCrossFieldRules).safeParse(definedValues);

  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    console.error(`Invalid environment configuration:\n${problems}`);
    console.error('Copy backend/.env.example to backend/.env and fill in the values.');
    process.exit(1);
  }

  return Object.freeze({
    ...result.data,
    isProduction: result.data.NODE_ENV === 'production',
    enforceHttps: result.data.ENFORCE_HTTPS ? result.data.ENFORCE_HTTPS === 'true' : result.data.NODE_ENV === 'production',
  });
}

export const env = loadEnv();
