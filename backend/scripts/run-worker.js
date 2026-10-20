import { runWorker } from '../src/notifications/worker.js';

runWorker().catch((error) => {
  console.error(`Delivery worker crashed: ${error.message}`);
  process.exit(1);
});
