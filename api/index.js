import app from '../backend/src/app.js';
import { connectDatabase } from '../backend/src/config/database.js';

// Vercel runs this file as a serverless function, so backend/src/server.js (which connects once at boot) never runs.
// Connect on the first request of each warm instance and reuse the connection for the following ones.
let connecting;

function ensureDatabase() {
  connecting ??= connectDatabase().catch((error) => {
    connecting = undefined; // let the next request retry instead of caching a failure
    throw error;
  });
  return connecting;
}

export default async function handler(req, res) {
  try {
    await ensureDatabase();
  } catch (error) {
    console.error(`Could not connect to MongoDB: ${error.message}`);
    res.status(503).json({ success: false, message: 'Service temporarily unavailable.', errors: [] });
    return;
  }
  return app(req, res);
}
