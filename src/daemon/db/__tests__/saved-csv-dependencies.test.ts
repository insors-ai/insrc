import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

import type { FileDriver } from '../../../shared/db-driver.js';
import { listConnectionsRpc, saveConnectionRpc } from '../../db-rpc.js';
import { closeDuckDB } from '../duckdb-pool.js';
import { DriverPool } from '../pool.js';
import { environment } from './fixtures/saved-management-fixture.js';

test('saved CSV registers, previews rows, and answers a bounded query through DuckDB', async () => {
  const env = await environment();
  const fixture = await env.rootFixture('csv');
  const repoRoot = fixture.root;
  const pool = new DriverPool(repoRoot);
  const transport = { connectionIdentity: 'csv-fixture', daemonEpoch: 'fixture' };
  try {
    await writeFile(join(repoRoot, 'orders.csv'), 'id,amount\n1,12\n2,19\n');
    const saved = await saveConnectionRpc({
      repoRoot,
      config: { id: 'orders', kind: 'csv', path: 'orders.csv' },
    }, transport);
    assert.ok('wrotePath' in saved, JSON.stringify(saved));
    const registered = await listConnectionsRpc({ repoRoot }, transport);
    assert.ok(Array.isArray(registered));
    assert.ok(registered.some(connection => connection.id === 'orders' && connection.kind === 'csv'));

    await pool.reload();
    const driver = await pool.acquire('orders') as FileDriver;
    const schema = await driver.describe!();
    assert.deepEqual(schema.columns.map(column => column.name), ['id', 'amount']);
    const preview = await driver.sample!(undefined, { limit: 1, where: [{ column: 'id', op: '=', value: 1 }] });
    assert.equal(Number(preview.rows[0]?.amount), 12);
    const result = await driver.aggregate!(undefined, {
      aggregations: [{ column: 'amount', function: 'sum' }],
      where: [{ column: 'id', op: '=', value: 2 }],
    });
    assert.equal(result.values.amount__sum, 19);
  } finally {
    await pool.closeAll();
    await closeDuckDB();
    await env.cleanup();
  }
});
