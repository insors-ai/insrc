/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, readFile, realpath, rename, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { TextDecoder } from 'node:util';
import type { ReviewKey } from '../../shared/review-resources.js';
import {
	decodeBaselineWorkspaceManifest,
	decodeSelectedChangeLocatorSet,
	sourceLightDigest,
} from '../../shared/review-source-light.js';
import type {
	BaselineWorkspaceManifest,
	SelectedChangeLocator,
	SelectedChangeLocatorSet,
	SourceLightBinding,
} from '../../shared/review-source-light.js';
import type { BatchReviewSources, PinnedBlob, ReviewObjectRequest } from '../code-review/task-review/sources.js';
import { preparedContextParents } from './prepared-context.js';

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const workspaceRelativePath = (binding: SourceLightBinding) => `.insrc/tmp/review-context/${binding.key.family}/${binding.key.reviewId}/${binding.generationId}/baseline`;

function cancelled(signal?: AbortSignal): void {
	if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : new Error('Source-light workspace cancelled');
}

function commitHeader(blob: PinnedBlob): { readonly tree: string; readonly parents: readonly string[] } {
	const header = new TextDecoder('utf-8', { fatal: true }).decode(blob.bytes).split('\n\n', 1)[0]!.split('\n');
	const tree = header.find(line => line.startsWith('tree '))?.slice(5);
	const parents = header.filter(line => line.startsWith('parent ')).map(line => line.slice(7));
	if (!tree || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(tree) || parents.some(parent => !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(parent))) {
		throw new Error('Invalid pinned commit object');
	}
	return { tree, parents };
}

async function objects(sources: BatchReviewSources, requests: readonly ReviewObjectRequest[], signal?: AbortSignal): Promise<readonly (PinnedBlob | null)[]> {
	const result: (PinnedBlob | null)[] = [];
	for (let offset = 0; offset < requests.length; offset += 256) {
		cancelled(signal);
		result.push(...await sources.objects(requests.slice(offset, offset + 256)));
	}
	return result;
}

async function writeOwned(path: string, bytes: Uint8Array): Promise<void> {
	await mkdir(dirname(path), { recursive: true, mode: 0o700 });
	const file = await open(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
	try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
}

async function syncDirectory(path: string): Promise<void> {
	const directory = await open(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
	try { await directory.sync(); } finally { await directory.close(); }
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}

/** Build an immutable, attempt-owned baseline from the actual applicable
 * parent of every selected change. Files are namespaced by parent and retain
 * their repository-relative path beneath that root. */
export async function materializeBaselineWorkspace(input: unknown, binding: SourceLightBinding, sources: BatchReviewSources,
	maxRecordBytes: number, signal?: AbortSignal, stagingGenerationRoot?: string): Promise<BaselineWorkspaceManifest> {
	const selected = decodeSelectedChangeLocatorSet(input, binding, maxRecordBytes);
	if (binding.key.family !== 'code') throw new Error('Baseline workspaces are code-review only');
	cancelled(signal);
	const reviewRoot = await preparedContextParents(binding.key);
	const generationRoot = stagingGenerationRoot ?? join(reviewRoot, binding.generationId);
	if (stagingGenerationRoot) {
		const canonical = await realpath(stagingGenerationRoot);
		if (canonical !== stagingGenerationRoot || !canonical.startsWith(`${reviewRoot}/`)) throw new Error('Foreign source-light staging generation');
	} else await mkdir(generationRoot, { mode: 0o700 }).catch(error => { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; });
	const generationStat = await lstat(generationRoot);
	if (!generationStat.isDirectory() || generationStat.isSymbolicLink() || await realpath(generationRoot) !== generationRoot) throw new Error('Unsafe source-light generation directory');
	const target = join(generationRoot, 'baseline'), stage = join(generationRoot, `baseline.prepare-${randomUUID()}`);
	try { await lstat(target); throw new Error('Baseline workspace already exists'); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
	await mkdir(stage, { mode: 0o700 });
	try {
		const commitIds = [...new Set(selected.locators.flatMap(locator => [locator.commit, ...(locator.applicableParent ? [locator.applicableParent] : [])]))];
		const commitObjects = await objects(sources, commitIds.map(commit => ({ commit })), signal);
		const commits = new Map<string, ReturnType<typeof commitHeader>>();
		for (const [index, id] of commitIds.entries()) {
			const blob = commitObjects[index];
			if (!blob || blob.oid !== id) throw new Error('Pinned commit identity mismatch');
			commits.set(id!, commitHeader(blob));
		}
		for (const locator of selected.locators) {
			const commit = commits.get(locator.commit);
			if (!commit || !sameStrings(commit.parents, locator.commitParents)) throw new Error('Selected commit parent set changed');
		}

		const parentPairs = [...new Map(selected.locators.flatMap(locator => locator.applicableParent
			? [[`${locator.commit}:${locator.applicableParent}`, { commit: locator.commit, parent: locator.applicableParent, tree: commits.get(locator.applicableParent)!.tree }] as const]
			: [])).values()];
		const relevantByPath = new Map<string, { parent: string; path: string; oid: string }>();
		for (const locator of selected.locators) if (locator.before && locator.applicableParent) {
			const identity = `${locator.applicableParent}:${locator.before.path}`, previous = relevantByPath.get(identity);
			if (previous && previous.oid !== locator.before.oid) throw new Error('Conflicting pinned baseline object identity');
			relevantByPath.set(identity, { parent: locator.applicableParent, path: locator.before.path, oid: locator.before.oid });
		}
		const relevant = [...relevantByPath.values()];
		const baselineObjects = await objects(sources, relevant.map(file => ({ commit: file.parent, path: file.path })), signal);
		const files: BaselineWorkspaceManifest['files'][number][] = [];
		let stored = 0;
		for (const [index, expected] of relevant.entries()) {
			cancelled(signal);
			const blob = baselineObjects[index];
			if (!blob || blob.oid !== expected!.oid) throw new Error('Pinned baseline object identity mismatch');
			await writeOwned(join(stage, 'parents', expected!.parent, expected!.path), blob.bytes);
			files.push({ order: index, parent: expected!.parent, path: expected!.path, oid: blob.oid, bytes: blob.bytes.length, contentDigest: sha256(blob.bytes) });
			stored += blob.bytes.length;
		}
		cancelled(signal);
		const manifest: BaselineWorkspaceManifest = { schemaVersion: 1, encoding: 'baseline-workspace-v1', key: structuredClone(binding.key),
			attempt: binding.attempt, generationId: binding.generationId, inputDigest: binding.inputDigest, sourceIdentity: binding.sourceIdentity,
			locatorsDigest: selected.locatorsDigest, workspaceRelativePath: workspaceRelativePath(binding), parents: parentPairs, files,
			byteTotals: { files: files.length, stored }, sealedAt: new Date().toISOString(), cleanupState: 'owned', manifestDigest: '0'.repeat(64) };
		manifest.manifestDigest = sourceLightDigest({ ...manifest, manifestDigest: '' });
		decodeBaselineWorkspaceManifest(manifest, { ...binding, locatorsDigest: selected.locatorsDigest }, maxRecordBytes);
		await writeOwned(join(stage, 'manifest.json'), Buffer.from(JSON.stringify(manifest) + '\n'));
		await syncDirectory(stage); cancelled(signal); await rename(stage, target); await syncDirectory(generationRoot);
		return structuredClone(manifest);
	} catch (error) {
		await rm(stage, { recursive: true, force: true });
		throw error;
	}
}

export interface TransientSelectedBlock {
	readonly locatorOrder: number;
	readonly commit: string;
	readonly path: string;
	readonly lines?: readonly [number, number] | undefined;
	readonly deletionAt?: number | undefined;
	readonly deleted: boolean;
	readonly binary: boolean;
	readonly code: string;
}

/** Decode exact reviewed-version ranges only for the lifetime of `consume`.
 * Every internal string is blanked before this call returns. */
export async function withSelectedAfterBlocks<T>(input: unknown, binding: SourceLightBinding, sources: BatchReviewSources,
	maxRecordBytes: number, consume: (blocks: readonly TransientSelectedBlock[]) => Promise<T>, signal?: AbortSignal): Promise<T> {
	const selected = decodeSelectedChangeLocatorSet(input, binding, maxRecordBytes);
	const after = selected.locators.flatMap(locator => locator.after ? [{ commit: locator.commit, path: locator.after.path }] : []);
	const blobs = await objects(sources, after, signal);
	let blobIndex = 0;
	const blocks: Array<TransientSelectedBlock & { code: string }> = [];
	try {
		for (const locator of selected.locators) {
			cancelled(signal);
			const blob = locator.after ? blobs[blobIndex++] : null;
			if (locator.after && (!blob || blob.oid !== locator.after.oid)) throw new Error('Pinned reviewed object identity mismatch');
			if (locator.binary || locator.after === null) {
				const metadata = locator.blocks.length ? locator.blocks : [undefined];
				for (const block of metadata) blocks.push({ locatorOrder: locator.order,
					commit: locator.commit, path: locator.after?.path ?? locator.before!.path,
					...(block?.kind === 'deletion' ? { deletionAt: block.atLine } : block?.kind === 'after-range' ? { lines: [block.startLine, block.endLine] as const } : {}),
					deleted: locator.after === null, binary: locator.binary, code: '' });
				continue;
			}
			const text = new TextDecoder('utf-8', { fatal: true }).decode(blob!.bytes), lines = text.split('\n');
			if (text.endsWith('\n')) lines.pop();
			for (const block of locator.blocks) {
				if (block.kind !== 'after-range' || block.endLine > lines.length) throw new Error('Selected after range exceeds pinned object');
				blocks.push({ locatorOrder: locator.order, commit: locator.commit, path: locator.after.path, lines: [block.startLine, block.endLine],
					deleted: false, binary: false, code: lines.slice(block.startLine - 1, block.endLine).join('\n') + (block.endLine < lines.length || text.endsWith('\n') ? '\n' : '') });
			}
		}
		return await consume(blocks);
	} finally {
		for (const block of blocks) block.code = '';
		blocks.length = 0;
	}
}

/** Remove only the exact sealed workspace named by its bound manifest. */
export async function cleanupBaselineWorkspace(input: unknown, binding: SourceLightBinding & { readonly locatorsDigest: string }, maxRecordBytes: number): Promise<void> {
	const manifest = decodeBaselineWorkspaceManifest(input, binding, maxRecordBytes);
	if (manifest.cleanupState !== 'owned') throw new Error('Baseline workspace is not owned for cleanup');
	const root = join(binding.key.project, manifest.workspaceRelativePath), path = join(root, 'manifest.json');
	if (await realpath(root) !== root) throw new Error('Unsafe baseline workspace cleanup');
	const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
	let stored: unknown;
	try { stored = JSON.parse(await file.readFile('utf8')); } finally { await file.close(); }
	const verified = decodeBaselineWorkspaceManifest(stored, binding, maxRecordBytes);
	if (verified.manifestDigest !== manifest.manifestDigest) throw new Error('Baseline cleanup manifest mismatch');
	await rm(root, { recursive: true });
	await syncDirectory(dirname(root));
}

export async function readBaselineFile(project: string, manifest: BaselineWorkspaceManifest, parent: string, path: string): Promise<Buffer> {
	const entry = manifest.files.find(file => file.parent === parent && file.path === path);
	if (!entry) throw new Error('Baseline file not in sealed manifest');
	const bytes = await readFile(join(project, manifest.workspaceRelativePath, 'parents', parent, path));
	if (bytes.length !== entry.bytes || sha256(bytes) !== entry.contentDigest) throw new Error('Baseline file integrity mismatch');
	return bytes;
}
