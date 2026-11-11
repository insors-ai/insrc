/**
 * The document-relations pass (Epic c2ba6fa6 s10): the configured model's
 * proposed relationships for a graph-complete repository's new or changed
 * markdown documents, in their own table, stamped with the generation they
 * were computed at.
 *
 *   - It starts only from a complete graph (sc1); otherwise it groups nothing.
 *   - The provider is the role's configured provider (selectDocRelationsProvider);
 *     when there is none, or the provider call throws, the pass stops, records
 *     the extraction as 'unavailable' with the cause, writes no row and returns
 *     a non-outcome, which the scheduler counts as a failed pass (retry).
 *   - A document is sent only when its file hash or the validated model differs
 *     from its stored row (ac5); one call at a time, yielding to code work and
 *     stopping on shutdown (ac4, k4).
 *   - A returned value that is not a set of proposals is the document's failure
 *     (its earlier row stays, the next pass sends it again); a proposal with an
 *     unknown source or an unstored target is dropped and counted; a proposal
 *     that repeats a link the document already writes is dropped.
 *   - A row is published only while its document still has the hash it was
 *     read at and no full index has begun -- or begun and finished -- since the
 *     pass began ('superseded', by the repository's reset counter).
 *   - Rows of documents no longer stored are deleted, and proposals whose
 *     endpoints vanished are pruned, without a model call -- first, so also
 *     when no provider is available.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getLogger } from '../shared/logger.js';
import type { Entity, LLMMessage, LLMProvider, StructuredSchema } from '../shared/types.js';
import { loadAnalyzeConfig } from '../config/analyze.js';
import { findEntitiesByFile } from '../db/entities.js';
import { getGraphStore, withWriteTxn } from '../db/graph/store.js';
import { getIndexStateRowInTxn } from '../db/graph/index-state-rows.js';
import { lookupRepoIdInTxn } from '../db/repos.js';
import { readResetCounterInTxn } from '../db/subsystem-changes.js';
import {
	deleteDocRelationRowInTxn,
	documentRelations,
	fileEntityHashInTxn,
	readDocRelationRowsInTxn,
	storedFilesInTxn,
	storedMarkdownFilesInTxn,
	writeDocRelationExtractionInTxn,
	writeDocRelationRowInTxn,
	type DocRelationRow,
} from '../db/doc-relations.js';
import { makeEntityId } from './parser/base.js';
import type { SubsystemsOutcome } from './subsystem-scheduler.js';
import {
	classifyDocRelationsFailure,
	DocRelationsOutputInvalid,
	failureMessage,
	selectDocRelationsProvider,
	type DocRelationsSelection,
} from './doc-relations-provider.js';

const log = getLogger('doc-relations-pass');

export interface DocRelationsPassDeps {
	readonly repoPath:         string;
	readonly waitForCodeIdle?: (() => Promise<void>) | undefined;
	readonly isCodeIdle?:      (() => boolean) | undefined;
	readonly shouldStop?:      (() => boolean) | undefined;
	/** The provider selection (a seam): the role's configured provider by default. */
	readonly select?:          ((repoPath: string) => DocRelationsSelection) | undefined;
	/** Test seam: runs after a document's value is validated, before its row is published. */
	readonly beforePublish?:   ((relFile: string) => Promise<void>) | undefined;
}

/** What a pass whose provider is unavailable returns: not a SubsystemsOutcome, so the scheduler retries. */
export interface DocRelationsUnavailable {
	readonly unavailable: true;
	readonly reason:      string;
}

const PROMPT_REL = 'prompts/analyze/doc-relations.system.md';
const SRC_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const DOC_RELATIONS_SCHEMA: StructuredSchema = {
	type: 'object',
	required: ['proposals'],
	additionalProperties: false,
	properties: {
		proposals: {
			type: 'array',
			items: {
				type: 'object',
				required: ['source', 'target', 'rationale'],
				additionalProperties: false,
				properties: {
					source:    { type: 'string' },
					target:    { type: 'string' },
					rationale: { type: 'string' },
				},
			},
		},
	},
};

/** The indexer's file content hash (src/indexer/index.ts contentHash). */
const fileHash = (text: string): string => createHash('sha256').update(text).digest('hex').slice(0, 16);

/** One proposal as the model wrote it, before resolution. */
export interface RawProposal { readonly source: string; readonly target: string; readonly rationale: string }

/** A proposal resolved to stored entity ids, with the identity the measurement compares. */
export interface ResolvedProposal {
	readonly from:      string;
	readonly to:        string;
	readonly rationale: string;
	/** The target as the hand-checked set names it: a repo-relative path, or path#symbol. */
	readonly target:    string;
}

/** What examining one document produced. */
export interface Examination {
	/** Proposals with a source of the document and a stored target, not repeating a written link. */
	readonly admitted:   readonly ResolvedProposal[];
	/** Proposals dropped for an unknown source or an unresolvable target. */
	readonly unresolved: number;
	/** Proposals dropped because the document already writes the link. */
	readonly repeated:   number;
}

const DOC = /\.mdx?$/i;

/** A repository-relative path in canonical form, or undefined when it is not one. */
export function canonicalPath(raw: string): string | undefined {
	// Separators first, then POSIX normalisation, so 'src\\sub\\..\\x.ts' and './src/x.ts' are the same 'src/x.ts'.
	const p = posix.normalize(raw.trim().replace(/\\/g, '/')).replace(/^\.\//, '').replace(/\/$/, '');
	if (p === '' || p === '.' || p.startsWith('../') || p === '..' || p.startsWith('/')) return undefined;
	return p;
}

/** The canonical identity of a link's target: path, or path#symbol; an anchor on a document is dropped. */
export function canonicalTarget(raw: string): string | undefined {
	const [pathPart, symbol] = raw.split('#', 2) as [string, string | undefined];
	const path = canonicalPath(pathPart);
	if (path === undefined) return undefined;
	if (symbol === undefined || symbol === '' || DOC.test(path)) return path;
	return `${path}#${symbol}`;
}

/** The shape check of a returned value: an object with a proposals array of three strings each. */
export function validateProposals(value: unknown): RawProposal[] {
	if (typeof value !== 'object' || value === null || !Array.isArray((value as { proposals?: unknown }).proposals)) {
		throw new DocRelationsOutputInvalid('the value is not an object with a proposals array');
	}
	const out: RawProposal[] = [];
	for (const [i, p] of ((value as { proposals: unknown[] }).proposals).entries()) {
		const r = p as Record<string, unknown> | null;
		if (typeof r !== 'object' || r === null || typeof r['source'] !== 'string' || typeof r['target'] !== 'string' || typeof r['rationale'] !== 'string') {
			throw new DocRelationsOutputInvalid(`proposal ${i} is not { source, target, rationale } strings`);
		}
		out.push({ source: r['source'], target: r['target'], rationale: r['rationale'] });
	}
	return out;
}

/**
 * Examine one document: ask the provider, check the value's shape, resolve
 * each proposal against the store and drop the ones the document already
 * links. Throws what the provider call throws (a provider failure), or
 * DocRelationsOutputInvalid for a value of the wrong shape.
 */
export async function examineDocument(args: {
	readonly provider: LLMProvider;
	readonly repoPath: string;
	readonly relFile:  string;
	readonly text:     string;
	readonly sources:  readonly Entity[];
	readonly files:    readonly string[];
}): Promise<Examination> {
	const { provider, repoPath, relFile, text, sources, files } = args;
	const raw = validateProposals(await provider.completeStructured<unknown>(messagesFor(relFile, text, sources, files), DOC_RELATIONS_SCHEMA, { maxAttempts: 3 }));

	const sourceIds = new Set(sources.map(e => e.id));
	const fileSet = new Set(files);
	const byFile = new Map<string, Entity[]>();
	const entitiesOf = async (rel: string): Promise<Entity[]> => {
		let list = byFile.get(rel);
		if (list === undefined) { list = await findEntitiesByFile(null, join(repoPath, rel)); byFile.set(rel, list); }
		return list;
	};
	// The links the document writes: stored, or resolved by name now -- from any of its sources.
	const written = new Set<string>();
	for (const src of sources) for (const r of (await documentRelations(src.id, 'out', { state: 'not-measured' })).rows) written.add(r.to);

	const s = await getGraphStore();
	const admitted: ResolvedProposal[] = [];
	const seen = new Set<string>();
	let unresolved = 0;
	let repeated = 0;
	for (const p of raw) {
		if (!sourceIds.has(p.source)) { unresolved++; continue; }
		// The target in the hand-checked set's identity: separators and dot segments normalised, a
		// document's anchor dropped (the target is the document).
		const canonical = canonicalTarget(p.target);
		if (canonical === undefined) { unresolved++; continue; }
		const [rel, symbol] = canonical.split('#', 2) as [string, string | undefined];
		if (!fileSet.has(rel) || rel === relFile) { unresolved++; continue; }
		let to: string | undefined;
		if (symbol === undefined || symbol === '') {
			to = makeEntityId(repoPath, join(repoPath, rel), 'file', join(repoPath, rel));
		} else {
			const named = (await entitiesOf(rel)).filter(e => e.kind !== 'file' && e.name === symbol);
			to = named.length === 1 ? named[0]!.id : undefined;
		}
		if (to === undefined || s.entityIdByString.get(to) === undefined) { unresolved++; continue; }
		// Only a link the document already writes is a repeat: `path` and `path#symbol` are distinct links,
		// so a symbol in a file the document links is a new proposal.
		if (written.has(to)) { repeated++; continue; }
		const target = symbol === undefined || symbol === '' ? rel : `${rel}#${symbol}`;
		if (seen.has(`${p.source}\0${to}`)) continue;
		seen.add(`${p.source}\0${to}`);
		admitted.push({ from: p.source, to, rationale: p.rationale.slice(0, 200), target });
	}
	return { admitted, unresolved, repeated };
}

/** The messages for one document: its sources with their line ranges, its text with line numbers, the repository's files. */
function messagesFor(relFile: string, text: string, sources: readonly Entity[], files: readonly string[]): LLMMessage[] {
	const system = readFileSync(join(SRC_ROOT, PROMPT_REL), 'utf8');
	const numbered = text.split('\n').map((l, i) => `${String(i + 1).padStart(5)}  ${l}`).join('\n');
	const table = [...sources]
		.sort((a, b) => a.startLine - b.startLine)
		.map(e => `- ${e.id}  ${e.kind === 'file' ? '(lines outside every section)' : `lines ${e.startLine}-${e.endLine}: ${e.name}`}`)
		.join('\n');
	const user =
		`DOCUMENT: ${relFile}\n\nSOURCES:\n${table}\n\nTEXT:\n${numbered}\n\n` +
		`FILES (repository-relative; a target must be one of these, optionally #symbol):\n${files.join('\n')}\n\n` +
		'Emit the JSON object now.';
	return [{ role: 'system', content: system }, { role: 'user', content: user }];
}

/** Run the pass for one repository. */
export async function runDocRelationsPass(deps: DocRelationsPassDeps): Promise<SubsystemsOutcome | DocRelationsUnavailable> {
	const { repoPath } = deps;
	const startedAt = Date.now();
	const s = await getGraphStore();
	const repoId = lookupRepoIdInTxn(s, repoPath);
	const state = repoId === undefined ? undefined : getIndexStateRowInTxn(s, repoId);
	const graphComplete = state !== undefined && state.fullIndexFinished && !state.endpointPassFailed
		&& state.uncommittedFiles.length === 0 && state.pending['awaiting-target'] === 0 && state.unwritable === 0;
	if (repoId === undefined || state === undefined || !graphComplete) {
		log.debug({ repo: repoPath }, 'doc-relations pass: the graph is not complete; nothing examined');
		return { summariesFailed: 0, stopped: false, startedAt, grouped: false };
	}
	const generation = state.generation;
	// A whole-repository delete (the start of every full index) increments the reset counter: a value it
	// changed since the pass began was computed against entities that were rebuilt, so it is not published.
	const resetAtStart = readResetCounterInTxn(s, repoId);
	const now = (): string => new Date().toISOString();
	const unavailable = async (reason: string, examined: number, failed: number): Promise<DocRelationsUnavailable> => {
		await withWriteTxn(t => writeDocRelationExtractionInTxn(t, repoId, { state: 'unavailable', reason, examined, failed, computedAtGeneration: generation, updatedAt: now() }));
		log.info({ repo: repoPath, reason }, 'doc-relations pass: provider unavailable; retrying after a back-off');
		return { unavailable: true, reason };
	};

	// First, and without a model call (so also while no provider is available): rows of documents no longer stored go, and proposals whose endpoints vanished are pruned.
	const docs = storedMarkdownFilesInTxn(s, repoId);
	const docSet = new Set(docs);
	const rows = readDocRelationRowsInTxn(s, repoId);
	await withWriteTxn(t => {
		for (const [rel, row] of rows) {
			if (!docSet.has(rel)) { deleteDocRelationRowInTxn(t, repoId, rel); continue; }
			const live = row.proposals.filter(p => t.entityIdByString.get(p.from) !== undefined && t.entityIdByString.get(p.to) !== undefined);
			if (live.length !== row.proposals.length) writeDocRelationRowInTxn(t, repoId, rel, { ...row, proposals: live });
		}
	});

	const selection = (deps.select ?? (r => selectDocRelationsProvider(loadAnalyzeConfig(), r)))(repoPath);
	if (!selection.ok) return unavailable(selection.reason, 0, 0);
	const { provider, modelId } = selection;

	const files = storedFilesInTxn(s, repoId);
	let examined = 0;
	let failed = 0;
	let stopped = false;
	for (const rel of docs) {
		const hash = fileEntityHashInTxn(s, repoPath, rel);
		const row = rows.get(rel);
		if (hash === undefined || (row !== undefined && row.contentHash === hash && row.modelId === modelId)) continue;
		if (deps.shouldStop?.() === true) { stopped = true; break; }
		if (deps.isCodeIdle?.() === false) await deps.waitForCodeIdle?.();
		if (deps.shouldStop?.() === true) { stopped = true; break; }

		let text: string;
		try { text = readFileSync(join(repoPath, rel), 'utf8'); } catch { continue; }
		if (fileHash(text) !== hash) continue;   // edited since it was indexed: its re-index requests the next pass
		const sources = (await findEntitiesByFile(null, join(repoPath, rel))).filter(e => e.kind === 'section' || e.kind === 'document' || e.kind === 'file');

		let result: Examination;
		examined++;
		try {
			result = await examineDocument({ provider, repoPath, relFile: rel, text, sources, files });
		} catch (err) {
			if (classifyDocRelationsFailure(err) === 'output') {
				failed++;
				log.warn({ repo: repoPath, file: rel, err: failureMessage(err) }, 'doc-relations pass: the value is not a set of proposals; the document is examined again next pass');
				continue;
			}
			return unavailable(failureMessage(err), examined, failed);
		}
		await deps.beforePublish?.(rel);

		const published = await withWriteTxn(t => {
			const current = getIndexStateRowInTxn(t, repoId);
			if (current === undefined || !current.fullIndexFinished || readResetCounterInTxn(t, repoId) !== resetAtStart) return 'superseded' as const;
			if (fileEntityHashInTxn(t, repoPath, rel) !== hash) return 'changed' as const;
			const next: DocRelationRow = { contentHash: hash, modelId, computedAtGeneration: generation, proposals: result.admitted.map(({ from, to, rationale }) => ({ from, to, rationale })) };
			writeDocRelationRowInTxn(t, repoId, rel, next);
			return 'written' as const;
		});
		if (published === 'superseded') {
			log.info({ repo: repoPath }, 'doc-relations pass: a full index began; nothing more is published');
			return { summariesFailed: failed, stopped: false, startedAt, grouped: false };
		}
		log.debug({ repo: repoPath, file: rel, published, admitted: result.admitted.length, unresolved: result.unresolved, repeated: result.repeated }, 'doc-relations pass: document examined');
	}

	await withWriteTxn(t => writeDocRelationExtractionInTxn(t, repoId, { state: 'ok', examined, failed, computedAtGeneration: generation, updatedAt: now() }));
	log.info({ repo: repoPath, examined, failed, stopped, elapsedMs: Date.now() - startedAt }, 'doc-relations pass complete');
	return { summariesFailed: failed, stopped, startedAt };
}
