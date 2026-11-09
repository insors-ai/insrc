/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Repair over repository files: the steps run in order at any schema version, the report says exactly what was committed, a plan with
 * a problem writes nothing, and the copies taken before a run are a complete way back.
 *
 * Run: npx tsx --test src/workflow/convert/__tests__/repair.test.ts
 */

import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { handleRepoConvert } from '../../../daemon/repo-convert.js';
import { History } from '../../artifact-core/history.js';
import { createFileJournal } from '../../artifact-core/journal.js';
import { contentHash } from '../../artifact-core/lifecycle.js';
import { createRepoLifecycle } from '../../artifact-core/repo-lifecycle.js';
import { REPO_SCHEMA_FILE, writeRepoSchema } from '../../artifact-core/repo-schema.js';
import { createFileSidecarStore } from '../../artifact-core/sidecar-store.js';
import { artifactJsonPath } from '../../storage.js';
import { H } from '../../tasks/__tests__/task-set-kit.js';
import { runRepair } from '../repair.js';
import type { RepairReport, RepairResult } from '../types.js';
import { legacyRepo } from './legacy-repo.js';

const LLD = `LLD-${H}-s1`;
const OLD_LLD = `LLD-${H}-S001`;
const AMD = `AMD-${H}-1`;
const EPIC = `EPIC-${H}`;
const head = (repo: string, id: string): { meta: Record<string, any>; body: Record<string, unknown> } => JSON.parse(readFileSync(artifactJsonPath(repo, id), 'utf8'));
const put = (repo: string, id: string, value: unknown): void => writeFileSync(artifactJsonPath(repo, id), JSON.stringify(value, null, 2) + '\n');
const result = (r: RepairReport): RepairResult => { assert.ok(r.result !== undefined, JSON.stringify(r)); return r.result; };
const feedbackLines = (repo: string, id: string) => new History(createFileSidecarStore(repo)).feedback(id);
/** Every file under a directory with its bytes, so "writes nothing" means nothing at all. */
function tree(dir: string): Record<string, string> {
	const out: Record<string, string> = {};
	for (const name of readdirSync(dir, { recursive: true }).map(String).sort()) {
		if (name.startsWith('.git/') || name === '.git') continue;
		try { out[name] = readFileSync(join(dir, name), 'utf8'); } catch { /* a directory */ }
	}
	return out;
}
const firstAt = (written: RepairResult['written'], step: string): number => written.findIndex(w => w.step === step);

test('repair on a store with an uppercase head holding body.feedback and an approved flat amendment: the head is renamed, the feedback survives under the new id, and the amendment stays approved', async () => {
	const l = legacyRepo();
	try {
		// the conversion has already run here as far as the marker knows: repair works at any schema version and leaves the marker alone
		writeRepoSchema(l.repo, { version: 2, convertedAt: '2026-10-22T00:00:00.000Z' });
		const before = readFileSync(join(l.repo, REPO_SCHEMA_FILE), 'utf8');
		const preview = await tree(l.repo);
		const planned = await runRepair(l.repo, 'repair-preview');
		assert.equal(planned.result, undefined);
		assert.ok(planned.plan.changes.some(c => c.rule === 'rename-id' && c.artifactId === OLD_LLD), JSON.stringify(planned.plan.changes.slice(0, 3)));
		assert.deepEqual(tree(l.repo), preview, 'the preview writes nothing');

		const r = result(await runRepair(l.repo, 'repair'));
		assert.equal(r.stoppedAt, undefined, JSON.stringify(r.stoppedAt));
		assert.equal(existsSync(artifactJsonPath(l.repo, OLD_LLD)), false, 'the old name is gone');
		assert.equal(head(l.repo, LLD).meta['storyId'], 's1');
		assert.equal(head(l.repo, LLD).body['feedback'], undefined, 'the migration moved the feedback out of the body');
		const lines = await feedbackLines(l.repo, LLD);
		assert.equal(lines.length, 1);
		assert.equal(lines[0]?.text, 'tighten');
		assert.equal(head(l.repo, AMD).meta['lifecycle'].status, 'approved');
		assert.equal(head(l.repo, LLD).meta['lifecycle'].status, 'approved');

		// the steps ran in their fixed order
		const order = ['rename', 'stamp', 'amendments', 'feedback', 'migrate', 'units', 'tasks'].map(s => firstAt(r.written, s)).filter(i => i >= 0);
		assert.deepEqual(order, [...order].sort((a, b) => a - b), JSON.stringify(order));
		for (const s of ['rename', 'amendments', 'feedback', 'migrate', 'units', 'tasks']) assert.ok(firstAt(r.written, s) >= 0, `${s} wrote something`);
		assert.equal(readFileSync(join(l.repo, REPO_SCHEMA_FILE), 'utf8'), before, 'the marker is untouched');
		assert.equal(existsSync(join(l.repo, '.insrc', 'convert-progress.json')), false, 'and there is no progress file');
	} finally { l.done(); }
});

test('a head with a content hash keeps its content through the reference rewrite, so its integrity still holds', async () => {
	const l = legacyRepo();
	try {
		const id = `HLD-${H}`;
		const body = { summary: `built on PLAN-${H}-S001` };
		const by = { id: 'insrc:system', kind: 'system', properties: {} };
		const hash = contentHash('', { body, citations: [] });
		const lifecycle = { status: 'approved', revision: { number: 1, contentHash: hash, at: 't', by }, signoffs: [], approval: { revision: 1, by, at: 't' } };
		put(l.repo, id, { meta: { workflow: 'design.epic', epicHash: H, createdAt: 't', epicCreatedAt: 't', revision: 1, refersTo: `PLAN-${H}-S001`, lifecycle }, body, citations: [] });

		const r = result(await runRepair(l.repo, 'repair'));
		assert.equal(r.stoppedAt, undefined, JSON.stringify(r.stoppedAt));
		assert.deepEqual(head(l.repo, id).body, body, 'the approved text is what was approved');
		assert.equal(head(l.repo, id).meta['refersTo'], `PLAN-${H}-s1`, 'the meta reference moves');
		const seen = await createRepoLifecycle(l.repo).service.inspect(id);
		assert.equal(seen?.status, 'approved');
		assert.deepEqual(seen?.integrity, { ok: true });
	} finally { l.done(); }
});

test('a failure injected in the head migration step answers a RepairReport whose written lists the committed feedback lines and migration entries, with stoppedAt and remaining, and settles nothing; the next run finishes with no feedback line added twice', async () => {
	const l = legacyRepo();
	try {
		let thrown = false;
		const r = result(await runRepair(l.repo, 'repair', { headSeams: { beforeHeadWrite: () => { if (!thrown) { thrown = true; throw new Error('injected migration failure'); } } } }));
		assert.equal(r.stoppedAt?.step, 'migrate');
		assert.match(r.stoppedAt?.reason ?? '', /injected migration failure/);
		assert.ok(r.written.some(w => w.step === 'feedback' && w.action === 'feedback-line' && w.artifactId === LLD), JSON.stringify(r.written.slice(0, 12)));
		assert.ok(r.written.some(w => w.step === 'migrate' && w.action === 'log-entry'), 'the log entries committed before the head failed are listed');
		assert.equal(r.written.some(w => w.step === 'migrate' && w.action === 'head'), false, 'and the head that failed is not');
		assert.equal(r.written.filter(w => w.action === 'feedback-line').length, (await feedbackLines(l.repo, LLD)).length, 'written is what is on disk');
		assert.ok(r.remaining.some(c => c.rule === 'migrate-head'), JSON.stringify(r.remaining.slice(0, 3)));
		assert.equal(firstAt(r.written, 'units'), -1, 'the later steps did not run');
		assert.deepEqual(r.held, []);
		assert.deepEqual(r.failed, []);
		assert.equal(existsSync(artifactJsonPath(l.repo, EPIC)), false, 'nothing settled');

		const next = result(await runRepair(l.repo, 'repair'));
		assert.equal(next.stoppedAt, undefined, JSON.stringify(next.stoppedAt));
		assert.equal((await feedbackLines(l.repo, LLD)).length, 1, 'no feedback line was added twice');
		assert.equal(next.written.filter(w => w.action === 'feedback-line').length, 0);
		assert.equal(head(l.repo, LLD).meta['lifecycle'].status, 'approved');
		assert.equal(existsSync(artifactJsonPath(l.repo, EPIC)), true, 'and the run went on to the units');
	} finally { l.done(); }
});

test('moving a binding reports each write it made, including a failed pending link, and a later run reports none for it', async () => {
	const story = `STORY-${H}-s1`;
	const withBinding = (repo: string, link: unknown): void => {
		const stored = head(repo, OLD_LLD);
		const envelope = stored.meta['envelope'];
		put(repo, OLD_LLD, { ...stored, citations: [], meta: { ...stored.meta, envelope: { ...envelope, binding: { ...envelope.binding, posted: [{ kind: 'design', at: 't', externalId: 'c1' }, { kind: 'plan', at: 't', externalId: 'c2' }], ...(link !== undefined ? { pendingLink: link } : {}) } } } });
	};
	const bindingWrites = (r: RepairResult) => r.written.filter(w => w.artifactId === story && w.action === 'binding').length;

	// the reference, the two posts and the pending link are each their own write
	const l = legacyRepo();
	try {
		withBinding(l.repo, { parent: { entityId: story, type: 'STORY', relation: 'derived-from' }, childId: 'x' });
		const first = result(await runRepair(l.repo, 'repair'));
		assert.equal(first.stoppedAt, undefined, JSON.stringify(first.stoppedAt));
		assert.equal(bindingWrites(first), 4, JSON.stringify(first.written.filter(w => w.artifactId === story)));
		assert.equal(head(l.repo, story).meta['envelope'].binding.posted.length, 2);

		// the next run has other work to do, and moves no binding: nothing is reported for what it did not write
		put(l.repo, `LLD-${H}-S009`, { meta: { workflow: 'design.story', epicHash: H, storyId: 'S009', createdAt: 't', epicCreatedAt: 't', revision: 1 }, body: { goal: 'g' }, citations: [] });
		const again = result(await runRepair(l.repo, 'repair'));
		assert.ok(again.written.length > 0, 'control: this run did write');
		assert.deepEqual(again.written.filter(w => w.artifactId === story || w.artifactId === LLD), []);
	} finally { l.done(); }

	// a pending link that cannot be written stops the step with the writes before it listed
	const bad = legacyRepo();
	try {
		withBinding(bad.repo, { parent: { entityId: story, type: 'STORY', relation: 'derived-from' } });
		const r = result(await runRepair(bad.repo, 'repair'));
		assert.equal(r.stoppedAt?.step, 'units', JSON.stringify(r.stoppedAt));
		assert.match(r.stoppedAt?.reason ?? '', /pending link/);
		assert.equal(bindingWrites(r), 3, 'the reference and both posts were committed');
		assert.equal(head(bad.repo, story).meta['envelope'].binding.posted.length, 2);
	} finally { bad.done(); }
});

test('a plan with a rename collision answers an error and writes nothing', async () => {
	const l = legacyRepo();
	try {
		put(l.repo, LLD, { meta: { workflow: 'design.story', epicHash: H, storyId: 's1', createdAt: 't', epicCreatedAt: 't', revision: 1 }, body: { goal: 'a different one' }, citations: [] });
		const before = tree(l.repo);
		const answer = await handleRepoConvert({ repo: l.repo, mode: 'repair' }, undefined);
		assert.ok('error' in answer, JSON.stringify(answer).slice(0, 300));
		assert.match(answer.error, /already exists and differs/);
		assert.deepEqual(tree(l.repo), before);
	} finally { l.done(); }
});

test('an unknown mode answers an error and writes nothing', async () => {
	const l = legacyRepo();
	try {
		const before = tree(l.repo);
		const answer = await handleRepoConvert({ repo: l.repo, mode: 'repair-apply' }, undefined);
		assert.ok('error' in answer);
		assert.match(answer.error, /unknown mode repair-apply/);
		assert.deepEqual(tree(l.repo), before);
	} finally { l.done(); }
});

test('rollback: after a staged write fails before head replacement, restoring the copied artifacts, journal and docs with the daemon stopped leaves no pending operation to replay', async () => {
	const l = legacyRepo();
	const aside = `${l.repo}-aside`;
	try {
		mkdirSync(join(l.repo, 'docs', 'standalone', 'x'), { recursive: true });
		writeFileSync(join(l.repo, 'docs', 'standalone', 'x', 'LLD.md'), `see ${OLD_LLD}\n`);
		mkdirSync(join(l.repo, '.insrc', 'journal'), { recursive: true });
		const folders = [['.insrc', 'artifacts'], ['.insrc', 'journal'], ['docs']].map(p => join(...p));
		for (const f of folders) cpSync(join(l.repo, f), join(aside, f), { recursive: true });
		const copied = tree(join(l.repo, '.insrc', 'artifacts'));

		// the store's first head replace is the EPIC created in the units step: it has been staged and logged when it fails
		const r = result(await runRepair(l.repo, 'repair', { writeHead: () => { throw new Error('injected head failure'); } }));
		assert.equal(r.stoppedAt?.step, 'units', JSON.stringify(r.stoppedAt));
		assert.ok(await createFileJournal(l.repo).pending(EPIC), 'control: the failed write is pending');
		assert.ok(r.written.some(w => w.artifactId === EPIC && w.action === 'log-entry'), 'its log entry committed and is listed');
		assert.equal(r.written.some(w => w.artifactId === EPIC && w.action === 'head'), false);

		for (const f of folders) { rmSync(join(l.repo, f), { recursive: true, force: true }); cpSync(join(aside, f), join(l.repo, f), { recursive: true }); }

		assert.equal(await createFileJournal(l.repo).pending(EPIC), undefined, 'nothing is left to replay');
		assert.deepEqual(readdirSync(join(l.repo, '.insrc', 'journal')), []);
		const { store } = createRepoLifecycle(l.repo);
		await store.finishPending(EPIC);
		assert.equal(existsSync(artifactJsonPath(l.repo, EPIC)), false, 'and a later write finds no staged EPIC to finish');
		assert.deepEqual(tree(join(l.repo, '.insrc', 'artifacts')), copied);
		assert.equal(readFileSync(join(l.repo, 'docs', 'standalone', 'x', 'LLD.md'), 'utf8'), `see ${OLD_LLD}\n`, 'the rewritten document is back too');
	} finally { rmSync(aside, { recursive: true, force: true }); l.done(); }
});
