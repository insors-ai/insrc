/** Normal daemon logger fixture; real SDK resources, private log paths, no global silencing. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createServer } from 'node:net';
import type { Socket } from 'node:net';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import type { ConnectionConfig, Driver, RdbmsDriver } from '../../../../shared/db-driver.js';

const directory = process.argv[2]!;
const base = new URL(process.argv[3] === 'compiled' ? '../../../../../out/' : '../../../../', import.meta.url);
const { PATHS } = await import(new URL('shared/paths.js', base).href) as typeof import('../../../../shared/paths.js');
PATHS.config = join(directory, 'config.json'); await writeFile(PATHS.config, JSON.stringify({ logLevel: 'trace' }));
PATHS.insrc = directory; PATHS.logDir = join(directory, 'logs'); PATHS.daemonLog = join(PATHS.logDir, 'daemon.log'); PATHS.agentLog = join(PATHS.logDir, 'agent.log');
const { getLogger } = await import(new URL('shared/logger.js', base).href) as typeof import('../../../../shared/logger.js');
const { ConnectionSessionOwner } = await import(new URL('daemon/db/session-owner.js', base).href) as typeof import('../../session-owner.js');
const { temporaryDriverContext, invokeTemporaryFactory } = await import(new URL('daemon/db/driver-log-policy.js', base).href) as typeof import('../../driver-log-policy.js');
const { fileExecutionPolicy } = await import(new URL('daemon/db/file-policy.js', base).href) as typeof import('../../file-policy.js');
const { getFactory } = await import(new URL('daemon/db/registry.js', base).href) as typeof import('../../registry.js');
await import(new URL('daemon/db/drivers/index.js', base).href);
const { pgProbeServer } = await import('./sql-probe-servers.js');
const root = join(directory, 'root'); await mkdir(root);
let now = 0, authority: object | undefined;
const owner = new ConnectionSessionOwner({ daemonEpoch: 'fixture', monotonicNow: () => now, isRegistered: async r => r === root, createOverlay: (_r, _s, c) => { authority = c.factoryAuthority; return {}; } });
const session = await owner.open({ connectionIdentity: 'fixture-control', daemonEpoch: 'fixture' }, root);
const drivers: Driver[] = [];
async function make(config: ConnectionConfig) {
 const context = temporaryDriverContext(authority!, fileExecutionPolicy(config, { lookupRoot: root, ownerId: session.sessionHandle, revision: config.id, persistence: 'memory-only' }));
 const driver = await invokeTemporaryFactory(getFactory(config.kind)!, Object.freeze(config), context); drivers.push(driver); return driver;
}
if (process.argv[4] === 'ambient-refusal') {
 await assert.rejects(make({ id: 'CM_TEMP_PRIVATE_ENDPOINT_CANARY-pg', kind: 'postgres', url: 'postgres://u:p@127.0.0.1:1/fixture' }), { code: 'unsupported-temporary' });
 await assert.rejects(make({ id: 'CM_TEMP_PRIVATE_ENDPOINT_CANARY', kind: 'redis', url: 'redis://CM_TEMP_PRIVATE_ENDPOINT_CANARY:1' }), { code: 'unsupported-temporary' });
 await assert.rejects(make({ id: 'CM_TEMP_PRIVATE_ENDPOINT_CANARY-file', kind: 'csv', path: '/CM_TEMP_PRIVATE_PATH_CANARY/missing.csv' }), { code: 'unsupported-temporary' });
 await assert.rejects(make({ id: 'CM_TEMP_PRIVATE_ENDPOINT_CANARY-oracle', kind: 'oracle', url: 'oracle://u:p@127.0.0.1:1/CM_TEMP_PRIVATE_DATABASE_CANARY' }), { code: 'unsupported-temporary' });
 // Saved construction remains available with ambient SDK debugging enabled.
 const saved = await getFactory('redis')!({ id: 'saved', kind: 'redis', url: 'redis://127.0.0.1:1' }); await saved.close();
 await owner.close(); process.stdout.write('ambient-refusal-ok\n'); process.exit(0);
}
const canary = 'CM_TEMP_PRIVATE_ERROR_CANARY', id = 'CM_TEMP_PRIVATE_ENDPOINT_CANARY';
let reads = 0;
const unread = Object.defineProperty(new Error(), 'message', { get() { reads++; throw new Error('CM_TEMP_PRIVATE_FORMAT_CANARY'); } });
const pg = await pgProbeServer();
const sockets = new Set<Socket>(); let connections = 0, info = 0;
const redis = createServer(socket => {
 connections++; sockets.add(socket); socket.on('error', () => {}); socket.on('close', () => sockets.delete(socket)); let buffer = '';
 socket.on('data', data => { buffer += data.toString(); while (buffer.startsWith('*')) {
  const end = buffer.indexOf('\r\n'); if (end < 0) return; const count = Number(buffer.slice(1, end)); let offset = end + 2; const args: string[] = [];
  for (let i = 0; i < count; i++) { const line = buffer.indexOf('\r\n', offset); if (line < 0) return; const n = Number(buffer.slice(offset + 1, line)); if (buffer.length < line + 2 + n + 2) return; args.push(buffer.slice(line + 2, line + 2 + n)); offset = line + 2 + n + 2; }
  buffer = buffer.slice(offset); const cmd = args[0]!.toLowerCase();
  if (cmd === 'info') { info++; socket.write('-NOPERM ' + canary + '\r\n'); }
  else if (cmd === 'get') socket.write('-ERR ' + canary + '\r\n');
  else { socket.write('+OK\r\n'); if (cmd === 'quit') socket.end(); }
 } });
});
await new Promise<void>(r => redis.listen(0, '127.0.0.1', r)); const address = redis.address(); assert.ok(address && typeof address === 'object');
try {
 const pd = await make({ id, kind: 'postgres', url: `postgres://u:ok@127.0.0.1:${pg.port}/fixture` });
 await (pd as Driver & { probeReachability(): Promise<void> }).probeReachability();
 const rd = await make({ id: id + '-redis', kind: 'redis', url: `redis://127.0.0.1:${address.port}` });
 const rawRedis = (rd as unknown as { client: import('ioredis').Redis }).client;
 await (rd as Driver & { probeReachability(): Promise<void> }).probeReachability();
 await assert.rejects(rawRedis.get('CM_TEMP_PRIVATE_ROW_CANARY'));
 // Real reconnect work and idle events occur outside the original factory/callback.
 const ready = once(rawRedis, 'ready'); for (const socket of sockets) socket.destroy(); await ready; assert.ok(connections >= 2); assert.equal(info, 0);
 const pool = (pd as unknown as { pool: import('pg').Pool }).pool;
 const event = once(pool, 'error').catch(() => {}); pg.idleError(canary); await event;
 const saved = await getFactory('postgres')!({ id: 'CM_SAVED_DRIVER_POSITIVE_MARKER', kind: 'postgres', url: `postgres://u:ok@127.0.0.1:${pg.port}/fixture` });
 const savedPool = (saved as unknown as { pool: import('pg').Pool }).pool;
 savedPool.emit('error', new Error('CM_SAVED_EVENT_POSITIVE_MARKER'));
 const sqlitePath = join(root, 'CM_TEMP_PRIVATE_PATH_CANARY.sqlite');
 const { DatabaseSync } = await import('node:sqlite'); const database = new DatabaseSync(sqlitePath); database.exec('CREATE TABLE CM_TEMP_PRIVATE_TABLE_CANARY (value TEXT); INSERT INTO CM_TEMP_PRIVATE_TABLE_CANARY VALUES (\'CM_TEMP_PRIVATE_ROW_CANARY\')'); database.close();
 const sqlite = await make({ id: id + '-sqlite', kind: 'sqlite', path: sqlitePath });
 await (sqlite as RdbmsDriver).sample('CM_TEMP_PRIVATE_TABLE_CANARY', { limit: 1 });
 const mem = await make({ id: id + '-memcached', kind: 'memcached', options: { servers: ['127.0.0.1:1'] } });
 const memClient = (mem as unknown as { client: { options: { logger: { log(value: unknown): void } } } }).client;
 memClient.options.logger.log(unread);
 const mongo = await make({ id: id + '-mongo', kind: 'mongodb', url: 'mongodb://127.0.0.1:1/CM_TEMP_PRIVATE_DATABASE_CANARY' });
 const mongoClient = (mongo as unknown as { client: import('mongodb').MongoClient }).client;
 assert.equal(mongoClient.options.mongodbLogComponentSeverities?.command, 'off');
 const cassandra = await make({ id: id + '-cassandra', kind: 'cassandra', options: { contactPoints: ['127.0.0.1'], localDataCenter: 'datacenter1' } });
 const cassandraClient = (cassandra as unknown as { client: { options: { logEmitter(...args: unknown[]): void } } }).client;
 cassandraClient.options.logEmitter('log', 'error', canary, unread);
 const dynamo = await make({ id: id + '-dynamo', kind: 'dynamodb', options: { region: 'us-east-1' } });
 const dynamoClient = (dynamo as unknown as { client: { config: { logger: { warn(value: unknown): void } } } }).client;
 dynamoClient.config.logger.warn(unread);
 const mysql = await make({ id: id + '-mysql', kind: 'mysql', url: 'mysql://u:p@127.0.0.1:1/fixture?debug=true' });
 const mysqlPool = (mysql as unknown as { pool: { pool: { config: { connectionConfig: { debug: boolean } } } } }).pool;
 assert.equal(mysqlPool.pool.config.connectionConfig.debug, false);
 const click = await make({ id: id + '-click', kind: 'clickhouse', url: 'http://127.0.0.1:1/CM_TEMP_PRIVATE_DATABASE_CANARY' });
 await assert.rejects((click as Driver & { probeReachability(): Promise<void> }).probeReachability());
 for (const kind of ['nats', 'etcd']) await assert.rejects(make({ id: id + kind, kind, options: { servers: ['127.0.0.1:1'], bucket: 'fixture', hosts: ['127.0.0.1:1'] } }), { code: 'unsupported-temporary' });
 now = 90000; owner.sweepExpired();
 // Source-bearing getters cannot execute on late idle/error/disposal callbacks.
 await delay(5); pool.emit('error', unread); rawRedis.emit('error', unread); memClient.options.logger.log(unread);
 for (const driver of drivers) await driver.close();
 pool.emit('error', unread); rawRedis.emit('error', unread); assert.equal(reads, 0);
 savedPool.emit('error', new Error('CM_SAVED_AFTER_EXPIRY_MARKER')); await saved.close();
 getLogger('saved-concurrent-control').info('CM_SAVED_LOG_POSITIVE_MARKER');
 await delay(500);
 await new Promise<void>(resolve => getLogger('saved-concurrent-control').flush(() => resolve()));
 await delay(200);
 process.stdout.write(JSON.stringify({ connections, info, reads, completed: true }) + '\n');
} finally {
 for (const driver of drivers) await driver.close().catch(() => {}); await owner.close(); await pg.close(); for (const socket of sockets) socket.destroy(); await new Promise<void>(r => redis.close(() => r()));
}
process.exit(0);
