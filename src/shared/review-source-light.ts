/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { Type } from '@sinclair/typebox';
import type { Static, TSchema } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { ReviewKeySchema } from './review-resources.js';
import type { ReviewKey } from './review-resources.js';

const object = <T extends Record<string, TSchema>>(fields: T) => Type.Object(fields, { additionalProperties: false });
const oid = Type.String({ pattern: '^(?:[0-9a-f]{40}|[0-9a-f]{64})$' });
const digest = Type.String({ pattern: '^[0-9a-f]{64}$' });
const count = Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER });
const positive = Type.Integer({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER });
const path = Type.String({ minLength: 1, maxLength: 4096 });
const range = object({ kind: Type.Literal('after-range'), startLine: positive, endLine: positive });
const deletion = object({ kind: Type.Literal('deletion'), atLine: count });
const gitObject = Type.Union([object({ path, oid }), Type.Null()]);
const enumeration = <T extends string>(values: readonly T[]) => Type.Union(values.map(value => Type.Literal(value)));

export const SelectedChangeLocatorSchema = object({
	schemaVersion: Type.Literal(1),
	order: count,
	commit: oid,
	commitParents: Type.Array(oid, { maxItems: 128, uniqueItems: true }),
	applicableParent: Type.Union([oid, Type.Null()]),
	operation: enumeration(['add', 'modify', 'delete', 'rename', 'replacement']),
	before: gitObject,
	after: gitObject,
	blocks: Type.Array(Type.Union([range, deletion]), { maxItems: 10000 }),
	binary: Type.Boolean(),
	replacementOf: Type.Optional(object({ commit: oid, path, oid: Type.Union([oid, Type.Null()]) })),
});
export type SelectedChangeLocator = Static<typeof SelectedChangeLocatorSchema>;

export const SelectedChangeLocatorSetSchema = object({
	schemaVersion: Type.Literal(1),
	encoding: Type.Literal('source-light-locators-v1'),
	key: ReviewKeySchema,
	attempt: positive,
	generationId: digest,
	inputDigest: digest,
	sourceIdentity: digest,
	locators: Type.Array(SelectedChangeLocatorSchema, { minItems: 1, maxItems: 100000 }),
	locatorsDigest: digest,
});
export type SelectedChangeLocatorSet = Static<typeof SelectedChangeLocatorSetSchema>;

export const BaselineWorkspaceManifestSchema = object({
	schemaVersion: Type.Literal(1),
	encoding: Type.Literal('baseline-workspace-v1'),
	key: ReviewKeySchema,
	attempt: positive,
	generationId: digest,
	inputDigest: digest,
	sourceIdentity: digest,
	locatorsDigest: digest,
	workspaceRelativePath: path,
	parents: Type.Array(object({ commit: oid, parent: oid, tree: oid }), { maxItems: 100000 }),
	files: Type.Array(object({ order: count, parent: oid, path, oid, bytes: count, contentDigest: digest }), { maxItems: 100000 }),
	byteTotals: object({ files: count, stored: count }),
	sealedAt: Type.String({ minLength: 20, maxLength: 30 }),
	cleanupState: enumeration(['owned', 'cleanup-claimed', 'removed']),
	manifestDigest: digest,
});
export type BaselineWorkspaceManifest = Static<typeof BaselineWorkspaceManifestSchema>;

export interface SourceLightBinding {
	readonly key: ReviewKey;
	readonly attempt: number;
	readonly generationId: string;
	readonly inputDigest: string;
	readonly sourceIdentity: string;
}

function stable(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(stable);
	if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, member]) => [key, stable(member)]));
	return value;
}

export function sourceLightDigest(value: unknown): string {
	return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

function reviewPath(value: string): void {
	if (/[\\\x00-\x1f\x7f:]/.test(value) || value.startsWith('/') || value.split('/').some(part => !part || part === '.' || part === '..')) {
		throw new Error('Invalid source-light repository path');
	}
}

function bounded<T extends TSchema>(schema: T, input: unknown, maxBytes: number): Static<T> {
	if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error('Invalid source-light record capacity');
	const encoded = JSON.stringify(input);
	if (encoded === undefined || Buffer.byteLength(encoded) > maxBytes || !Value.Check(schema, input)) throw new Error('Invalid or oversized source-light record');
	return input as Static<T>;
}

function bound(value: SourceLightBinding, expected: SourceLightBinding): void {
	if (!isDeepStrictEqual(value.key, expected.key) || value.attempt !== expected.attempt || value.generationId !== expected.generationId
		|| value.inputDigest !== expected.inputDigest || value.sourceIdentity !== expected.sourceIdentity) throw new Error('Cross-attempt source-light record');
}

function validateLocator(locator: SelectedChangeLocator): void {
	reviewPath(locator.after?.path ?? locator.before?.path ?? '');
	if (locator.before) reviewPath(locator.before.path);
	if (locator.after) reviewPath(locator.after.path);
	if (locator.replacementOf) reviewPath(locator.replacementOf.path);
	if (locator.applicableParent === null ? locator.commitParents.length !== 0 : !locator.commitParents.includes(locator.applicableParent)) throw new Error('Unbound applicable parent');
	if (locator.blocks.some(block => block.kind === 'after-range' && block.startLine > block.endLine)) throw new Error('Reversed selected range');
	if (locator.binary && locator.blocks.length) throw new Error('Binary locator cannot contain textual blocks');
	const before = locator.before !== null, after = locator.after !== null;
	if (locator.operation === 'add' && (before || !after) || locator.operation === 'delete' && (!before || after)
		|| ['modify', 'rename', 'replacement'].includes(locator.operation) && (!before || !after)) throw new Error('Source-light operation/object mismatch');
	if (locator.operation === 'rename' && locator.before?.path === locator.after?.path) throw new Error('Rename locator must change path');
	if (locator.operation !== 'rename' && locator.operation !== 'replacement' && before && after && locator.before!.path !== locator.after!.path) throw new Error('Unexpected source-light path move');
	if ((locator.operation === 'replacement') !== (locator.replacementOf !== undefined)) throw new Error('Replacement locator metadata mismatch');
}

export function decodeSelectedChangeLocatorSet(input: unknown, expected: SourceLightBinding, maxBytes: number): SelectedChangeLocatorSet {
	const value = bounded(SelectedChangeLocatorSetSchema, input, maxBytes);
	bound(value, expected);
	for (const [index, locator] of value.locators.entries()) {
		if (locator.order !== index) throw new Error('Unordered source-light locator set');
		validateLocator(locator);
	}
	if (sourceLightDigest({ ...value, locatorsDigest: '' }) !== value.locatorsDigest) throw new Error('Tampered source-light locator set');
	return structuredClone(value);
}

export function decodeBaselineWorkspaceManifest(input: unknown, expected: SourceLightBinding & { readonly locatorsDigest: string }, maxBytes: number): BaselineWorkspaceManifest {
	const value = bounded(BaselineWorkspaceManifestSchema, input, maxBytes);
	bound(value, expected);
	if (value.locatorsDigest !== expected.locatorsDigest) throw new Error('Foreign baseline locator set');
	reviewPath(value.workspaceRelativePath);
	const expectedWorkspace = `.insrc/tmp/review-context/${expected.key.family}/${expected.key.reviewId}/${expected.generationId}/baseline`;
	if (value.workspaceRelativePath !== expectedWorkspace) throw new Error('Foreign baseline workspace');
	if (!Number.isFinite(Date.parse(value.sealedAt))) throw new Error('Invalid baseline seal timestamp');
	const parents = new Set<string>();
	for (const parent of value.parents) {
		const id = `${parent.commit}:${parent.parent}`;
		if (parents.has(id)) throw new Error('Duplicate baseline parent identity');
		parents.add(id);
	}
	let bytes = 0;
	const files = new Set<string>();
	for (const [index, file] of value.files.entries()) {
		if (file.order !== index || !value.parents.some(parent => parent.parent === file.parent)) throw new Error('Unordered or unbound baseline file');
		reviewPath(file.path);
		const id = `${file.parent}:${file.path}`;
		if (files.has(id)) throw new Error('Duplicate baseline file');
		files.add(id); bytes += file.bytes;
	}
	if (!Number.isSafeInteger(bytes) || value.byteTotals.files !== value.files.length || value.byteTotals.stored !== bytes) throw new Error('Unaccounted baseline workspace bytes');
	if (sourceLightDigest({ ...value, manifestDigest: '' }) !== value.manifestDigest) throw new Error('Tampered baseline workspace manifest');
	return structuredClone(value);
}

export type PreparedSourceDisposition =
	| { readonly kind: 'source-light'; readonly locators: SelectedChangeLocatorSet }
	| { readonly kind: 'cold-requalification'; readonly historicalVersion: 1 | 2 };

/** Historical eager prepared views are supported only as an input signal for a
 * cold rebuild. Their stored objects/views never become source authority. */
export function decodePreparedSourceDisposition(input: unknown, expected: SourceLightBinding, maxBytes: number,
	historical: 'cold-requalify' | 'reject' = 'cold-requalify'): PreparedSourceDisposition {
	if (Value.Check(SelectedChangeLocatorSetSchema, input)) return { kind: 'source-light', locators: decodeSelectedChangeLocatorSet(input, expected, maxBytes) };
	const value = bounded(Type.Object({}, { additionalProperties: true }), input, maxBytes) as Record<string, unknown>;
	const eager = (value['schemaVersion'] === 1 && value['encoding'] === undefined || value['schemaVersion'] === 2 && value['encoding'] === 'staged-values-v2')
		&& Array.isArray(value['objects']) && Array.isArray(value['views']);
	if (eager) {
		if (historical === 'reject') throw new Error('Historical eager source state requires cold requalification');
		return { kind: 'cold-requalification', historicalVersion: value['schemaVersion'] as 1 | 2 };
	}
	throw new Error('Unknown or ambiguous prepared source format');
}
