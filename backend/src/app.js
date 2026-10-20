import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { globalLimiter } from './middleware/rateLimiters.js';
import { requireTrustedOrigin } from './middleware/trustedOrigin.js';
import apiRoutes from './routes/index.js';

export const API_BASE_PATH = '/api/v1';

const app = express();

if (env.isProduction && env.TRUST_PROXY_HOPS > 0) {
  // The number of reverse proxies in front of the API. If this is wrong, rate limits and audit IPs use the wrong address.
  app.set('trust proxy', env.TRUST_PROXY_HOPS);
}

// Production only: refuse plain-HTTP API traffic (the proxy must send X-Forwarded-Proto). Health checks are exempt so a
// platform probe on the internal HTTP port keeps working. Nothing is redirected, because the API is not a browser page.
app.use((req, res, next) => {
  if (!env.enforceHttps || req.secure || req.path.startsWith(`${API_BASE_PATH}/health`)) return next();
  res.status(426).json({ success: false, message: 'HTTPS is required.', errors: [] });
});

app.use(
  helmet({
    // This server only returns JSON, so it loads nothing and may not be framed. The frontend's own
    // CSP is set by whatever serves the React app and is deliberately not applied here.
    contentSecurityPolicy: {
      directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'none'"], formAction: ["'none'"] },
    },
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'no-referrer' },
  })
);
app.use(
  cors({
    origin: env.CLIENT_URL,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type'],
  })
);
app.use(globalLimiter);
// Every route keeps the 10kb body limit except the Super Admin CMS API, whose pages and posts are longer than a form post.
// That one is parsed later (routes/index.js) with a larger limit, and only after the caller is authenticated as Super Admin.
const defaultJson = express.json({ limit: '10kb' });
app.use((req, res, next) => (req.path.startsWith(`${API_BASE_PATH}/admin/cms`) ? next() : defaultJson(req, res, next)));
app.use(cookieParser());

app.use(API_BASE_PATH, requireTrustedOrigin, apiRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
