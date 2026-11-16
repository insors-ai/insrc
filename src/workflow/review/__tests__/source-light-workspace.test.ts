/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { createHash } from 'node:crypto';
import { mkdtemp, realpath, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ReviewKey } from '../../../shared/review-resources.js';
import { sourceLightDigest } from '../../../shared/review-source-light.js';
import type { SelectedChangeLocatorSet, SourceLightBinding } from '../../../shared/review-source-light.js';
import type { BatchReviewSources, ChangedRange, PinnedBlob, ReviewObjectInfo, ReviewObjectRequest } from '../../code-review/task-review/sources.js';
import { cleanupBaselineWorkspace, materializeBaselineWorkspace, readBaselineFile, withSelectedAfterBlocks } from '../source-light-workspace.js';

const id = (character: string) => character.repeat(40);
const digest = (character: string) => character.repeat(64);
const blob = (oid: string, text: string): PinnedBlob => ({ oid, bytes: Buffer.from(text) });
const commit = (oid: string, tree: string, parents: readonly string[]): PinnedBlob => blob(oid, `tree ${tree}\n${parents.map(parent => `parent ${parent}\n`).join('')}\nauthor test\n\nmessage\n`);

class FixtureSources implements BatchReviewSources {
	readonly values = new Map<string, PinnedBlob>();
	commit(oid: string): Promise<readonly string[]> { return Promise.resolve(new TextDecoder().decode(this.values.get(oid)!.bytes).split('\n').filter(line => line.startsWith('parent ')).map(line => line.slice(7))); }
	isAncestor(): Promise<boolean> { return Promise.resolve(true); }
	file(commit: string, path: string): Promise<PinnedBlob | null> { return Promise.resolve(this.values.get(`${commit}:${path}`) ?? null); }
	changedRanges(): Promise<readonly ChangedRange[]> { return Promise.resolve([]); }
	pathChanges(): Promise<readonly string[]> { return Promise.resolve([]); }
	objectInventory(requests: readonly ReviewObjectRequest[]): Promise<readonly ReviewObjectInfo[]> { return Promise.resolve(requests.map(request => { const value = this.values.get(request.path ? `${request.commit}:${request.path}` : request.commit); return { exists: value !== undefined, bytes: value?.bytes.length ?? 0 }; })); }
	objects(requests: readonly ReviewObjectRequest[]): Promise<readonly (PinnedBlob | null)[]> { return Promise.resolve(requests.map(request => this.values.get(request.path ? `${request.commit}:${request.path}` : request.commit) ?? null)); }
}

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await import('node:fs/promises').then(fs => fs.rm(root, { recursive: true, force: true })); });

async function fixture(attempt = 1, generation = 'a'): Promise<{ binding: SourceLightBinding; selected: SelectedChangeLocatorSet; sources: FixtureSources }> {
	const project = await realpath(await mkdtemp(join(tmpdir(), 'source-light-workspace-'))); roots.push(project);
	const key: ReviewKey = { project, family: 'code', reviewId: 'workspace-review' };
	const binding = { key, attempt, generationId: digest(generation), inputDigest: digest('b'), sourceIdentity: digest('c') };
	const p0 = id('1'), c1 = id('2'), c2 = id('3'), c3 = id('4'), c4 = id('5');
	const sources = new FixtureSources();
	for (const [oid, parents, tree] of [[p0, [], id('6')], [c1, [p0], id('7')], [c2, [c1], id('8')], [c3, [c2], id('9')], [c4, [c2], id('a')]] as const) sources.values.set(oid, commit(oid, tree, parents));
	sources.values.set(`${c1}:src/new.ts`, blob(id('b'), 'zero\none\ntwo\n'));
	sources.values.set(`${c1}:src/stack.ts`, blob(id('c'), 'old\nbase\n'));
	sources.values.set(`${c2}:src/stack.ts`, blob(id('d'), 'old\nchanged\nlast\n'));
	sources.values.set(`${c2}:src/old.ts`, blob(id('e'), 'rename\nbefore\n'));
	sources.values.set(`${c4}:src/new-name.ts`, blob(id('f'), 'rename\nafter\n'));
	const value = { schemaVersion: 1 as const, encoding: 'source-light-locators-v1' as const, ...binding, locators: [
		{ schemaVersion: 1 as const, order: 0, commit: c1, commitParents: [p0], applicableParent: p0, operation: 'add' as const, before: null, after: { path: 'src/new.ts', oid: id('b') }, blocks: [{ kind: 'after-range' as const, startLine: 2, endLine: 2 }], binary: false },
		{ schemaVersion: 1 as const, order: 1, commit: c2, commitParents: [c1], applicableParent: c1, operation: 'modify' as const, before: { path: 'src/stack.ts', oid: id('c') }, after: { path: 'src/stack.ts', oid: id('d') }, blocks: [{ kind: 'after-range' as const, startLine: 2, endLine: 2 }], binary: false },
		{ schemaVersion: 1 as const, order: 2, commit: c3, commitParents: [c2], applicableParent: c2, operation: 'delete' as const, before: { path: 'src/stack.ts', oid: id('d') }, after: null, blocks: [{ kind: 'deletion' as const, atLine: 1 }], binary: false },
		{ schemaVersion: 1 as const, order: 3, commit: c4, commitParents: [c2], applicableParent: c2, operation: 'rename' as const, before: { path: 'src/old.ts', oid: id('e') }, after: { path: 'src/new-name.ts', oid: id('f') }, blocks: [{ kind: 'after-range' as const, startLine: 2, endLine: 2 }], binary: false },
	], locatorsDigest: '' };
	return { binding, selected: { ...value, locatorsDigest: sourceLightDigest(value) }, sources };
}

function rebind(selected: SelectedChangeLocatorSet, binding: SourceLightBinding): SelectedChangeLocatorSet {
	const value = { ...selected, ...binding, locatorsDigest: '' };
	return { ...value, locatorsDigest: sourceLightDigest(value) };
}

describe('source-light commit-parent workspace', () => {
	it('materializes only actual commit-parent files, seals isolated attempts, emits exact transient after ranges, cancels safely and performs owned cleanup', async () => {
		const first = await fixture(), secondBinding = { ...first.binding, attempt: 2, generationId: digest('d') };
		const secondSelected = rebind(first.selected, secondBinding);
		const [manifest, secondManifest] = await Promise.all([
			materializeBaselineWorkspace(first.selected, first.binding, first.sources, 1_000_000),
			materializeBaselineWorkspace(secondSelected, secondBinding, first.sources, 1_000_000),
		]);
		assert.deepEqual(manifest.files.map(file => [file.parent, file.path]), [[id('2'), 'src/stack.ts'], [id('3'), 'src/stack.ts'], [id('3'), 'src/old.ts']]);
		assert.equal((await readBaselineFile(first.binding.key.project, manifest, id('2'), 'src/stack.ts')).toString(), 'old\nbase\n');
		await assert.rejects(() => readBaselineFile(first.binding.key.project, manifest, id('1'), 'src/new.ts'), /not in sealed manifest/);
		let retained: readonly { code: string }[] = [];
		const observed = await withSelectedAfterBlocks(first.selected, first.binding, first.sources, 1_000_000, async blocks => {
			retained = [...blocks];
			assert.deepEqual(blocks.map(block => block.code), ['one\n', 'changed\n', '', 'after\n']);
			assert.deepEqual(blocks.map(block => block.path), ['src/new.ts', 'src/stack.ts', 'src/stack.ts', 'src/new-name.ts']);
			return blocks.map(block => block.code).join('|');
		});
		assert.equal(observed, 'one\n|changed\n||after\n');
		assert.deepEqual(retained.map(block => block.code), ['', '', '', '']);

		assert.notEqual(join(first.binding.key.project, manifest.workspaceRelativePath), join(secondBinding.key.project, secondManifest.workspaceRelativePath));
		const controller = new AbortController(); controller.abort(new Error('cancel fixture'));
		const cancelledFixture = await fixture(3, 'e');
		await assert.rejects(() => materializeBaselineWorkspace(cancelledFixture.selected, cancelledFixture.binding, cancelledFixture.sources, 1_000_000, controller.signal), /cancel fixture/);

		await cleanupBaselineWorkspace(manifest, { ...first.binding, locatorsDigest: first.selected.locatorsDigest }, 1_000_000);
		await assert.rejects(() => stat(join(first.binding.key.project, manifest.workspaceRelativePath)), /ENOENT/);
		await cleanupBaselineWorkspace(secondManifest, { ...secondBinding, locatorsDigest: secondSelected.locatorsDigest }, 1_000_000);
	});

	it('rejects changed pinned objects and refuses cleanup from a foreign attempt', async () => {
		const f = await fixture();
		f.sources.values.set(`${id('2')}:src/stack.ts`, blob(id('0'), 'wrong'));
		await assert.rejects(() => materializeBaselineWorkspace(f.selected, f.binding, f.sources, 1_000_000), /identity mismatch/);
		const clean = await fixture(2, 'f'), manifest = await materializeBaselineWorkspace(clean.selected, clean.binding, clean.sources, 1_000_000);
		await assert.rejects(() => cleanupBaselineWorkspace(manifest, { ...clean.binding, attempt: 3, locatorsDigest: clean.selected.locatorsDigest }, 1_000_000), /Cross-attempt/);
	});
});
