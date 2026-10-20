import app, { API_BASE_PATH } from './app.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';

let httpServer;
let isShuttingDown = false;

async function shutdown(reason, exitCode = 0) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info(`Shutting down (${reason}).`);

  const forceExit = setTimeout(() => process.exit(1), 10000);
  forceExit.unref();

  try {
    if (httpServer) {
      await new Promise((resolve) => httpServer.close(resolve));
    }
    await disconnectDatabase();
  } catch (error) {
    logger.error('Error during shutdown:', error.message);
    exitCode = 1;
  }
  process.exit(exitCode);
}

async function start() {
  try {
    await connectDatabase();
  } catch (error) {
    logger.error(`Could not connect to MongoDB: ${error.message}`);
    logger.error('Check MONGO_URI in backend/.env and confirm the database is reachable.');
    process.exit(1);
  }

  httpServer = app.listen(env.PORT, () => {
    logger.info(`API listening on port ${env.PORT} (${env.NODE_ENV}).`);
    logger.info(`Base path: ${API_BASE_PATH}`);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection:', reason);
  shutdown('unhandledRejection', 1);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  shutdown('uncaughtException', 1);
});

start();
