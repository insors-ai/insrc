import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import '../drivers/index.js';
import { listRegisteredKinds, getFactory } from '../registry.js';
import { PATHS } from '../../../shared/paths.js';
import { loadConnections, saveConnections } from '../config.js';
import type { ConnectionConfig, RdbmsDriver } from '../../../shared/db-driver.js';
import { connectionSourceInventory } from './connection-source-inventory.js';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const fixtures = new URL('./fixtures/', import.meta.url);
interface Row {
	kind: string; family: string; sources: string[]; publicFields: string[];
	credentialFields: string[]; retainedOnlyFields: string[]; identityFields: string[];
	unknownFieldPolicy: string; unknownDraftPolicy: string; familyPolicy: string;
	fixture: Record<string, unknown>; dialect: string; rejectedShapes: string[];
}
const matrix = JSON.parse(readFileSync(new URL('driver-field-matrix.json', fixtures), 'utf8')) as {
	rows: Row[]; sourceDigests: Record<string, string>;
};

function leaf(object: unknown, path: string): unknown {
	let value = object;
	for (const part of path.replaceAll('[]', '.0').split('.')) {
		if (value === null || typeof value !== 'object') return undefined;
		value = (value as Record<string, unknown>)[part];
	}
	return value;
}

test('CM-S1-A: every registered kind has a grounded fail-closed field classification and preservation fixture', async () => {
	assert.deepEqual(matrix.rows.map(r => ({ kind: r.kind, family: r.family })).sort((a,b)=>a.kind.localeCompare(b.kind)),
		[...listRegisteredKinds()].sort((a,b)=>a.kind.localeCompare(b.kind)));
	for (const row of matrix.rows) {
		const groups = [row.publicFields, row.credentialFields, row.retainedOnlyFields, row.identityFields];
		const fields = groups.flat();
		assert.equal(new Set(fields).size, fields.length, `${row.kind}: overlapping classification`);
		assert.equal(row.unknownFieldPolicy, 'preserve-private-block-edit');
		assert.equal(row.unknownDraftPolicy, 'reject');
		assert.match(row.familyPolicy, /preserve-explicit-legacy-pin/);
		assert.equal(row.fixture.kind, row.kind);
		assert.notEqual(row.fixture.family, row.family, 'fixture exercises explicit legacy family pin');
		assert.deepEqual(row.fixture.legacyOpaque, { mustSurvive: 'retained privately; blocks edit until classified' });
		assert.ok(!row.publicFields.includes('legacyOpaque'));
		assert.ok(row.retainedOnlyFields.includes('secretRef'));
		assert.ok(row.dialect.length > 20 && row.rejectedShapes.length >= 4);
		for (const field of [...row.publicFields, ...row.credentialFields]) {
			assert.notEqual(leaf(row.fixture, field), undefined, `${row.kind}: missing fixture for ${field}`);
		}
		for (const source of row.sources) assert.ok(matrix.sourceDigests[source], `${row.kind}: ungrounded source`);
	}
	for (const [file, digest] of Object.entries(matrix.sourceDigests)) {
		assert.equal(createHash('sha256').update(readFileSync(new URL(file, `file://${root}`))).digest('hex'), digest,
			`${file}: source changed; reclassify field reads before implementing/enabling profiles`);
	}
	// Exercise the existing persistence ports, not a test-only projection/merge helper.
	// This file's tests are sequential; restore the isolated path before the inventory test.
	const isolated = mkdtempSync(join(tmpdir(), 'cm-field-roundtrip-'));
	const previous = PATHS.insrc;
	try {
		PATHS.insrc = isolated;
		const original = { connections: matrix.rows.map(row => row.fixture as unknown as ConnectionConfig),
			legacyMetadata: { retain: ['top-level', 'unknown'] } };
		await saveConnections('/synthetic/audit', original);
		const loaded = await loadConnections('/synthetic/audit');
		assert.deepEqual(loaded.file, original);
		await saveConnections('/synthetic/audit', { ...loaded.file,
			connections: loaded.file.connections.map(config => ({ ...config, label: 'edited-label' })) });
		const roundtrip = await loadConnections('/synthetic/audit');
		assert.deepEqual(roundtrip.file, { ...original,
			connections: original.connections.map(config => ({ ...config, label: 'edited-label' })) });
		for (const row of matrix.rows) {
			const retained = roundtrip.file.connections.find(config => config.kind === row.kind);
			for (const field of row.retainedOnlyFields) {
				assert.notEqual(leaf(row.fixture, field), undefined, `${row.kind}: missing retained fixture ${field}`);
				assert.deepEqual(leaf(retained, field), leaf(row.fixture, field), `${row.kind}: retained ${field}`);
			}
		}
	} finally {
		PATHS.insrc = previous;
		rmSync(isolated, { recursive: true, force: true });
	}
	for (const kind of ['etcd','memcached']) {
		assert.ok(matrix.rows.find(r=>r.kind===kind)?.credentialFields.includes('options.password'));
	}
	for (const row of matrix.rows.filter(r=>r.family==='file')) {
		assert.ok(row.publicFields.includes('recursive') && row.publicFields.includes('partitioning'));
	}
});

test('CM-S1-L: typed production acquisition aliases and factory sites have explicit migration classifications', () => {
	const baseline = JSON.parse(readFileSync(new URL('connection-source-inventory.json', fixtures), 'utf8')) as {
		sites: ReturnType<typeof connectionSourceInventory>;
		files: Record<string, { classification: string; rationale: string }>;
	};
	const actual = connectionSourceInventory(root);
	assert.deepEqual(actual, baseline.sites, 'New/changed source sites must be classified; do not blindly regenerate the baseline');
	assert.deepEqual([...new Set(actual.map(s=>s.file))].sort(), Object.keys(baseline.files).sort());
	for (const site of actual) {
		const entry = baseline.files[site.file];
		assert.ok(entry?.classification && entry.rationale.length > 20, site.file);
	}
	for (const file of ['db-connections-list','db-table-describe','db-tables-list']) {
		const path = `src/analyze/explore/${file}.ts`;
		assert.ok(actual.some(s=>s.file===path && s.expression==='createConnectionResolver({ poolSource: acquire })' && s.boundary==='resolver-port-call'));
		assert.ok(actual.some(s=>s.file===path && s.expression===`resolver.${file==='db-connections-list'?'list':'withConnection'}` && s.boundary==='resolver-member'));
		assert.ok(!actual.some(s=>s.file===path && (s.expression==='acquire(ctx.repoPath)' || s.boundary==='driver-port-call')), 'Injected aliases must not acquire a raw driver');
	}
	assert.ok(actual.some(s=>s.file==='src/analyze/measure.ts' && s.expression==='resolver.withConnection' && s.boundary==='resolver-member'));
	assert.ok(!actual.some(s=>s.file==='src/analyze/measure.ts' && s.boundary==='driver-port-call'), 'Measurement must not acquire a raw driver outside its shared work lease');
	assert.ok(actual.some(s=>s.file==='src/daemon/db-rpc.ts' && s.boundary==='driver-port-call'));
	assert.ok(actual.some(s=>s.file==='src/daemon/tools/builtins/db/index.ts' && s.boundary==='symbol:acquireDriver'));
});


test('SQLite file URLs preserve encoded pathname text and explicit path takes precedence', async () => {
 const isolated = mkdtempSync(join(tmpdir(), 'cm-sqlite-dialect-'));
 try {
  for (const [filename, column] of [['a%20b.sqlite','encoded_marker'],['a b.sqlite','decoded_marker']]) {
   const db = new DatabaseSync(join(isolated, filename!));
   try { db.exec(`CREATE TABLE fixture (${column} INTEGER)`); } finally { db.close(); }
  }
  const factory = getFactory('sqlite');
  assert.ok(factory);
  for (const config of [
   { id:'encoded', kind:'sqlite', url:`file://${isolated}/a%20b.sqlite` },
   { id:'path-wins', kind:'sqlite', path:join(isolated,'a%20b.sqlite'), url:`file://${isolated}/absent.sqlite` },
  ]) {
   const driver = await factory(config) as RdbmsDriver;
   try { assert.deepEqual((await driver.describe('fixture')).columns.map(c=>c.name), ['encoded_marker']); }
   finally { await driver.close(); }
  }
 } finally { rmSync(isolated, { recursive:true, force:true }); }
});
