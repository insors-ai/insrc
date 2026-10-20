import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { prepareArtifactWrite, writeArtifact } from '../storage.js';

const art = (body: string, extra: Record<string, unknown> = {}) => ({ meta: { workflow: 'x', ...extra }, body: { text: body }, citations: [] });

describe('prepareArtifactWrite', () => {
	it('prepareArtifactWrite returns the bytes and revision writeArtifact writes for content, meta-only, identical and first writes, and writes nothing', () => {
		const dir = mkdtempSync(join(tmpdir(), 'prep-'));
		try {
			const path = join(dir, 'a.json');

			// first write: nothing on disk yet, prepare writes nothing
			const first = prepareArtifactWrite(path, art('one'), 'content');
			assert.equal(existsSync(path), false);
			assert.equal(first.revision, 1);
			assert.equal(first.contentChanged, true);
			assert.equal(writeArtifact(path, art('one'), 'content'), first.revision);
			assert.equal(readFileSync(path, 'utf8'), first.bytes);

			// identical rewrite keeps the revision and reports no content change
			const same = prepareArtifactWrite(path, art('one'), 'content');
			assert.equal(same.revision, 1);
			assert.equal(same.contentChanged, false);
			assert.equal(writeArtifact(path, art('one'), 'content'), 1);
			assert.equal(readFileSync(path, 'utf8'), same.bytes);

			// content change moves the revision
			const changed = prepareArtifactWrite(path, art('two'), 'content');
			assert.equal(changed.revision, 2);
			assert.equal(changed.contentChanged, true);
			assert.equal(readFileSync(path, 'utf8'), same.bytes, 'prepare did not touch the file');
			assert.equal(writeArtifact(path, art('two'), 'content'), 2);
			assert.equal(readFileSync(path, 'utf8'), changed.bytes);

			// meta-only keeps the on-disk revision
			const metaOnly = prepareArtifactWrite(path, art('two', { note: 'n' }), 'meta-only');
			assert.equal(metaOnly.revision, 2);
			assert.equal(metaOnly.contentChanged, false);
			assert.equal(writeArtifact(path, art('two', { note: 'n' }), 'meta-only'), 2);
			assert.equal(readFileSync(path, 'utf8'), metaOnly.bytes);

			// still only the one file: no temp files left behind by prepare
			assert.deepEqual(readdirSync(dir), ['a.json']);
		} finally { rmSync(dir, { recursive: true, force: true }); }
	});
});
