const os = require('os');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { MongoMemoryReplSet, MongoMemoryServer } = require('mongodb-memory-server');
const { resetTransactionSupportCache } = require('../../utils/withTransaction');

/**
 * In-memory MongoDB for tests. A single-node replica set is used so that
 * multi-document transactions work exactly as in production (Atlas).
 * The data directory is created under the OS temp dir (set TEMP/TMP to a
 * drive with free space if the system drive is full).
 */
let server;
let dbPath;

async function connectReplSet() {
  dbPath = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-mongo-'));
  server = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' }, instanceOpts: [{ dbPath }] });
  await mongoose.connect(server.getUri('charu_test'));
  resetTransactionSupportCache();
  await Promise.all(mongoose.modelNames().map((n) => mongoose.model(n).init()));
}

async function connectStandalone() {
  dbPath = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-mongo-'));
  server = await MongoMemoryServer.create({ instance: { dbPath, storageEngine: 'wiredTiger' } });
  await mongoose.connect(server.getUri('charu_test'));
  resetTransactionSupportCache();
}

async function clearDb() {
  const cols = await mongoose.connection.db.collections();
  await Promise.all(cols.map((c) => c.deleteMany({})));
}

async function disconnect() {
  await mongoose.disconnect();
  if (server) await server.stop({ doCleanup: true, force: true });
  resetTransactionSupportCache();
}

module.exports = { connectReplSet, connectStandalone, clearDb, disconnect };
