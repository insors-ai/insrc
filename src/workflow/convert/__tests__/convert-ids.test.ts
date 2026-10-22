import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { planConversion } from '../plan.js';
import { applyRenames, renameRule, rewriteString } from '../rename.js';

const H = 'aaaaaaaaaaaaaaaa';
const git = (repo: string, ...args: string[]): void => { execFileSync('git', ['-C', repo, ...args], { stdio: 'ignore' }); };

interface Fx { readonly repo: string; json(name: string, v: unknown): void; text(rel: string, s: string): void; read(rel: string): string; commit(): void; done(): void }
function fixture(): Fx {
	const repo = mkdtempSync(join(tmpdir(), 'convert-ids-'));
	git(repo, 'init', '-q', '-b', 'main'); git(repo, 'config', 'user.email', 't@e.com'); git(repo, 'config', 'user.name', 'T');
	const text = (rel: string, s: string): void => { mkdirSync(dirname(join(repo, rel)), { recursive: true }); writeFileSync(join(repo, rel), s); };
	return {
		repo, text, read: rel => readFileSync(join(repo, rel), 'utf8'),
		json: (name, v) => text(`.insrc/artifacts/${name}.json`, JSON.stringify(v, null, 2) + '\n'),
		commit: () => { git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'x', '--allow-empty'); },
		done: () => rmSync(repo, { recursive: true, force: true }),
	};
}

function seed(f: Fx): void {
	const head = (storyId: string, body: unknown) => ({ meta: { epicHash: H, storyId, createdAt: '2026-10-20T00:00:00.000Z' }, body, citations: [] });
	f.json(`DEF-${H}`, { meta: { epicHash: H, createdAt: '2026-10-20T00:00:00.000Z' }, body: { stories: [{ id: 'S001', title: 'One' }, { id: 'S002', title: 'Two', dependsOn: ['S001'] }] }, citations: [] });
	f.json(`LLD-${H}-S001`, head('S001', { note: 'builds on LLD-aaaaaaaaaaaaaaaa-S002 and S002 as a whole', path: 'docs/epics/e-E1/S001/LLD.md', ref: `LLD-${H}-S002` }));
	f.json(`LLD-${H}-S002`, head('S002', {}));
	f.json(`BUILD-${H}-S001`, head('S001', { tasks: [{ id: 't1', storyId: 'S001' }] }));
	f.json(`HLD-${H}`, { meta: { epicHash: H, createdAt: '2026-10-20T00:00:00.000Z' }, body: { storyBoundaries: [{ storyId: 'S001' }] }, citations: [] });
	f.json(`PLAN-${H}-s1`, head('s1', {}));
	f.text('docs/epics/e-E1/S001/LLD.md', `<!-- insrc:artifact LLD-${H}-S001 -->\n# LLD for S001\nsee LLD-${H}-S002\n`);
	f.text('docs/epics/e-E1/HLD.md', `# HLD\nunchanged: S001 and docs/epics/e-E1/S001/LLD.md\n`);
	f.commit();
}

const names = (f: Fx): string[] => readdirSync(join(f.repo, '.insrc', 'artifacts')).sort();

describe('convert-ids', () => {
	it('convert-ids.test.ts: uppercase story ids are renamed once with references rewritten and none left as an alias', async () => {
		const f = fixture();
		try {
			seed(f);
			assert.equal(rewriteString('S001'), 's1');
			assert.equal(rewriteString('S012'), 's12');
			assert.equal(rewriteString('see S001'), 'see S001', 'a bare id inside a sentence is not rewritten');
			assert.equal(rewriteString(`x LLD-${H}-S003 y`), `x LLD-${H}-s3 y`, 'a full artifact id is rewritten wherever it stands');

			// the plan: the renames, the files to rewrite, and the prose reference
			const plan = await planConversion(f.repo, { rules: [renameRule] });
			assert.deepEqual(plan.renames, [
				{ from: `BUILD-${H}-S001`, to: `BUILD-${H}-s1` }, { from: `LLD-${H}-S001`, to: `LLD-${H}-s1` }, { from: `LLD-${H}-S002`, to: `LLD-${H}-s2` },
			]);
			const detailOf = (id: string): string | undefined => plan.changes.find(c => c.rule === 'rename-id' && c.artifactId === id)?.detail;
			assert.equal(detailOf(`LLD-${H}-S001`), `rename to LLD-${H}-s1`);
			assert.equal(detailOf(`DEF-${H}`), 'rewrite the story ids it refers to');
			assert.equal(detailOf(`HLD-${H}`), 'rewrite the story ids it refers to');
			assert.equal(detailOf(`PLAN-${H}-s1`), undefined, 'a lowercase head needs nothing');
			assert.equal(detailOf('docs/epics/e-E1/S001/LLD.md'), 'rewrite the artifact ids it refers to');
			assert.equal(detailOf('docs/epics/e-E1/HLD.md'), undefined);
			assert.deepEqual(plan.proseReferences, [{ file: `.insrc/artifacts/LLD-${H}-S001.json`, oldId: 'S002' }], 'only the bare id inside a sentence; a path component is not one');
			assert.deepEqual(plan.problems, []);

			// apply: renamed once, nothing left under the old names, no alias
			const first = applyRenames(f.repo);
			assert.equal(first.renamed, 3);
			assert.deepEqual(names(f), [`BUILD-${H}-s1.json`, `DEF-${H}.json`, `HLD-${H}.json`, `LLD-${H}-s1.json`, `LLD-${H}-s2.json`, `PLAN-${H}-s1.json`]);
			const lld = JSON.parse(f.read(`.insrc/artifacts/LLD-${H}-s1.json`)) as { meta: Record<string, unknown>; body: Record<string, unknown> };
			assert.equal(lld.meta['storyId'], 's1');
			assert.equal(lld.body['ref'], `LLD-${H}-s2`);
			assert.equal(lld.body['note'], 'builds on LLD-aaaaaaaaaaaaaaaa-s2 and S002 as a whole', 'a full id inside prose is rewritten, the bare one is left');
			assert.equal(lld.body['path'], 'docs/epics/e-E1/S001/LLD.md', 'folder names keep their names');
			const def = JSON.parse(f.read(`.insrc/artifacts/DEF-${H}.json`)) as { body: { stories: { id: string; dependsOn?: string[] }[] } };
			assert.deepEqual(def.body.stories.map(s => [s.id, s.dependsOn]), [['s1', undefined], ['s2', ['s1']]]);
			assert.equal(JSON.parse(f.read(`.insrc/artifacts/HLD-${H}.json`)).body.storyBoundaries[0].storyId, 's1');
			assert.equal(JSON.parse(f.read(`.insrc/artifacts/BUILD-${H}-s1.json`)).body.tasks[0].storyId, 's1');
			assert.equal(f.read('docs/epics/e-E1/S001/LLD.md'), `<!-- insrc:artifact LLD-${H}-s1 -->\n# LLD for S001\nsee LLD-${H}-s2\n`, 'the marker follows the head; the document stays where it is');
			assert.equal(f.read('docs/epics/e-E1/HLD.md'), '# HLD\nunchanged: S001 and docs/epics/e-E1/S001/LLD.md\n');
			for (const n of names(f)) assert.doesNotMatch(n, /-S\d+/);

			// once: a second apply changes nothing, and a plan of the renamed tree has nothing to rename
			f.commit();
			assert.deepEqual(applyRenames(f.repo), { renamed: 0, rewritten: 0 });
			const again = await planConversion(f.repo, { rules: [renameRule] });
			assert.deepEqual([again.renames, again.changes.filter(c => c.rule === 'rename-id')], [[], []]);
		} finally { f.done(); }
	});

	it('convert-ids.test.ts: a collision is a plan problem and no rename is applied', async () => {
		const f = fixture();
		try {
			seed(f);
			f.json(`LLD-${H}-s1`, { meta: { epicHash: H, storyId: 's1', createdAt: 'x' }, body: { different: true }, citations: [] });
			f.commit();
			const plan = await planConversion(f.repo, { rules: [renameRule] });
			assert.ok(plan.problems.some(p => p.file === `.insrc/artifacts/LLD-${H}-s1.json` && /already exists and differs/.test(p.reason)));
			assert.ok(!plan.renames.some(r => r.from === `LLD-${H}-S001`), 'the colliding head is not renamed');
			const before = names(f);
			assert.throws(() => applyRenames(f.repo), /already exists and differs/);
			assert.deepEqual(names(f), before, 'no rename was applied');
			assert.ok(existsSync(join(f.repo, '.insrc', 'artifacts', `LLD-${H}-S002.json`)), 'not even the head that did not collide');
		} finally { f.done(); }
	});

	it('convert-ids.test.ts: a rerun after a crash that left the renamed twin finishes the rename', async () => {
		const f = fixture();
		try {
			seed(f);
			// the crash: the new file was written with the rewritten text, the old one was not removed yet
			const rewritten = JSON.stringify(JSON.parse(f.read(`.insrc/artifacts/LLD-${H}-S002.json`)).meta.storyId === 'S002' ? { meta: { epicHash: H, storyId: 's2', createdAt: '2026-10-20T00:00:00.000Z' }, body: {}, citations: [] } : {}, null, 2) + '\n';
			f.text(`.insrc/artifacts/LLD-${H}-s2.json`, rewritten);
			f.commit();
			const plan = await planConversion(f.repo, { rules: [renameRule] });
			assert.deepEqual(plan.problems, [], 'the twin is not a collision');
			assert.ok(plan.renames.some(r => r.from === `LLD-${H}-S002`));
			assert.equal(applyRenames(f.repo).renamed, 3);
			assert.ok(!existsSync(join(f.repo, '.insrc', 'artifacts', `LLD-${H}-S002.json`)));
			assert.equal(JSON.parse(f.read(`.insrc/artifacts/LLD-${H}-s2.json`)).meta.storyId, 's2');
		} finally { f.done(); }
	});

	it('a lowercase story id with leading zeros is renamed to the canonical form, and a canonical one is left alone', async () => {
		const f = fixture();
		try {
			f.json(`PLAN-${H}-s001`, { meta: { epicHash: H, storyId: 's001', createdAt: '2026-10-20T00:00:00.000Z' }, body: {}, citations: [] });
			f.json(`PLAN-${H}-s2`, { meta: { epicHash: H, storyId: 's2', createdAt: '2026-10-20T00:00:00.000Z' }, body: {}, citations: [] });
			f.commit();
			const plan = await planConversion(f.repo, { rules: [renameRule] });
			assert.deepEqual(plan.renames, [{ from: `PLAN-${H}-s001`, to: `PLAN-${H}-s1` }]);
			assert.equal(rewriteString('s2'), 's2');
			assert.equal(rewriteString('s001'), 's1');
		} finally { f.done(); }
	});
});
