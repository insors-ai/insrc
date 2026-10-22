import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { migratedEntryId } from '../entry-ids.js';
import type { ApplyStep } from '../apply.js';
import { runConversion } from '../run.js';
import { legacyRepo } from './legacy-repo.js';
import type { LegacyRepo } from './legacy-repo.js';

const STEPS: ApplyStep[] = ['rename', 'stamp', 'amendments', 'feedback', 'migrate', 'units', 'tasks', 'story-history'];

/** Every file of the repository outside git, as it is. */
function bytesOf(repo: string): Record<string, string> {
	const out: Record<string, string> = {};
	const walk = (dir: string): void => {
		for (const n of readdirSync(dir, { withFileTypes: true })) {
			if (n.name === '.git') continue;
			const p = join(dir, n.name);
			if (n.isDirectory()) walk(p); else out[p.slice(repo.length)] = readFileSync(p, 'utf8');
		}
	};
	walk(repo);
	return out;
}

/** The same, with what differs by run replaced: the ids and the clock of the store and the wall clock of the lifecycle service, the repository's path; and the line files in line order. */
function normalized(repo: string): Record<string, string> {
	const out: Record<string, string> = {};
	for (const [file, text] of Object.entries(bytesOf(repo))) {
		const plain = text.split(repo).join('REPO').replace(/2026-10-20T12:00:\d\d\.\d{3}Z/g, 'STORE-CLOCK').replace(/\d{4}-\d\d-\d\dT(?!00:00:00\.000Z)\d\d:\d\d:\d\d\.\d{3}Z(?<=2026-10-22T[0-9:.]+Z)/g, 'WALL-CLOCK').replace(/store-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, 'store-RUN').replace(/\b[0-9a-f]{32}\b/g, 'ID');
		out[file] = file.endsWith('.jsonl') ? plain.split('\n').sort().join('\n') : plain;
	}
	return out;
}

async function migratedEntries(r: LegacyRepo): Promise<Record<string, number>> {
	const counts: Record<string, number> = {};
	for (const n of readdirSync(join(r.repo, '.insrc', 'artifacts')).filter(f => f.endsWith('.json'))) {
		const id = n.slice(0, -'.json'.length);
		const log = await r.deps.history.log(id).catch(() => []);
		counts[id] = log.filter(e => e.id === migratedEntryId(id)).length;
	}
	return counts;
}

describe('convert-repeat', () => {
	it('convert-repeat.test.ts: a second apply and an apply crashed at each step then rerun write nothing more', async () => {
		// the reference: an uninterrupted apply
		const ref = legacyRepo();
		let expected: Record<string, string>;
		try {
			const preview = await runConversion(ref.repo, 'preview', ref.deps);
			assert.equal(preview.mode, 'preview');
			assert.equal(preview.result, undefined);
			const report = await runConversion(ref.repo, 'apply', ref.deps, { deliveryReadsLifecycle: () => true });
			assert.equal(report.result?.markerWritten, true);
			assert.deepEqual(report.result?.verification?.differences, []);
			expected = normalized(ref.repo);
			const migrated = await migratedEntries(ref);
			assert.ok(Object.keys(migrated).length > 5);
			for (const [id, n] of Object.entries(migrated)) if (!/^(EPIC|STORY|TASKS?)-/.test(id)) assert.equal(n, 1, `${id} has one migrated entry`);

			// a second apply writes nothing: the bytes of every file are unchanged
			const before = bytesOf(ref.repo);
			const again = await runConversion(ref.repo, 'apply', ref.deps, { deliveryReadsLifecycle: () => true });
			assert.deepEqual(again.result?.written, []);
			assert.deepEqual(bytesOf(ref.repo), before);
		} finally { ref.done(); }

		// a crash after each step, and in the middle of the migration, then a rerun: the result of the uninterrupted run
		const crashes: { name: string; options(): { seams: { afterStep?: (s: ApplyStep) => void; headSeams?: { beforeHeadWrite: () => void } } } }[] = [
			...STEPS.map(step => ({ name: `after ${step}`, options: () => ({ seams: { afterStep: (s: ApplyStep) => { if (s === step) throw new Error(`crash after ${step}`); } } }) })),
			{ name: 'in the migration of the second head', options: () => { let n = 0; return { seams: { headSeams: { beforeHeadWrite: () => { n += 1; if (n === 2) throw new Error('crash between a head\'s entries and its replace'); } } } }; } },
		];
		for (const crash of crashes) {
			const r = legacyRepo();
			try {
				await assert.rejects(runConversion(r.repo, 'apply', r.deps, { deliveryReadsLifecycle: () => true, ...crash.options() }), /crash/, crash.name);
				const done = await runConversion(r.repo, 'apply', r.deps, { deliveryReadsLifecycle: () => true });
				assert.equal(done.result?.markerWritten, true, `${crash.name}: the rerun finishes`);
				assert.deepEqual(done.result?.verification?.differences, [], `${crash.name}: and verifies against the first start`);
				assert.deepEqual(normalized(r.repo), expected, `${crash.name}: the result of an uninterrupted run`);
				for (const [id, n] of Object.entries(await migratedEntries(r))) if (!/^(EPIC|STORY|TASKS?)-/.test(id)) assert.equal(n, 1, `${crash.name}: ${id} has one migrated entry`);
			} finally { r.done(); }
		}
	});
});
