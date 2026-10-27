import type { ChangedSymbolSummary, DiffFragment } from '../../code-review/types.js';
import type { EvidenceNote, ReviewCall, ReviewMaterial, ReviewObligation } from '../types.js';
import type { ChunkSpec } from './code-review-chunk.js';

export const DIFF_PARENT_QUALITY = 'diff-file-quality:';
export interface DiffParentDescriptor {
	readonly key: string;
	readonly parentId: string;
	readonly file: string;
	readonly digest: string;
	readonly atomIds: readonly string[];
}

export function parentQualityObligations(rows: readonly ChangedSymbolSummary[]): ReviewObligation[] {
	const groups = new Map<string, ChangedSymbolSummary[]>();
	for (const row of rows) {
		const id = row.diffFragment?.parentId; if (id === undefined) continue;
		const group = groups.get(id); if (group === undefined) groups.set(id, [row]); else group.push(row);
	}
	return [...groups].map(([parent, parts]) => ({ key: DIFF_PARENT_QUALITY + parent, kind: 'check-item',
		text: `Judge correctness, complexity and error handling across ALL fragments of ${JSON.stringify(parts[0]!.file)}. These are portions of one file, not independent valid documents. Combine facts and assumptions from every fragment; local absence of a finding does not establish parent correctness. Parent digest ${parts[0]!.diffFragment!.parentDigest}; expected fragments ${parts.length}.`,
		atomIds: parts.map(p => p.entityId) }));
}

interface ParentIndex {
	readonly parents: readonly DiffParentDescriptor[];
	readonly fragments: ReadonlyMap<string, DiffFragment>;
}
const cache = new WeakMap<ReviewMaterial, ParentIndex>();
function index(material: ReviewMaterial): ParentIndex {
	const saved = cache.get(material); if (saved !== undefined) return saved;
	const fragments = new Map<string, DiffFragment>();
	for (const atom of material.atoms) { const row = JSON.parse(atom.text) as ChangedSymbolSummary; if (row.diffFragment !== undefined) fragments.set(atom.id, row.diffFragment); }
	const parents = material.obligations.filter(o => o.key.startsWith(DIFF_PARENT_QUALITY)).map(o => {
		const first = fragments.get(o.atomIds?.[0] ?? '');
		if (first === undefined) throw new Error(`Parent obligation has no fragment evidence: ${o.key}`);
		return { key: o.key, parentId: first.parentId, file: first.newFile, digest: first.parentDigest, atomIds: o.atomIds ?? [] };
	});
	const made = { parents, fragments }; cache.set(material, made); return made;
}

export function withDiffParents(spec: ChunkSpec, material: ReviewMaterial): ChunkSpec {
	if (spec.kind !== 'quality') return spec;
	const parents = index(material).parents;
	return parents.length === 0 ? spec : { ...spec, diffParents: parents };
}

export function parentNoteReasons(notes: readonly { key: string; atomIds: readonly string[] }[], call: ReviewCall, material: ReviewMaterial): string[] {
	const data = index(material), keys = new Map(data.parents.map(p => [p.parentId, p.key]));
	const expected = new Map(call.carries.atomIds.flatMap(id => { const f = data.fragments.get(id); return f === undefined ? [] : [[id, keys.get(f.parentId)] as const]; }));
	const counts = new Map<string, number>(); let invalid = 0;
	for (const note of notes) {
		const id = note.atomIds[0];
		if (note.atomIds.length !== 1 || id === undefined || !expected.has(id) || expected.get(id) !== note.key) { invalid++; continue; }
		counts.set(id, (counts.get(id) ?? 0) + 1);
	}
	const incomplete = [...expected.keys()].filter(id => counts.get(id) !== 1).length;
	return [...(invalid > 0 ? [`${invalid} parent notes have foreign, multiple or mismatched fragments`] : []), ...(incomplete > 0 ? [`${incomplete} carried fragments lack exactly one matching parent evidence note`] : [])];
}

/** The complete coverage ledger is validated before either reduction or judgment. */
export function validateParentEvidence(key: string, notes: readonly EvidenceNote[], material: ReviewMaterial, complete: boolean): void {
	if (!key.startsWith(DIFF_PARENT_QUALITY)) return;
	const parent = index(material).parents.find(p => p.key === key);
	if (parent === undefined) throw new Error(`Unknown diff parent obligation ${key}`);
	const allowed = new Set(parent.atomIds), seen = new Set<string>();
	for (const note of notes) {
		if (note.key !== key || note.atomIds.length === 0) throw new Error(`Invalid empty parent evidence for ${key}`);
		for (const id of note.atomIds) {
		if (!allowed.has(id) || seen.has(id) || note.key !== key) throw new Error(`Invalid or duplicate parent evidence for ${key}`);
		seen.add(id);
		}
	}
	if (complete && (seen.size !== allowed.size || seen.size === 0)) throw new Error(`Missing parent fragment evidence for ${key}`);
}

/** Render compact contiguous source ranges; complete atom IDs stay in the job's provenance ledger. */
export function compactParentNotes(key: string, notes: readonly EvidenceNote[], material: ReviewMaterial): unknown[] {
	validateParentEvidence(key, notes, material, false);
	const data = index(material);
	return notes.map(note => {
		const parts = note.atomIds.map(id => data.fragments.get(id)!).sort((a, b) => a.index - b.index);
		const ranges: { first: number; end: number; startOffset: number; endOffset: number }[] = [];
		for (const part of parts) {
			const previous = ranges.at(-1);
			if (previous?.end === part.index) { previous.end++; previous.endOffset = part.endOffset; }
			else ranges.push({ first: part.index, end: part.index + 1, startOffset: part.startOffset, endOffset: part.endOffset });
		}
		const first = parts[0];
		return { noteId: note.noteId, parentId: first?.parentId, file: first?.newFile, parentDigest: first?.parentDigest, ranges, note: note.text };
	});
}

export function parentFindingReasons(key: string, answer: unknown, material: ReviewMaterial): string[] {
	if (!key.startsWith(DIFF_PARENT_QUALITY)) return [];
	const parent = index(material).parents.find(p => p.key === key);
	const findings = (answer as { findings?: readonly { location?: string }[] }).findings ?? [];
	return findings.some(f => f.location?.replace(/:\d+(?::\d+)?$/, '') !== parent?.file)
		? ['Parent quality finding must identify the original parent file and source line'] : [];
}
