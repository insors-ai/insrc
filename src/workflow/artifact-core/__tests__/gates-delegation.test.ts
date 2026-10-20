import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ArtifactMissingError, readDefineArtifact, readHldArtifact, readLldArtifact, readPlanArtifact } from '../../gates.js';
import { artifactJsonPath, defineArtifactId, hldArtifactId, lldArtifactId, planArtifactId } from '../../storage.js';
import { ArtifactShapeError } from '../types.js';

const H = '0123456789abcdef';

describe('gates readers', () => {
	it('the four gates readers return the same artifact and the same missing-file error as before, synchronously', () => {
		const repo = mkdtempSync(join(tmpdir(), 'gates-'));
		try {
			mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
			const head = (workflow: string) => ({ meta: { workflow, epicHash: H, revision: 2 }, body: { marker: workflow }, citations: [{ id: 'c1' }] });
			const readers: [string, string, () => unknown, object][] = [
				[defineArtifactId(H), 'Define artifact not found', () => readDefineArtifact(repo, H), head('define')],
				[hldArtifactId(H), 'HLD not found', () => readHldArtifact(repo, H), head('design.epic')],
				[lldArtifactId(H, 's1'), 'LLD not found', () => readLldArtifact(repo, H, 's1'), head('design.story')],
				[planArtifactId(H, 's1'), 'Plan not found', () => readPlanArtifact(repo, H, 's1'), head('plan')],
			];
			for (const [id, missing, read, stored] of readers) {
				// missing file: the same error as before
				assert.throws(() => read(), (e: unknown) => e instanceof ArtifactMissingError && e.message.includes(missing), id);
				// a head with no envelope parts: the stored object, unchanged, returned synchronously (not a promise)
				writeFileSync(artifactJsonPath(repo, id), JSON.stringify(stored));
				const got = read();
				assert.equal(typeof (got as { then?: unknown }).then, 'undefined', `${id} is synchronous`);
				assert.deepEqual(got, stored, id);
				// a head with envelope parts comes back as stored too, parts included
				const withParts = { ...stored, meta: { ...(stored as { meta: object }).meta, envelope: { description: 'd', references: [], attachments: [] } } };
				writeFileSync(artifactJsonPath(repo, id), JSON.stringify(withParts));
				assert.deepEqual(read(), withParts, id);
				// a malformed head fails on the shared decoder
				writeFileSync(artifactJsonPath(repo, id), JSON.stringify({ nope: true }));
				assert.throws(() => read(), ArtifactShapeError, id);
			}
		} finally { rmSync(repo, { recursive: true, force: true }); }
	});
});
