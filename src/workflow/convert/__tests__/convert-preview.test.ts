import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { assertCleanTree, plansEqual, planConversion } from '../plan.js';
import { runConversion } from '../run.js';
import { legacyRepo } from './legacy-repo.js';
import type { PlanRule } from '../plan.js';
import { ConversionRefused } from '../types.js';

const H = 'aaaaaaaaaaaaaaaa';
const git = (repo: string, ...args: string[]): void => { execFileSync('git', ['-C', repo, ...args], { stdio: 'ignore' }); };

interface Fixture { readonly repo: string; put(name: string, content: unknown): void; commit(): void; done(): void }

function fixture(): Fixture {
	const repo = mkdtempSync(join(tmpdir(), 'convert-preview-'));
	git(repo, 'init', '-q', '-b', 'main');
	git(repo, 'config', 'user.email', 't@example.com');
	git(repo, 'config', 'user.name', 'T');
	mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
	const put = (name: string, content: unknown): void => writeFileSync(join(repo, '.insrc', 'artifacts', name), typeof content === 'string' ? content : JSON.stringify(content, null, 2) + '\n');
	const commit = (): void => { git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'x', '--allow-empty'); };
	return { repo, put, commit, done: () => rmSync(repo, { recursive: true, force: true }) };
}

const legacy = (extra: Record<string, unknown> = {}) => ({ meta: { epicHash: H, storyId: 's1', createdAt: '2026-10-20T10:00:00.000Z', revision: 1, ...extra }, body: { goal: 'g' }, citations: [] });
const converted = () => ({ meta: { epicHash: H, createdAt: '2026-10-20T10:00:00.000Z', envelope: { references: [], attachments: [], description: '' }, lifecycle: { status: 'draft', revision: { number: 0, contentHash: 'x', at: '', by: { id: 'insrc:system', kind: 'system', properties: {} } }, signoffs: [] } }, body: {} });

/** Every file under a directory with its size and mtime: whether anything changed. */
function listing(dir: string, prefix = ''): string[] {
	return readdirSync(dir).sort().flatMap(n => {
		const p = join(dir, n);
		const s = statSync(p);
		return s.isDirectory() ? (n === '.git' ? [] : listing(p, `${prefix}${n}/`)) : [`${prefix}${n}:${s.size}:${s.mtimeMs}`];
	});
}

describe('convert-preview', () => {
	it('convert-preview.test.ts: a preview writes nothing, refuses a dirty tree and lists unreadable files as problems', async () => {
		const f = fixture();
		try {
			f.put(`LLD-${H}-s1.json`, legacy({ approvedAt: '2026-10-21T10:00:00.000Z', review: { verdict: 'pass', findings: [], counts: { high: 0, med: 0, low: 0 }, reviewedAt: '2026-10-21T00:00:00.000Z' } }));
			f.put(`HLD-${H}.json`, converted());
			f.put(`PLAN-${H}-s1.json`, legacy());
			f.put(`DEF-${H}.json`, '{ not json');
			f.put(`BUILD-${H}-s1.json`, '<<<<<<< HEAD\n{}\n=======\n{}\n>>>>>>> x\n');
			f.put(`CR-${H}-s1.json`, { body: {} });
			f.put(`ISSUE-${H}.json`, { meta: {}, body: 'x' });
			f.put(`WHAT-${H}.json`, {});
			f.put(`SPEC-${H}.json`, '[1]');
			f.put(`LLD-${H}-s1.log.jsonl`, '');
			f.commit();
			const before = listing(f.repo);

			const plan = await planConversion(f.repo);
			assert.deepEqual(listing(f.repo), before, 'a preview writes nothing, not even the repository rules');
			assert.deepEqual(plan.changes.map(c => [c.rule, c.artifactId]), [['migrate-head', `LLD-${H}-s1`], ['migrate-head', `PLAN-${H}-s1`]], 'the converted head needs no change');
			assert.match(plan.changes[0]!.detail, /approvedAt, review/);
			assert.deepEqual(plan.problems.map(p => p.file.replace('.insrc/artifacts/', '')), [`BUILD-${H}-s1.json`, `CR-${H}-s1.json`, `DEF-${H}.json`, `ISSUE-${H}.json`, `SPEC-${H}.json`, `WHAT-${H}.json`]);
			assert.deepEqual(plan.problems.map(p => p.reason.split(' (')[0]), ['has merge conflict markers', 'has no meta and body objects', 'is not valid JSON', 'has meta but no body object', 'is not a JSON object', "no artifact kind for the prefix 'WHAT'"]);
			assert.deepEqual(plan.snapshot.map(v => v.artifactId), [`HLD-${H}`, `LLD-${H}-s1`, `PLAN-${H}-s1`], 'the before-snapshot covers the heads that could be read');
			assert.equal(plan.snapshot.find(v => v.artifactId === `LLD-${H}-s1`)?.approval, 'approved');

			// the same tree gives an equal plan
			assert.ok(plansEqual(plan, await planConversion(f.repo)));

			// extra rules are merged, sorted by the rule order, and a rule's problem is a problem
			const rule: PlanRule = ctx => ({
				changes: [{ rule: 'create-epic', artifactId: 'EPIC-x', detail: 'z' }, { rule: 'rename-id', artifactId: `LLD-${H}-S001`, detail: `${ctx.heads.length} heads` }],
				renames: [{ from: `LLD-${H}-S001`, to: `LLD-${H}-s1` }], problems: [{ file: 'x', reason: 'y' }],
			});
			const withRule = await planConversion(f.repo, { rules: [rule] });
			assert.deepEqual(withRule.changes.map(c => c.rule), ['rename-id', 'migrate-head', 'migrate-head', 'create-epic']);
			assert.equal(withRule.changes[0]!.detail, '3 heads');
			assert.deepEqual([withRule.renames.length, withRule.problems.length], [1, 7]);
			assert.equal(plansEqual(plan, withRule), false);

			// a dirty tree is refused, naming the paths; a change elsewhere is not a reason
			writeFileSync(join(f.repo, 'elsewhere.txt'), 'x');
			await planConversion(f.repo);
			f.put(`LLD-${H}-s1.json`, legacy({ approvedAt: 'later' }));
			await assert.rejects(planConversion(f.repo), (err: unknown) => err instanceof ConversionRefused && /uncommitted changes/.test(err.message) && err.paths.includes(`.insrc/artifacts/LLD-${H}-s1.json`));
			f.commit();
			mkdirSync(join(f.repo, 'docs', 'epics', 'e'), { recursive: true });
			writeFileSync(join(f.repo, 'docs', 'epics', 'e', 'DEF.md'), 'x');
			await assert.rejects(planConversion(f.repo), (err: unknown) => err instanceof ConversionRefused && err.paths.includes('docs/epics/e/DEF.md'));
			f.commit();

			// a merge in progress is refused
			writeFileSync(join(f.repo, '.git', 'MERGE_HEAD'), execFileSync('git', ['-C', f.repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }));
			await assert.rejects(planConversion(f.repo), /merge is in progress/);
			rmSync(join(f.repo, '.git', 'MERGE_HEAD'));
			assert.doesNotThrow(() => assertCleanTree(f.repo));

			// a converted tree (the marker at version 2) gives an empty plan
			writeFileSync(join(f.repo, '.insrc', 'schema.json'), JSON.stringify({ version: 2, convertedAt: '2026-10-23T00:00:00.000Z' }));
			f.commit();
			const empty = await planConversion(f.repo);
			assert.deepEqual([empty.changes, empty.problems, empty.snapshot], [[], [], []]);
			writeFileSync(join(f.repo, '.insrc', 'schema.json'), '{ nope');
			await assert.rejects(planConversion(f.repo), /marker cannot be read/);
		} finally { f.done(); }
		assert.equal(readFileSync(new URL('../plan.ts', import.meta.url), 'utf8').includes('writeFileSync'), false, 'the planner writes no file');
	});

	it('convert-preview.test.ts: a directory that is not a git repository is refused', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'convert-preview-nogit-'));
		try { await assert.rejects(planConversion(dir), /not a git repository/); } finally { rmSync(dir, { recursive: true, force: true }); }
	});

	it('convert-preview.test.ts: runConversion in preview mode lists the change of every rule and writes nothing', async () => {
		const r = legacyRepo();
		try {
			const before = r.git('status', '--porcelain', '--untracked-files=all');
			const files = (): string => readdirSync(join(r.repo, '.insrc', 'artifacts')).sort().map(n => `${n}:${statSync(join(r.repo, '.insrc', 'artifacts', n)).size}`).join(',');
			const filesBefore = files();
			const report = await runConversion(r.repo, 'preview', r.deps);
			assert.equal(report.mode, 'preview');
			assert.equal(report.result, undefined);
			const rules = new Set(report.plan.changes.map(c => c.rule));
			for (const rule of ['rename-id', 'convert-amendment', 'convert-feedback', 'migrate-head', 'create-epic', 'create-story', 'create-tasks', 'move-binding']) assert.ok(rules.has(rule as never), `the plan lists ${rule}`);
			assert.ok(report.plan.renames.length >= 3, 'the uppercase story id is renamed in its LLD, PLAN and BUILD');
			assert.equal(r.git('status', '--porcelain', '--untracked-files=all'), before, 'a preview changes no file');
			assert.equal(files(), filesBefore);
			assert.deepEqual(await runConversion(r.repo, 'preview', r.deps).then(x => x.plan), report.plan, 'and gives the same plan every time');
		} finally { r.done(); }
	});
});

