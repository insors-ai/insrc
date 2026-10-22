import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { REPO_SCHEMA_FILE, RepoSchemaGate, writeRepoSchema } from '../repo-schema.js';
import { RepoSchemaError } from '../types.js';

describe('RepoSchemaGate', () => {
	it('RepoSchemaGate reads version 1 with no marker, requires a version and throws on an invalid marker', () => {
		const repo = mkdtempSync(join(tmpdir(), 'schema-'));
		try {
			const put = (text: string) => { mkdirSync(join(repo, '.insrc'), { recursive: true }); writeFileSync(join(repo, REPO_SCHEMA_FILE), text); };

			// no marker: version 1, unconverted, and the call writes nothing
			assert.deepEqual(RepoSchemaGate.read(repo), { version: 1 });
			assert.deepEqual(readdirSync(repo), []);
			assert.equal(RepoSchemaGate.require(repo, 1).ok, true);
			const refused = RepoSchemaGate.require(repo, 2);
			assert.equal(refused.ok, false);
			assert.match(refused.ok ? '' : refused.message, /version 1.*version 2.*s9 conversion/);

			// a valid marker
			put(JSON.stringify({ version: 2, convertedAt: '2026-10-20T00:00:00Z' }));
			assert.deepEqual(RepoSchemaGate.read(repo), { version: 2, convertedAt: '2026-10-20T00:00:00Z' });
			assert.deepEqual(RepoSchemaGate.require(repo, 2), { ok: true });
			assert.deepEqual(RepoSchemaGate.require(repo, 1), { ok: true });
			assert.equal(RepoSchemaGate.require(repo, 3).ok, false);
			put(JSON.stringify({ version: 2 }));
			assert.deepEqual(RepoSchemaGate.read(repo), { version: 2 });

			// an invalid marker throws from read and from require, and is never treated as unconverted
			for (const bad of ['{nope', '[]', '"x"', '{}', '{"version":"2"}', '{"version":1.5}', '{"version":0}', '{"version":2,"convertedAt":5}']) {
				put(bad);
				assert.throws(() => RepoSchemaGate.read(repo), RepoSchemaError, bad);
				assert.throws(() => RepoSchemaGate.require(repo, 2), RepoSchemaError, bad);
			}
		} finally { rmSync(repo, { recursive: true, force: true }); }
	});
});

describe('writeRepoSchema', () => {
	it('writeRepoSchema writes by temporary file and rename', () => {
		const repo = mkdtempSync(join(tmpdir(), 'schema-write-'));
		try {
			writeRepoSchema(repo, { version: 2, convertedAt: '2026-10-22T00:00:00.000Z' });
			assert.deepEqual(RepoSchemaGate.read(repo), { version: 2, convertedAt: '2026-10-22T00:00:00.000Z' });
			assert.deepEqual(readdirSync(join(repo, '.insrc')), ['schema.json'], 'no temporary file is left');
			assert.throws(() => writeRepoSchema(repo, { version: 0 }), RepoSchemaError);
			assert.deepEqual(RepoSchemaGate.read(repo).version, 2, 'a refused write leaves the marker as it was');
		} finally { rmSync(repo, { recursive: true, force: true }); }
	});
});
