import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { Homepage, SiteSettings, models } from '../src/models/index.js';
import { logger } from '../src/utils/logger.js';

/**
 * Prepares an empty or existing database: creates any missing indexes and makes sure the two
 * singleton CMS documents exist. It never deletes or changes existing data and inserts no
 * business records (no customers, carriers, quotes, loads, statistics, or testimonials).
 */
async function initializeDatabase() {
  await connectDatabase();
  const failures = [];

  try {
    for (const [name, Model] of Object.entries(models)) {
      try {
        await Model.createIndexes();
        logger.info(`Indexes ready: ${name}`);
      } catch (error) {
        failures.push(`${name}: ${error.message}`);
      }
    }

    await SiteSettings.getPrimary();
    await Homepage.getPrimary();
    logger.info('Site settings and homepage documents are present.');
  } finally {
    await disconnectDatabase();
  }

  if (failures.length > 0) {
    logger.error(`Index creation failed for:\n  ${failures.join('\n  ')}`);
    process.exitCode = 1;
  }
}

initializeDatabase().catch((error) => {
  logger.error('Database initialization failed:', error.message);
  process.exitCode = 1;
  return disconnectDatabase();
});
