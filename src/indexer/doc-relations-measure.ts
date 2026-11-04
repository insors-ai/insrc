/**
 * The measurement of the mid-tier model's proposals against a repository's
 * hand-checked set (Epic c2ba6fa6 s10, ac2).
 *
 * The set (.insrc/doc-relations-checked.json) is exhaustive for each document
 * it lists: every real link of a listed document is in it. A link's identity
 * is canonical: (from = repository-relative document path, to =
 * repository-relative file path, or path#symbol), paths normalised and an
 * anchor on a document target dropped; a duplicate pair, or a pair labelled
 * both real and not real, is refused.
 *
 * The figures measure exactly the population readers admit. The set's real
 * links are split into extracted (the document already writes them) and
 * implied (all others). The model's proposals for the listed documents are
 * normalised to the same identity and, as the pass does, cleared of links the
 * document writes; then
 *
 *   precision = |admitted and real| / |admitted|   (an admitted pair absent from the set is wrong)
 *   recall    = |admitted and implied| / |implied|
 *
 * and the switch needs >= 100 implied links, precision >= 0.95, recall >= 0.60
 * (switchOf). extractedRecovery = |extracted links read| / |extracted links in
 * the set| is recorded for information and switches nothing.
 */

import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { getLogger } from '../shared/logger.js';
import { loadAnalyzeConfig } from '../config/analyze.js';
import { findEntitiesByFile, getEntity } from '../db/entities.js';
import { getGraphStore, withWriteTxn } from '../db/graph/store.js';
import { lookupRepoIdInTxn } from '../db/repos.js';
import {
	documentRelations,
	readDocRelationQualityInTxn,
	storedFilesInTxn,
	writeDocRelationExtractionInTxn,
	writeDocRelationQualityInTxn,
	type DocRelationQualityRow,
} from '../db/doc-relations.js';
import { canonicalPath, canonicalTarget, examineDocument } from './doc-relations-pass.js';

export { canonicalTarget };
import { classifyDocRelationsFailure, failureMessage, selectDocRelationsProvider, type DocRelationsSelection } from './doc-relations-provider.js';
import { DOC_RELATIONS_SET_FILE, docRelationsSetHash } from './doc-relations-read.js';

const log = getLogger('doc-relations-measure');

/** A hand-checked set the measurement refuses, with what it lacks. */
export class DocRelationsSetInvalid extends Error {
	constructor(message: string) {
		super(`DocRelationsSetInvalid: ${message}`);
		this.name = 'DocRelationsSetInvalid';
	}
}

/** One link of the set, in canonical identity. */
export interface CheckedLink { readonly from: string; readonly to: string; readonly real: boolean }

const DOC = /\.mdx?$/i;

/** Parse and check the set: shape, canonical identity, no duplicate or conflicting pair. */
export function parseCheckedSet(text: string): { readonly documents: readonly string[]; readonly links: readonly CheckedLink[] } {
	let json: unknown;
	try { json = JSON.parse(text); } catch (err) { throw new DocRelationsSetInvalid(`the set is not JSON (${(err as Error).message})`); }
	const links = (json as { links?: unknown } | null)?.links;
	if (!Array.isArray(links)) throw new DocRelationsSetInvalid('the set has no links array');
	const seen = new Map<string, boolean>();
	const out: CheckedLink[] = [];
	const documents = new Set<string>();
	for (const [i, l] of links.entries()) {
		const r = l as Record<string, unknown> | null;
		if (typeof r !== 'object' || r === null || typeof r['from'] !== 'string' || typeof r['to'] !== 'string' || typeof r['real'] !== 'boolean') {
			throw new DocRelationsSetInvalid(`link ${i} is not { from, to, real }`);
		}
		const from = canonicalPath(r['from']);
		const to = canonicalTarget(r['to']);
		if (from === undefined || !DOC.test(from)) throw new DocRelationsSetInvalid(`link ${i}: '${r['from']}' is not a repository-relative markdown document`);
		if (to === undefined) throw new DocRelationsSetInvalid(`link ${i}: '${r['to']}' is not a repository-relative path`);
		const key = `${from}\0${to}`;
		const before = seen.get(key);
		if (before !== undefined) {
			throw new DocRelationsSetInvalid(before === r['real']
				? `the link ${from} -> ${to} appears twice`
				: `the link ${from} -> ${to} is labelled both real and not real`);
		}
		seen.set(key, r['real']);
		documents.add(from);
		out.push({ from, to, real: r['real'] });
	}
	return { documents: [...documents].sort(), links: out };
}

/** The figures from the normalised pairs: what the measurement records. */
export function computeDocRelationFigures(args: {
	/** The model's proposals for the listed documents, normalised, before the written-link clearing. */
	readonly proposed: ReadonlySet<string>;
	/** The links the listed documents write (read from the text), normalised. */
	readonly written:  ReadonlySet<string>;
	/** The set's real links, normalised. */
	readonly real:     ReadonlySet<string>;
}): { checked: number; proposed: number; right: number; found: number; precision: number; recall: number; extractedRecovery: number } {
	const admitted = [...args.proposed].filter(p => !args.written.has(p));
	const implied = [...args.real].filter(l => !args.written.has(l));
	const extractedReal = [...args.real].filter(l => args.written.has(l));
	const right = admitted.filter(p => args.real.has(p)).length;
	const impliedSet = new Set(implied);
	const found = admitted.filter(p => impliedSet.has(p)).length;
	return {
		checked:           implied.length,
		proposed:          admitted.length,
		right,
		found,
		precision:         admitted.length === 0 ? 0 : right / admitted.length,
		recall:            implied.length === 0 ? 0 : found / implied.length,
		extractedRecovery: extractedReal.length === 0 ? 1 : extractedReal.filter(l => args.written.has(l)).length / extractedReal.length,
	};
}

const pair = (from: string, to: string): string => `${from}\0${to}`;

/** The links a stored document writes, normalised to the set's identity. */
async function writtenLinksOf(repoPath: string, relDoc: string): Promise<Set<string>> {
	const out = new Set<string>();
	for (const src of await findEntitiesByFile(null, join(repoPath, relDoc))) {
		if (src.kind !== 'section' && src.kind !== 'document' && src.kind !== 'file') continue;
		for (const r of (await documentRelations(src.id, 'out', { state: 'not-measured' })).rows) {
			const target = await getEntity(null, r.to);
			if (target === null) continue;
			const rel = relative(repoPath, target.file);
			out.add(pair(relDoc, target.kind === 'file' ? rel : `${rel}#${target.name}`));
		}
	}
	return out;
}

/**
 * Validate the repository's set before a measurement is queued: its shape and
 * identity, and at least 100 distinct implied real links (real links the
 * listed documents do not already write). Returns the set's hash and count.
 */
export async function checkDocRelationsSet(repoPath: string): Promise<{ readonly setHash: string; readonly checked: number }> {
	let text: string;
	try { text = readFileSync(join(repoPath, DOC_RELATIONS_SET_FILE), 'utf8'); } catch { throw new DocRelationsSetInvalid(`${DOC_RELATIONS_SET_FILE} does not exist`); }
	const set = parseCheckedSet(text);
	const written = new Set<string>();
	for (const doc of set.documents) for (const w of await writtenLinksOf(repoPath, doc)) written.add(w);
	const implied = set.links.filter(l => l.real && !written.has(pair(l.from, l.to))).length;
	if (implied < 100) throw new DocRelationsSetInvalid(`the set holds ${implied} distinct implied real links; at least 100 are needed`);
	return { setHash: docRelationsSetHash(repoPath)!, checked: implied };
}

export interface DocRelationsMeasureDeps {
	readonly repoPath:    string;
	/** The set's hash when the request validated it: a set changed since is not measured. */
	readonly setHash:     string;
	readonly shouldStop?: (() => boolean) | undefined;
	/** The provider selection (a seam): the mid tier's CLI provider by default. */
	readonly select?:     ((repoPath: string) => DocRelationsSelection) | undefined;
}

/**
 * Measure: run the model over every listed document, one at a time, and record
 * the figures. A provider failure writes no new figures (existing ones are
 * kept) and records the extraction as unavailable with its cause, creating the
 * quality row if it does not exist.
 */
export async function runDocRelationsMeasurement(deps: DocRelationsMeasureDeps): Promise<DocRelationQualityRow['figures'] | undefined> {
	const { repoPath } = deps;
	const s = await getGraphStore();
	const repoId = lookupRepoIdInTxn(s, repoPath);
	if (repoId === undefined) return undefined;
	const now = (): string => new Date().toISOString();
	const failure = async (reason: string): Promise<undefined> => {
		await withWriteTxn(t => writeDocRelationExtractionInTxn(t, repoId, { ...(readDocRelationQualityInTxn(t, repoId)?.extraction ?? { examined: 0, failed: 0 }), state: 'unavailable', reason, updatedAt: now() }));
		log.info({ repo: repoPath, reason }, 'doc-relations measurement: not recorded');
		return undefined;
	};
	if (docRelationsSetHash(repoPath) !== deps.setHash) return failure('the hand-checked set changed after the measurement was requested');
	let set: ReturnType<typeof parseCheckedSet>;
	try { set = parseCheckedSet(readFileSync(join(repoPath, DOC_RELATIONS_SET_FILE), 'utf8')); } catch (err) { return failure(failureMessage(err)); }

	const selection = (deps.select ?? (r => selectDocRelationsProvider(loadAnalyzeConfig(), r)))(repoPath);
	if (!selection.ok) return failure(selection.reason);
	const files = storedFilesInTxn(s, repoId);
	const proposed = new Set<string>();
	const written = new Set<string>();
	for (const doc of set.documents) {
		if (deps.shouldStop?.() === true) return undefined;
		for (const w of await writtenLinksOf(repoPath, doc)) written.add(w);
		let text: string;
		try { text = readFileSync(join(repoPath, doc), 'utf8'); } catch { continue; }
		const sources = (await findEntitiesByFile(null, join(repoPath, doc))).filter(e => e.kind === 'section' || e.kind === 'document' || e.kind === 'file');
		try {
			const r = await examineDocument({ provider: selection.provider, repoPath, relFile: doc, text, sources, files });
			for (const p of r.admitted) proposed.add(pair(doc, p.target));
		} catch (err) {
			if (classifyDocRelationsFailure(err) === 'provider') return failure(failureMessage(err));
			log.warn({ repo: repoPath, file: doc, err: failureMessage(err) }, 'doc-relations measurement: the value is not a set of proposals; counted as no proposals');
		}
	}
	const real = new Set(set.links.filter(l => l.real).map(l => pair(l.from, l.to)));
	const figures = { ...computeDocRelationFigures({ proposed, written, real }), modelId: selection.modelId, setHash: deps.setHash, measuredAt: now() };
	await withWriteTxn(t => {
		const prev = readDocRelationQualityInTxn(t, repoId);
		writeDocRelationQualityInTxn(t, repoId, { figures, extraction: prev?.extraction ?? { state: 'ok', examined: 0, failed: 0, updatedAt: now() } });
	});
	log.info({ repo: repoPath, ...figures }, 'doc-relations measurement recorded');
	return figures;
}
