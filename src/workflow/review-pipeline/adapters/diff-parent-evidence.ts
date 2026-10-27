import type { ChangedSymbolSummary, DiffFragment } from '../../code-review/types.js';
import type { EvidenceNote, ReviewCall, ReviewMaterial, ReviewObligation, StageAnswer } from '../types.js';
import type { ChunkSpec } from './code-review-chunk.js';

export const DIFF_PARENT_QUALITY = 'diff-file-quality:';
export const DIFF_DUPLICATION = 'diff-duplication';
export const isDiffEvidenceKey = (key: string): boolean => key === DIFF_DUPLICATION || key.startsWith(DIFF_PARENT_QUALITY);
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
	const parents: ReviewObligation[] = [...groups].map(([parent, parts]) => ({ key: DIFF_PARENT_QUALITY + parent, kind: 'check-item',
		text: `Judge correctness, complexity, within-file duplication and error handling across ALL fragments of ${JSON.stringify(parts[0]!.file)}. These are portions of one file, not independent valid documents. Combine facts and assumptions from every fragment; local absence of a finding does not establish parent correctness. Parent digest ${parts[0]!.diffFragment!.parentDigest}; expected fragments ${parts.length}.`,
		atomIds: parts.map(p => p.entityId) }));
	return parents.length === 0 ? [] : [...parents, { key: DIFF_DUPLICATION, kind: 'check-item', text: 'Judge duplicated logic ACROSS different parent files, or between a fragmented parent and nonfragment changed evidence. Combine all duplication facts and descriptions. At least one side must belong to a fragmented parent. Within-parent duplication is judged by its parent obligation; nonfragment-only pairs retain symbol checks. Cite counterpartRef as the original other file or file:line, never a fragment ID.', atomIds: rows.map(r => r.entityId) }];
}

interface ParentIndex {
	readonly parents: readonly DiffParentDescriptor[];
	readonly fragments: ReadonlyMap<string, DiffFragment>;
	readonly rows: ReadonlyMap<string, ChangedSymbolSummary>;
}
const cache = new WeakMap<ReviewMaterial, ParentIndex>();
function index(material: ReviewMaterial): ParentIndex {
	const saved = cache.get(material); if (saved !== undefined) return saved;
	const fragments = new Map<string, DiffFragment>();
	const rows = new Map<string, ChangedSymbolSummary>();
	for (const atom of material.atoms) { const row = JSON.parse(atom.text) as ChangedSymbolSummary; rows.set(atom.id, row); if (row.diffFragment !== undefined) fragments.set(atom.id, row.diffFragment); }
	const parents = material.obligations.filter(o => o.key.startsWith(DIFF_PARENT_QUALITY)).map(o => {
		const first = fragments.get(o.atomIds?.[0] ?? '');
		if (first === undefined) throw new Error(`Parent obligation has no fragment evidence: ${o.key}`);
		return { key: o.key, parentId: first.parentId, file: first.newFile, digest: first.parentDigest, atomIds: o.atomIds ?? [] };
	});
	const made = { parents, fragments, rows }; cache.set(material, made); return made;
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
	if (!isDiffEvidenceKey(key)) return;
	const parent = key === DIFF_DUPLICATION ? material.obligations.find(o => o.key === key) : index(material).parents.find(p => p.key === key);
	if (parent === undefined) throw new Error(`Unknown diff parent obligation ${key}`);
	const allowed = new Set(parent.atomIds ?? []), seen = new Set<string>();
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
		const owners = new Map<string, { parentId?: string; file: string; parentDigest?: string; ranges?: { first: number; end: number; startOffset: number; endOffset: number }[]; symbolId?: string; label?: string }>();
		const ids = note.atomIds.slice().sort((a, b) => (data.fragments.get(a)?.index ?? 0) - (data.fragments.get(b)?.index ?? 0));
		for (const id of ids) {
			const part = data.fragments.get(id), row = data.rows.get(id)!;
			if (part === undefined) { owners.set(JSON.stringify(['symbol', id]), { file: row.file, symbolId: id, label: row.name }); continue; }
			const ownerKey = JSON.stringify(['parent', part.parentId]);
			let owner = owners.get(ownerKey);
			if (owner === undefined) { owner = { parentId: part.parentId, file: part.newFile, parentDigest: part.parentDigest, ranges: [] }; owners.set(ownerKey, owner); }
			const previous = owner.ranges!.at(-1);
			if (previous?.end === part.index) { previous.end++; previous.endOffset = part.endOffset; }
			else owner.ranges!.push({ first: part.index, end: part.index + 1, startOffset: part.startOffset, endOffset: part.endOffset });
		}
		return { noteId: note.noteId, provenance: [...owners.values()], note: note.text };
	});
}

export function parentFindingReasons(key: string, answer: unknown, material: ReviewMaterial): string[] {
	if (!isDiffEvidenceKey(key)) return [];
	const data = index(material), parent = data.parents.find(p => p.key === key);
	const files = key === DIFF_DUPLICATION ? [...new Set([...data.rows.values()].map(r => r.file))] : parent !== undefined ? [parent.file] : [];
	const fileOf = (value: string | undefined): string | undefined => files.find(file => value === file || (value?.startsWith(file + ':') && /^:[1-9]\d*(?::[1-9]\d*)?$/.test(value.slice(file.length))));
	const fragmentedFiles = new Set(data.parents.map(p => p.file));
	const findings = (answer as { findings?: readonly { location?: string; counterpartRef?: string }[] }).findings ?? [];
	const bad = findings.some(f => {
		const located = fileOf(f.location), counterpart = fileOf(f.counterpartRef);
		return located === undefined || f.location === located || (key === DIFF_DUPLICATION
			? counterpart === undefined || counterpart === located || (!fragmentedFiles.has(located) && !fragmentedFiles.has(counterpart)) : f.counterpartRef !== undefined && counterpart === undefined);
	});
	return bad ? ['Diff findings must use original source file:line and valid original counterpart references in the reviewed scope'] : [];
}

/** Reuse each validated parent note once globally; ordinary rows contribute their validated descriptions. */
export function diffQualityNotes(answer: StageAnswer, material: ReviewMaterial, local: readonly { key: string; text: string; atomIds: readonly string[] }[]): readonly { key: string; text: string; atomIds: readonly string[] }[] {
	if (!material.obligations.some(o => o.key === DIFF_DUPLICATION)) return local;
	const data = index(material);
	const descriptions = (answer.answer as { descriptions?: readonly { atomId: string; description: string }[] }).descriptions ?? [];
	return [...local,
		...local.filter(n => n.key.startsWith(DIFF_PARENT_QUALITY)).map(n => ({ ...n, key: DIFF_DUPLICATION })),
		...descriptions.filter(d => !data.fragments.has(d.atomId)).map(d => ({ key: DIFF_DUPLICATION, atomIds: [d.atomId], text: `Duplication-relevant behavior of ${data.rows.get(d.atomId)?.file}: ${d.description}` })),
	];
}
