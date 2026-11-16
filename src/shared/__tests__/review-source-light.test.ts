/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ReviewKey } from '../review-resources.js';
import {
	decodeBaselineWorkspaceManifest,
	decodePreparedSourceDisposition,
	decodeSelectedChangeLocatorSet,
	sourceLightDigest,
} from '../review-source-light.js';

const oid = (value: string): string => value.repeat(40);
const digest = (value: string): string => value.repeat(64);
const key: ReviewKey = { project: '/repo/π', family: 'code', reviewId: 'review-1' };
const binding = { key, attempt: 2, generationId: digest('a'), inputDigest: digest('b'), sourceIdentity: digest('c') } as const;

function locators() {
	const value = { schemaVersion: 1 as const, encoding: 'source-light-locators-v1' as const, ...binding, locators: [
		{ schemaVersion: 1 as const, order: 0, commit: oid('1'), commitParents: [oid('2')], applicableParent: oid('2'), operation: 'add' as const, before: null, after: { path: 'src/α.ts', oid: oid('3') }, blocks: [{ kind: 'after-range' as const, startLine: 1, endLine: 2 }], binary: false },
		{ schemaVersion: 1 as const, order: 1, commit: oid('4'), commitParents: [oid('5')], applicableParent: oid('5'), operation: 'delete' as const, before: { path: 'src/β.ts', oid: oid('6') }, after: null, blocks: [{ kind: 'deletion' as const, atLine: 7 }], binary: false },
		{ schemaVersion: 1 as const, order: 2, commit: oid('7'), commitParents: [oid('8'), oid('9')], applicableParent: oid('9'), operation: 'rename' as const, before: { path: 'src/旧.ts', oid: oid('a') }, after: { path: 'src/新.ts', oid: oid('b') }, blocks: [{ kind: 'after-range' as const, startLine: 3, endLine: 3 }], binary: false },
		{ schemaVersion: 1 as const, order: 3, commit: oid('c'), commitParents: [oid('d')], applicableParent: oid('d'), operation: 'replacement' as const, before: { path: 'img/a.bin', oid: oid('e') }, after: { path: 'img/a.bin', oid: oid('f') }, blocks: [], binary: true, replacementOf: { commit: oid('0'), path: 'img/a.bin', oid: oid('e') } },
	], locatorsDigest: '' };
	return { ...value, locatorsDigest: sourceLightDigest(value) };
}

function manifest(locatorDigest: string) {
	const value = { schemaVersion: 1 as const, encoding: 'baseline-workspace-v1' as const, ...binding, locatorsDigest: locatorDigest,
		workspaceRelativePath: `.insrc/tmp/review-context/code/review-1/${binding.generationId}/baseline`,
		parents: [{ commit: oid('7'), parent: oid('9'), tree: oid('1') }],
		files: [{ order: 0, parent: oid('9'), path: 'src/旧.ts', oid: oid('a'), bytes: 12, contentDigest: digest('d') }],
		byteTotals: { files: 1, stored: 12 }, sealedAt: '2026-11-16T00:00:00.000Z', cleanupState: 'owned' as const, manifestDigest: '' };
	return { ...value, manifestDigest: sourceLightDigest(value) };
}

describe('source-light review contracts', () => {
	it('round-trips ordered Unicode add/delete/rename/replacement/merge/binary locators and a sealed parent workspace without source bodies', () => {
		const selected = locators();
		assert.deepEqual(decodeSelectedChangeLocatorSet(selected, binding, 1_000_000), selected);
		assert.deepEqual(decodeBaselineWorkspaceManifest(manifest(selected.locatorsDigest), { ...binding, locatorsDigest: selected.locatorsDigest }, 1_000_000), manifest(selected.locatorsDigest));
		const durable = JSON.stringify({ selected, workspace: manifest(selected.locatorsDigest) });
		assert.doesNotMatch(durable, /"(?:code|source|body|bytesBase64)"\s*:/);
	});

	it('rejects unknown versions, tampering and cross-attempt records while historical eager state only requests cold requalification', () => {
		const selected = locators();
		assert.throws(() => decodeSelectedChangeLocatorSet({ ...selected, attempt: 3 }, binding, 1_000_000), /Cross-attempt/);
		assert.throws(() => decodeSelectedChangeLocatorSet({ ...selected, locators: selected.locators.map((item, index) => index ? item : { ...item, order: 1 }) }, binding, 1_000_000), /Unordered/);
		assert.throws(() => decodePreparedSourceDisposition({ ...selected, schemaVersion: 9 }, binding, 1_000_000), /Unknown or ambiguous/);
		assert.throws(() => decodePreparedSourceDisposition({ ...selected, encoding: undefined }, binding, 1_000_000), /Unknown or ambiguous/);
		assert.deepEqual(decodePreparedSourceDisposition({ schemaVersion: 1, objects: [], views: [] }, binding, 1_000_000), { kind: 'cold-requalification', historicalVersion: 1 });
		const eager = { schemaVersion: 2, encoding: 'staged-values-v2', objects: [], views: [] };
		assert.deepEqual(decodePreparedSourceDisposition(eager, binding, 1_000_000), { kind: 'cold-requalification', historicalVersion: 2 });
		assert.throws(() => decodePreparedSourceDisposition(eager, binding, 1_000_000, 'reject'), /requires cold requalification/);
		const workspace = manifest(selected.locatorsDigest);
		assert.throws(() => decodeBaselineWorkspaceManifest({ ...workspace, byteTotals: { ...workspace.byteTotals, stored: 13 } }, { ...binding, locatorsDigest: selected.locatorsDigest }, 1_000_000), /Unaccounted/);
	});
});
