import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { History } from '../../artifact-core/history.js';
import { REPO_SCHEMA_FILE, RepoSchemaGate } from '../../artifact-core/repo-schema.js';
import type { Actor } from '../../artifact-core/types.js';
import { artifactJsonPath } from '../../storage.js';
import { H, setKit } from '../../tasks/__tests__/task-set-kit.js';
import { applyConversion, CONVERSION_RULES } from '../apply.js';
import { PROGRESS_FILE, writeMarkerIfClean } from '../marker.js';
import { planConversion } from '../plan.js';
import { ConversionIncomplete } from '../types.js';
import type { ConversionDeps } from '../types.js';

const MIGRATION: Actor = { id: 'insrc:migration', kind: 'system', properties: {} };
const AT = '2026-10-10T00:00:00.000Z';
const LLD = `LLD-${H}-s1`;

const snapshotOfFiles = (repo: string): Record<string, string> => {
	const out: Record<string, string> = {};
	const dir = join(repo, '.insrc', 'artifacts');
	for (const n of readdirSync(dir).sort()) out[n] = readFileSync(join(dir, n), 'utf8');
	return out;
};

describe('convert-marker', () => {
	it('convert-marker.test.ts: the marker is written last and only when every head is clean', async () => {
		const kit = setKit();
		try {
			const repo = kit.k.repo;
			const git = (...a: string[]): void => { execFileSync('git', ['-C', repo, ...a], { stdio: 'ignore' }); };
			git('init', '-q', '-b', 'main'); git('config', 'user.email', 't@e.com'); git('config', 'user.name', 'T');
			mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
			const put = (id: string, v: unknown): void => writeFileSync(join(repo, '.insrc', 'artifacts', `${id}.json`), JSON.stringify(v, null, 2) + '\n');
			const meta = (extra: Record<string, unknown>) => ({ epicHash: H, createdAt: AT, epicCreatedAt: AT, revision: 2, ...extra });
			put(`DEF-${H}`, { meta: meta({ workflow: 'define', approvedAt: AT }), body: { stories: [{ id: 's1', title: 'First' }] }, citations: [] });
			put(LLD, { meta: meta({ workflow: 'design.story', storyId: 's1', approvedAt: AT }), body: { goal: 'g' }, citations: [] });
			git('add', '-A'); git('commit', '-q', '-m', 'legacy');

			const history = new History(kit.k.sidecar);
			const deps = { store: kit.k.store, history, taskSets: kit.sets, now: () => new Date('2026-10-22T00:00:00.000Z'), actor: MIGRATION } as unknown as ConversionDeps;
			const plan = await planConversion(repo, { rules: CONVERSION_RULES });
			await applyConversion(repo, plan, deps, { deliveryReadsLifecycle: () => true });

			// the apply writes every head and not the marker
			assert.equal(existsSync(join(repo, REPO_SCHEMA_FILE)), false);
			assert.equal(RepoSchemaGate.read(repo).version, 1);

			// a head that still carries a legacy field is listed and blocks the marker
			const path = artifactJsonPath(repo, LLD);
			const clean = readFileSync(path, 'utf8');
			const dirty = JSON.parse(clean) as { meta: Record<string, unknown> };
			dirty.meta['approvedAt'] = AT;
			writeFileSync(path, JSON.stringify(dirty, null, 2) + '\n');
			await assert.rejects(writeMarkerIfClean(repo, history, deps.now), (e: unknown) => e instanceof ConversionIncomplete
				&& e.heads.length === 1 && e.heads[0]!.artifactId === LLD && /still carries approvedAt/.test(e.heads[0]!.reason));
			assert.equal(existsSync(join(repo, REPO_SCHEMA_FILE)), false, 'a blocked sweep writes no marker');
			assert.equal(existsSync(join(repo, PROGRESS_FILE)), true, 'and the progress file stays for the rerun');

			// the heads are clean: the marker is written, by a temporary file that is renamed, and the progress file goes
			writeFileSync(path, clean);
			const report = await writeMarkerIfClean(repo, history, deps.now);
			assert.deepEqual(report.problems, []);
			assert.deepEqual(RepoSchemaGate.read(repo), { version: 2, convertedAt: '2026-10-22T00:00:00.000Z' });
			assert.deepEqual(readdirSync(join(repo, '.insrc')).filter(n => n.includes('schema')), ['schema.json']);
			assert.equal(existsSync(join(repo, PROGRESS_FILE)), false);

			// a second apply writes nothing, and a second sweep leaves the marker as it was
			const before = snapshotOfFiles(repo);
			const again = await applyConversion(repo, await planConversion(repo, { rules: CONVERSION_RULES }), deps, { deliveryReadsLifecycle: () => true });
			assert.deepEqual(again.written, []);
			assert.deepEqual(snapshotOfFiles(repo), before);
			await writeMarkerIfClean(repo, history, () => new Date('2027-01-01T00:00:00.000Z'));
			assert.equal(RepoSchemaGate.read(repo).convertedAt, '2026-10-22T00:00:00.000Z');
		} finally { kit.done(); }
	});
});
