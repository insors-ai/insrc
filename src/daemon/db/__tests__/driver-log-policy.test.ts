import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, realpath, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import { ConnectionSessionOwner } from '../session-owner.js';
import { fileExecutionPolicy } from '../file-policy.js';
import { driverResourceLog, temporaryDriverContext, contextualDriverFactory, invokeTemporaryFactory, supportsTemporaryDriverContext } from '../driver-log-policy.js';
import { getFactory, listRegisteredKinds } from '../registry.js';
import { getLogMode } from '../../../shared/logger.js';
import type { Driver, DriverFactory, DriverFactoryContext, ConnectionConfig } from '../../../shared/db-driver.js';
import '../drivers/index.js';
const denied = (error: unknown) => !!error && typeof error === 'object' && 'code' in error && error.code === 'unsupported-temporary';
async function fixture() {
 const directory = await realpath(await mkdtemp(join(tmpdir(), 'cm-log-policy-'))), root = join(directory, 'root'); await mkdir(root); let now = 0, authority: object | undefined;
 const owner = new ConnectionSessionOwner({ daemonEpoch: 'epoch', monotonicNow: () => now, isRegistered: async value => value === root, createOverlay: (_root, _handle, context) => { authority = context.factoryAuthority; return {}; } });
 const opened = await owner.open({ connectionIdentity: 'server-control', daemonEpoch: 'epoch' }, root);
 const config: ConnectionConfig = Object.freeze({ id: 'fixture', kind: 'sqlite', path: join(root, 'data.sqlite') });
 const policy = fileExecutionPolicy(config, { lookupRoot: root, ownerId: opened.sessionHandle, revision: 'revision', persistence: 'memory-only' });
 return { owner, root, config, policy, authority: authority!, expire() { now = 90000; owner.sweepExpired(); }, close: async () => { await owner.close(); await rm(directory, { recursive: true, force: true }); } };
}

test('CM-S3-DRIVER-LOGS: owner context is immutable lazy quiet and remains quiet after authority expiry', async () => {
 const f = await fixture(), env = () => createHash('sha256').update(JSON.stringify(process.env)).digest('hex'), before = env(), mode = getLogMode(), consoles = [console.log, console.warn, console.error]; let formatted = 0;
 try {
  const context = temporaryDriverContext(f.authority, f.policy), sink = driverResourceLog('db-policy-test', context);
  assert.equal(sink.quiet, true); assert.equal(Object.isFrozen(context), true); assert.equal(Object.isFrozen(context.fileExecutionPolicy), true); assert.equal(Object.isFrozen(context.fileExecutionPolicy!.identity), true);
  assert.throws(() => { (context as { runtimeLogPolicy: string }).runtimeLogPolicy = 'saved-default'; }, TypeError);
  assert.throws(() => Object.defineProperty(context, 'fileExecutionPolicy', { value: f.policy }), TypeError); assert.throws(() => JSON.stringify(context), denied);
  sink.emit('error', () => { formatted++; throw new Error('private-format-canary'); }); assert.equal(formatted, 0);
  f.expire(); sink.emit('warn', () => { formatted++; return { message: 'private-late-canary' }; }); assert.equal(formatted, 0);
  assert.throws(() => temporaryDriverContext(f.authority, f.policy), { code: 'session-expired' });
  const saved = driverResourceLog('db-policy-saved'); assert.equal(saved.quiet, false); saved.emit('info', () => { formatted++; return { message: 'saved-positive-marker' }; }); assert.equal(formatted, 1);
  assert.equal(env(), before); assert.equal(getLogMode(), mode); assert.deepEqual([console.log, console.warn, console.error], consoles);
 } finally { await f.close(); }
});

test('CM-S3-DRIVER-LOGS: missing forged copied and dropped factory policies refuse before config handoff', async () => {
 const f = await fixture(); let constructed = 0, getters = 0; let seen: DriverFactoryContext | undefined;
 const body: DriverFactory = async (config, context) => { constructed++; seen = context; return { id: config.id, kind: config.kind, family: 'rdbms', close: async () => {} } as Driver; };
 const supported = contextualDriverFactory(body);
 try {
  const context = temporaryDriverContext(f.authority, f.policy);
  const driver = await invokeTemporaryFactory(supported, f.config, context); await driver.close(); assert.equal(constructed, 1); assert.equal(seen, context);
  const dropped: DriverFactory = config => supported(config);
  for (const factory of [body, dropped]) assert.throws(() => invokeTemporaryFactory(factory, f.config, context), denied);
  assert.throws(() => supported(f.config), denied); assert.throws(() => supported(f.config, { ...context }), denied);
  assert.throws(() => invokeTemporaryFactory(supported, f.config, undefined as unknown as DriverFactoryContext), denied);
  const forged = Object.freeze({ runtimeLogPolicy: 'temporary-quiet' as const, fileExecutionPolicy: f.policy }); assert.throws(() => invokeTemporaryFactory(supported, f.config, forged), denied);
  const accessor = Object.defineProperty({}, 'runtimeLogPolicy', { enumerable: true, get() { getters++; throw new Error('private-getter-canary'); } });
  assert.throws(() => supported({ ...f.config }, accessor), denied); assert.throws(() => invokeTemporaryFactory(supported, f.config, accessor), denied); assert.equal(getters, 0);
  assert.throws(() => temporaryDriverContext({}, f.policy), denied);
  assert.throws(() => temporaryDriverContext(f.authority, { ...f.policy, identity: { ...f.policy.identity, lookupRoot: '/wrong-root' } }), denied);
  assert.equal(constructed, 1);
  // Public config fields cannot select a resource policy; saved-default construction still works.
  await supported({ ...f.config, options: { runtimeLogPolicy: 'temporary-quiet' } }); assert.equal(seen, undefined); assert.equal(constructed, 2);
 } finally { await f.close(); }
});

test('CM-S3-DRIVER-LOGS: all 29 aliases forward context into 14 constructor guards before SDK creation', async () => {
 const kinds = listRegisteredKinds(); assert.equal(kinds.length, 29); assert.ok(kinds.every(({ kind }) => supportsTemporaryDriverContext(getFactory(kind)!)));
 const targets: Record<string, string> = { pg: 'PostgresDriver', mysql: 'MysqlDriver', sqlite: 'SqliteDriver', mssql: 'MssqlDriver', oracle: 'OracleDriver', clickhouse: 'ClickHouseDriver', redis: 'RedisDriver', mongodb: 'MongoDriver', cassandra: 'CassandraDriver', nats: 'NatsKvDriver', dynamodb: 'DynamoDriver', etcd: 'EtcdDriver', memcached: 'MemcachedDriver', 'duckdb-file': 'DuckDBFileDriver' };
 for (const [file, name] of Object.entries(targets)) {
  const url = new URL(`../drivers/${file}.ts`, import.meta.url), source = await readFile(url, 'utf8'), tree = ts.createSourceFile(url.pathname, source, ts.ScriptTarget.Latest, true);
  let constructors = 0, forwarded = 0, registrations = 0;
  function visit(node: ts.Node) {
   if (ts.isClassDeclaration(node) && node.name?.text === name) {
    const ctor = node.members.find(ts.isConstructorDeclaration); assert.ok(ctor?.body); assert.equal(ctor.parameters.at(-1)!.name.getText(tree), 'context');
    const first = ctor.body.statements[0]; assert.ok(first && ts.isExpressionStatement(first) && ts.isBinaryExpression(first.expression));
    const call = first.expression.right; assert.ok(ts.isCallExpression(call)); assert.equal(call.expression.getText(tree), 'driverResourceLog'); assert.equal(call.arguments[1]!.getText(tree), 'context'); constructors++;
    // SDK clients may not be initialized in class fields before the context guard runs.
    for (const member of node.members) if (ts.isPropertyDeclaration(member) && member.initializer) {
     const check = (child: ts.Node) => { if (ts.isNewExpression(child)) assert.ok(['Map', 'Set', 'WeakMap', 'WeakSet', 'AbortController'].includes(child.expression.getText(tree)), `${name} initializes an SDK before its policy`); ts.forEachChild(child, check); }; check(member.initializer);
    }
   }
   if (ts.isNewExpression(node) && node.expression.getText(tree) === name) { assert.equal(node.arguments!.at(-1)!.getText(tree), 'context'); forwarded++; }
   if (ts.isCallExpression(node) && node.expression.getText(tree) === 'registerDriver') { assert.equal(node.arguments[1]!.getText(tree), "'resource-context'"); registrations++; }
   ts.forEachChild(node, visit);
  }
  visit(tree); assert.equal(constructors, 1, file); assert.ok(forwarded > 0 && registrations > 0, file);
 }
});
