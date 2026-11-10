import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test, { mock } from 'node:test';
import type { TestContext } from 'node:test';

import { Connection } from 'tedious';
import type { Request } from 'tedious';

import type { ConnectionConfig, KvDriver, RdbmsDriver } from '../../../shared/db-driver.js';
import { connectionsPath } from '../config.js';
import { DriverPool } from '../pool.js';
import { environment } from './fixtures/saved-management-fixture.js';
import '../drivers/cassandra.js';
import '../drivers/etcd.js';
import '../drivers/mssql.js';

async function savedPool(t: TestContext, config: ConnectionConfig): Promise<DriverPool> {
  const env = await environment();
  const root = join(env.directory, 'repo');
  const path = connectionsPath(root);
  const pool = new DriverPool(root);
  t.after(async () => {
    await pool.closeAll();
    await env.cleanup();
  });
  await mkdir(root);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify({ connections: [config] }));
  await pool.reload();
  return pool;
}

test('saved SQL Server configuration uses Tedious for schema and bounded reads at the SDK boundary', async t => {
  const queries: string[] = [];
  const connect = mock.method(Connection.prototype, 'connect', function (this: Connection) {
    queueMicrotask(() => this.emit('connect'));
  });
  const execute = mock.method(Connection.prototype, 'execSql', (request: Request) => {
    const sql = request.sqlTextOrProcedure;
    queries.push(sql);
    let row: Record<string, unknown>;
    if (/FROM sys.columns/.test(sql)) {
      row = { col_name: 'id', col_type: 'int', is_nullable: false };
    } else if (/FROM sys.indexes/.test(sql)) {
      row = { col_name: 'id' };
    } else if (sql === 'SELECT TOP 1 * FROM [dbo].[orders]') {
      row = { id: 42 };
    } else {
      assert.equal(sql, 'SELECT 1');
      row = { probe: 1 };
    }
    request.emit('row', Object.entries(row).map(([colName, value]) => ({ metadata: { colName }, value })));
    request.callback(null);
  });
  t.after(() => { connect.mock.restore(); execute.mock.restore(); });
  const pool = await savedPool(t, { id: 'fixture', kind: 'mssql', url: 'mssql://user:fixture@127.0.0.1:1/db' });
  const driver = await pool.acquire('fixture') as RdbmsDriver;
  await driver.probeReachability!();
  const schema = await driver.describe('dbo.orders');
  assert.deepEqual(schema.columns.map(column => [column.name, column.primaryKey]), [['id', true]]);
  const sample = await driver.sample('dbo.orders', { limit: 1 });
  assert.deepEqual(sample.rows, [{ id: 42 }]);
  assert.equal(queries.length, 4);
});

const cassandra = process.env.INSRC_TEST_CASSANDRA_ADDRESS;
if (cassandra) {
  test('saved Cassandra configuration discovers columns and performs a bounded read', async t => {
    const pool = await savedPool(t, {
      id: 'fixture', kind: 'cassandra', url: 'cassandra://' + cassandra,
      options: { contactPoints: [cassandra], keyspace: 'insrc_test' },
    });
    const driver = await pool.acquire('fixture') as KvDriver;
    const schema = await driver.describeNamespace!('insrc_test.orders', { sampleSize: 1 });
    assert.ok(schema.fields.some(field => field.path === 'label'));
    assert.equal((await driver.scan({ prefix: 'insrc_test.orders', limit: 1 })).keys.length, 1);
  });
}

const etcd = process.env.INSRC_TEST_ETCD_ADDRESS;
if (etcd) {
  test('saved etcd configuration discovers fields and reads a seeded key', async t => {
    const pool = await savedPool(t, {
      id: 'fixture', kind: 'etcd', url: 'http://' + etcd,
      options: { hosts: [etcd] },
    });
    const driver = await pool.acquire('fixture') as KvDriver;
    const shape = await driver.describeNamespace!('orders', { sampleSize: 1 });
    assert.ok(shape.fields.some(field => field.path === 'label'));
    assert.deepEqual((await driver.get('orders/first')).value, { label: 'verified' });
  });
}
