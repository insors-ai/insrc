/**
 * code_class_locate -- typed class lookup over the LMDB graph
 * (code-analyzer-skills.md Phase 0.1).
 *
 * The structural fix the 2026-04-30 hallucinated-class incident
 * demanded: when a class can't be resolved, return
 * `{ found: false, nearest }` with the closest candidates instead of
 * a markdown error blob. Cross-owner callers (notably the
 * data-analyzer-side `data.code.class.extract-fields` wrapper
 * shipping in data-analyzer-skills §3.1) see the typed discriminator
 * and can pivot cleanly -- no more hallucinated 28-row field tables.
 *
 * Class-like kinds (`class` / `interface` / `type`) cover every
 * indexer's class-shaped emission:
 *   - Java parser stamps records / enums / annotation-interfaces
 *     all under `kind: 'class'` (java.ts:240-244)
 *   - Scala parser puts case-class / object / trait under
 *     `class` or `interface`
 *   - Python `class_definition` -> `class`
 *   - TypeScript `class_declaration` / `interface_declaration` ->
 *     `class` / `interface`
 *   - Go `struct_type` -> `class`, `interface_type` -> `interface`
 *
 * Tool id: `code_class_locate`. The first underscore-segment is
 * `code`, which is already in `ALL_CATEGORIES` (tools/config.ts:88)
 * so the registry's category gate doesn't blackhole it.
 */

import { getLogger } from '../../../../shared/logger.js';
import { registerTool } from '../../registry.js';
import type { Tool, ToolDeps, ToolInput, ToolResult } from '../../types.js';
import { findEntitiesByName } from '../../../../db/entities.js';
import { getGraphStore, type GraphStore } from '../../../../db/graph/store.js';
import {
	encodeNameIndexPrefix,
	prefixSuccessor,
	ENTITY_KIND_BYTE,
	encodeRepoKey,
} from '../../../../db/graph/keys.js';
import { lookupRepoIdInTxn } from '../../../../db/repos.js';
import type { Entity, EntityKind, Language } from '../../../../shared/types.js';

const log = getLogger('code-class-locate');

const CLASS_LIKE_KINDS: readonly EntityKind[] = ['class', 'interface', 'type'];

const VALID_LANGUAGES = new Set<Language>([
	'typescript', 'javascript', 'python', 'go', 'java', 'scala',
] as Language[]);

const NEAREST_LIMIT      = 3;
const NEAREST_SCAN_BUDGET = 5000; // class-name candidates inspected per request before giving up

// ---------------------------------------------------------------------------
// Tool definition
// ---------------------------------------------------------------------------

const codeClassLocateTool: Tool = {
	id: 'code_class_locate',
	description:
		'Look up a class / interface / record / trait / object by name in the LMDB code graph. ' +
		'Returns `{ found: true, entityId, path, line, language, kind, isAbstract? }` on hit, ' +
		'or `{ found: false, nearest: [{ className, score, entityId }] }` on miss. The typed ' +
		'`found: false` discriminator lets cross-owner callers refuse cleanly when a class ' +
		'doesn\'t resolve, instead of fabricating an answer (the 2026-04-30 hallucinated-class ' +
		'lesson). Read-only; no approval gate.',
	inputSchema: {
		type: 'object',
		properties: {
			className: {
				type: 'string',
				description: 'Class name as referenced in source. Unqualified preferred ("Foo"); ' +
					'package-qualified ("com.example.Foo") is treated as-is for now and may miss ' +
					'-- v1 doesn\'t parse package paths.',
				minLength: 1,
				maxLength: 256,
			},
			repoPath: {
				type: 'string',
				description: 'Optional repo root absolute path. Mutually exclusive with `repos`. When ' +
					'both are omitted, every registered repo is probed.',
			},
			repos: {
				type: 'array',
				items: { type: 'string' },
				description: 'Plan SCS Phase 3 multi-repo filter (typically the active session\'s ' +
					'dependency closure). Mutually exclusive with `repoPath`. When both are ' +
					'omitted, every registered repo is probed.',
				uniqueItems: true,
				minItems: 1,
			},
			language: {
				type: 'string',
				description: 'Optional language filter. When the same class name exists in multiple ' +
					'languages (rare; possible with vendored JVM + Scala), narrow with this.',
				enum: ['typescript', 'javascript', 'python', 'go', 'java', 'scala'],
			},
		},
		required: ['className'],
		additionalProperties: false,
	},
	requiresApproval: false,

	async execute(input: ToolInput, _deps: ToolDeps): Promise<ToolResult> {
		const className = typeof input['className'] === 'string' ? input['className'] : '';
		if (className.length === 0) {
			return fail('className is required');
		}
		const repoPath = typeof input['repoPath'] === 'string' && input['repoPath'].length > 0
			? input['repoPath'] : undefined;
		const repos = Array.isArray(input['repos']) && input['repos'].every(x => typeof x === 'string')
			? input['repos'] as readonly string[]
			: undefined;
		if (repoPath !== undefined && repos !== undefined) {
			return fail('pass either `repoPath` (single) or `repos` (multi), not both');
		}
		const language = typeof input['language'] === 'string'
			&& VALID_LANGUAGES.has(input['language'] as Language)
			? input['language'] as Language : undefined;

		// Step 1: exact name match across class-like kinds.
		const matches = await findEntitiesByName(null, [className], {
			kinds: CLASS_LIKE_KINDS,
			...(repoPath !== undefined ? { repo: repoPath } : {}),
			...(repos    !== undefined ? { repos } : {}),
			limit: 10,
		});
		const filtered = language !== undefined
			? matches.filter(m => m.language === language)
			: matches;

		if (filtered.length > 0) {
			const e = filtered[0]!;
			return ok(buildFoundPayload(e));
		}

		// Step 2: not found -> nearest candidates by edit distance.
		const nearest = await findNearestClasses(className, {
			...(repoPath !== undefined ? { repoPath } : {}),
			...(repos    !== undefined ? { repos } : {}),
			...(language !== undefined ? { language } : {}),
			limit: NEAREST_LIMIT,
		});

		log.info(
			{ className, repoPath, language, nearestCount: nearest.length },
			'code_class_locate: not found',
		);

		return ok({ found: false, nearest });
	},
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface FoundPayload {
	readonly found:    true;
	readonly entityId: string;
	readonly path:     string;
	readonly line:     number;
	readonly language: Language;
	readonly kind:     EntityKind;
	readonly isAbstract?: boolean;
}

function buildFoundPayload(e: Entity): FoundPayload {
	const payload: FoundPayload = {
		found:    true,
		entityId: e.id,
		path:     e.file,
		line:     e.startLine,
		language: e.language,
		kind:     e.kind,
	};
	return e.isAbstract === true ? { ...payload, isAbstract: true } : payload;
}

interface NearestCandidate {
	readonly className: string;
	readonly score:     number;     // 0..1 (1 = identical, 0 = unrelated)
	readonly entityId:  string;
}

interface NearestOpts {
	readonly repoPath?: string | undefined;
	/** Plan SCS Phase 3 multi-repo filter; mutually exclusive with `repoPath`. */
	readonly repos?:    readonly string[] | undefined;
	readonly language?: Language | undefined;
	readonly limit:     number;
}

/**
 * Walk the `name_index` for class-like kinds within the requested
 * repo (or every registered workspace repo when omitted), score each
 * name against the input via case-insensitive Levenshtein +
 * prefix-overlap bonus, return the top-N. Bounded by
 * `NEAREST_SCAN_BUDGET` candidates so a vendored monorepo doesn't
 * burn seconds on the typo-suggestion path.
 *
 * Levenshtein here is a heuristic, not a similarity oracle. The
 * intent is: catch obvious typos ("INPurchaseOrders" vs the
 * existing "INPurchaseOrder"), case mistakes ("inpurchaseorder" vs
 * "INPurchaseOrder"), and split-name mismatches ("PurchaseOrder"
 * vs "INPurchaseOrder"). Semantic similarity ("the order entity")
 * is out of scope for v1 -- callers wanting that bypass `found:
 * false` and run a vector search separately.
 */
async function findNearestClasses(
	target: string,
	opts: NearestOpts,
): Promise<NearestCandidate[]> {
	const s = await getGraphStore();

	// Resolve the repoId set we'll probe. `repos` (multi) > `repoPath`
	// (single) > unscoped (every registered workspace repo). Mirrors
	// findEntitiesByName's precedence (db/entities.ts Phase 6).
	const repoIds: number[] = [];
	if (opts.repos !== undefined) {
		if (opts.repos.length === 0) return [];
		for (const p of opts.repos) {
			const id = lookupRepoIdInTxn(s, p);
			if (id !== undefined) repoIds.push(id);
		}
		if (repoIds.length === 0) return [];
	} else if (opts.repoPath !== undefined) {
		const id = lookupRepoIdInTxn(s, opts.repoPath);
		if (id === undefined) return [];
		repoIds.push(id);
	} else {
		for (const { key } of s.repo.getRange()) {
			const id = (key as Buffer).readUInt32BE(0);
			// Skip the four reserved shared-modules registry rows;
			// they contain no class entities.
			if (id < 0xFFFFFFFB) repoIds.push(id);
		}
	}

	const lcTarget = target.toLowerCase();
	const heap: { score: number; cand: NearestCandidate }[] = [];
	let scanned = 0;

	for (const repoId of repoIds) {
		for (const k of CLASS_LIKE_KINDS) {
			const kindByte = ENTITY_KIND_BYTE[k];
			if (kindByte === undefined) continue;

			const prefix = encodeNameIndexPrefix(repoId, kindByte);
			const succ   = prefixSuccessor(prefix);
			const headerLen = encodeRepoKey(repoId).length + 1; // 4 bytes repo + 1 byte kind

			for (const { key, value } of s.nameIndex.getRange({ start: prefix, end: succ })) {
				if (++scanned > NEAREST_SCAN_BUDGET) break;
				const buf = key as Buffer;
				const name = buf.subarray(headerLen).toString('utf8');
				if (name.length === 0) continue;

				// Language filter: skip in v1 -- the language filter
				// only affects the EXACT match path
				// (findEntitiesByName handles it there). Hydrating
				// every nearest candidate's entity row to check
				// language would dominate the typo-suggestion latency.
				void opts.language;

				const score = similarityScore(lcTarget, name.toLowerCase());
				if (score <= 0) continue;

				const u64Big   = (value as Buffer).readBigUInt64BE(0);
				const stringId = lookupStringId(s, u64Big);
				if (stringId === undefined) continue;

				heap.push({
					score,
					cand: { className: name, score, entityId: stringId },
				});
			}
			if (scanned > NEAREST_SCAN_BUDGET) break;
		}
		if (scanned > NEAREST_SCAN_BUDGET) break;
	}

	// Sort desc by score, take top-N, dedupe by name (a class with
	// the same name in two repos appears twice; keep the higher
	// scorer or the first-seen).
	heap.sort((a, b) => b.score - a.score);
	const seen = new Set<string>();
	const out: NearestCandidate[] = [];
	for (const item of heap) {
		if (seen.has(item.cand.className)) continue;
		seen.add(item.cand.className);
		out.push(item.cand);
		if (out.length >= opts.limit) break;
	}
	return out;
}

/** Read the u64 -> stringId reverse index. */
function lookupStringId(s: GraphStore, u64: bigint): string | undefined {
	const key = Buffer.alloc(8);
	key.writeBigUInt64BE(u64, 0);
	const v = s.entityStringByU64.get(key);
	return typeof v === 'string' ? v : undefined;
}

/**
 * Case-insensitive similarity score in [0, 1]. Identity = 1.
 * Built from edit distance with a prefix-overlap bonus so
 * `INPurchaseOrders` ranks above `OtherPurchaseOrder` when the
 * target is `INPurchaseOrder`.
 *
 * Returns 0 when the candidate is unhelpfully far (edit distance
 * exceeds 60% of the longer string); the caller drops these
 * before the heap insert to keep memory bounded.
 */
function similarityScore(target: string, candidate: string): number {
	if (target === candidate) return 1;
	const maxLen = Math.max(target.length, candidate.length);
	if (maxLen === 0) return 0;
	const dist = levenshtein(target, candidate);
	if (dist > maxLen * 0.6) return 0;

	const editScore = 1 - (dist / maxLen);   // 0..1
	const prefixLen = commonPrefixLen(target, candidate);
	const prefixBoost = (prefixLen / maxLen) * 0.2;
	const score = editScore * 0.8 + prefixBoost;
	return Math.min(1, Math.max(0, score));
}

function commonPrefixLen(a: string, b: string): number {
	const n = Math.min(a.length, b.length);
	let i = 0;
	while (i < n && a.charCodeAt(i) === b.charCodeAt(i)) i++;
	return i;
}

/**
 * Standard Wagner-Fischer Levenshtein. O(n*m) time, O(min(n,m))
 * space. Caller already capped `name.length` via name_index
 * inputs so the worst case stays bounded.
 */
function levenshtein(a: string, b: string): number {
	if (a === b) return 0;
	if (a.length === 0) return b.length;
	if (b.length === 0) return a.length;

	const m = a.length;
	const n = b.length;
	const v0 = new Array<number>(n + 1);
	const v1 = new Array<number>(n + 1);
	for (let i = 0; i <= n; i++) v0[i] = i;
	for (let i = 0; i < m; i++) {
		v1[0] = i + 1;
		for (let j = 0; j < n; j++) {
			const cost = a.charCodeAt(i) === b.charCodeAt(j) ? 0 : 1;
			v1[j + 1] = Math.min(
				v1[j]! + 1,        // insertion
				v0[j + 1]! + 1,    // deletion
				v0[j]! + cost,     // substitution
			);
		}
		for (let i2 = 0; i2 <= n; i2++) v0[i2] = v1[i2]!;
	}
	return v0[n]!;
}

// ---------------------------------------------------------------------------
// Result helpers
// ---------------------------------------------------------------------------

function ok(data: unknown): ToolResult {
	return {
		output: '```json\n' + safeJson(data) + '\n```',
		format: 'markdown',
		success: true,
		data,
	};
}

function fail(msg: string): ToolResult {
	return {
		output: `[code_class_locate] ${msg}`,
		format: 'text',
		success: false,
		error: msg,
	};
}

function safeJson(v: unknown): string {
	try {
		const j = JSON.stringify(v, null, 2);
		return j.length <= 4096 ? j : j.slice(0, 4096) + '\n... <truncated>';
	} catch {
		return '<unserializable>';
	}
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerCodeClassLocateTool(): void {
	registerTool(codeClassLocateTool);
}

// ---------------------------------------------------------------------------
// Test exports (pure helpers; no side-effects)
// ---------------------------------------------------------------------------

export const _similarityScoreForTest = similarityScore;
export const _levenshteinForTest     = levenshtein;
export const _commonPrefixLenForTest = commonPrefixLen;
export const _codeClassLocateToolForTest = codeClassLocateTool;
