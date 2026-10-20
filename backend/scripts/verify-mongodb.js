/**
 * Verifies that the configured database is a REAL MongoDB and that every index this application declares can be built.
 *
 *   MONGO_URI=mongodb://.../hashimi_verify_test node scripts/verify-mongodb.js
 *
 * It is read-only except for creating missing indexes (the same thing `npm run db:init` does) and refuses to run unless the
 * database name ends in "_verify" or "_test", so it cannot be pointed at production data by accident. It reports the server
 * product (FerretDB and other MongoDB-compatible servers are flagged), the version, the topology (transactions need a
 * replica set or sharded cluster) and every index that failed. Exit code 0 means: real MongoDB, all indexes built.
 */
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { models } from '../src/models/index.js';

const SUPPORTED_MAJOR_MIN = 6;

async function main() {
  await connectDatabase();
  const db = mongoose.connection.db;
  const name = db.databaseName;
  if (!/(_verify|_test)$/.test(name)) throw new Error(`Refusing to run on database "${name}": the name must end in "_verify" or "_test".`);

  const build = await db.admin().command({ buildInfo: 1 });
  const hello = await db.admin().command({ hello: 1 });
  const isFerret = Boolean(build.ferretdb) || /ferret/i.test(JSON.stringify(build));
  const topology = hello.setName ? `replica set "${hello.setName}"` : hello.msg === 'isdbgrid' ? 'sharded cluster' : 'standalone';
  const transactions = Boolean(hello.setName) || hello.msg === 'isdbgrid';
  const major = Number(String(build.version).split('.')[0]);

  const report = { database: name, server: isFerret ? 'FerretDB (NOT real MongoDB)' : 'MongoDB', version: build.version, topology, transactionsAvailable: transactions, indexFailures: [] };
  for (const [modelName, Model] of Object.entries(models)) {
    try { await Model.createIndexes(); } catch (error) { report.indexFailures.push(`${modelName}: ${error.message}`); }
  }
  report.realMongoDb = !isFerret && major >= SUPPORTED_MAJOR_MIN;
  report.verdict = report.realMongoDb && report.indexFailures.length === 0 ? 'PASS' : 'FAIL';
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.verdict === 'PASS' ? 0 : 1;
}

main().catch((error) => { console.error(`verify-mongodb failed: ${error.message}`); process.exitCode = 1; }).finally(() => disconnectDatabase());
