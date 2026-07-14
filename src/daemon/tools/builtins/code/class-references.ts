/**
 * code_class_references -- typed in-edge walk for a class entity
 * (code-analyzer-skills.md Phase 0.3).
 *
 * Returns who-references-this-class data assembled from the
 * `in_edge` sub-DB:
 *   - INHERITS / IMPLEMENTS: subclass / impl pointing at this class
 *   - CALLS: a function that calls a method on this class (the
 *     parser emits CALLS to the class entity when the method
 *     resolution lands on it)
 *   - REFERENCES: catch-all for everything else (type refs in
 *     signatures, decorator targets, ORM model refs, etc.)
 *
 * Caps at 200 references; sets `truncated: true` on overflow so
 * cross-owner callers (notably `code.class.locate-references` in
 * Phase 3.2 and the data-analyzer §3.2 wrapper) can render a
 * "showing first 200" hint instead of silently dropping rows.
 *
 * Tool id: `code_class_references`. The `code` underscore-segment
 * is already in `ALL_CATEGORIES` (tools/config.ts:88) -- no gate
 * surprise.
 */

import { getLogger } from '../../../../shared/logger.js';
import { registerTool } from '../../registry.js';
import type { Tool, ToolDeps, ToolInput, ToolResult } from '../../types.js';
import {
	getEntity,
	getEntitiesByIds,
	entityU64ForId,
	entityIdsByU64s,
} from '../../../../db/entities.js';
import { getGraphStore } from '../../../../db/graph/store.js';
import { encodeInEdgePrefix, prefixSuccessor, RELATION_KIND_BYTE } from '../../../../db/graph/keys.js';
import type { Entity, EntityKind } from '../../../../shared/types.js';

const log = getLogger('code-class-references');

const CLASS_LIKE_KINDS: ReadonlySet<EntityKind> = new Set(['class', 'interface', 'type']);

type RefKind = 'CALLS' | 'INHERITS' | 'IMPLEMENTS' | 'REFERENCES';

const REF_KINDS: readonly RefKind[] = ['CALLS', 'INHERITS', 'IMPLEMENTS', 'REFERENCES'];
const REF_KIND_SET: ReadonlySet<RefKind> = new Set(REF_KINDS);

const REF_LIMIT       = 200;
const SNIPPET_MAX_LEN = 200;

// ---------------------------------------------------------------------------
// Tool definition
// ---------------------------------------------------------------------------

interface ReferenceEntry {
	readonly kind:         RefKind;
	readonly fromEntityId: string;
	readonly fromPath:     string;
	readonly fromLine:     number;
	readonly snippet?:     string;
}

interface ReferencesOutput {
	readonly entityId:   string;
	readonly className:  string;
	readonly references: readonly ReferenceEntry[];
	readonly truncated:  boolean;
	readonly counts:     Readonly<Record<RefKind, number>>;
}

const codeClassReferencesTool: Tool = {
	id: 'code_class_references',
	description:
		'Walk the in-edges of a class entity to surface who references it. Input: ' +
		'`{ entityId, kinds? }` (kinds defaults to all of CALLS / INHERITS / IMPLEMENTS / ' +
		'REFERENCES). Output: `{ className, references: [{ kind, fromEntityId, fromPath, ' +
		'fromLine, snippet? }], truncated, counts }`. Caps at 200 references; `truncated: true` ' +
		'on overflow. Read-only; no approval gate.',
	inputSchema: {
		type: 'object',
		properties: {
			entityId: {
				type: 'string',
				description: 'Class entity id (32-char hex from `code_class_locate`).',
				minLength: 32,
				maxLength: 32,
			},
			kinds: {
				type: 'array',
				description: 'Subset of relation kinds to walk. Default: all four.',
				items: { type: 'string', enum: REF_KINDS as readonly string[] },
				uniqueItems: true,
				minItems: 1,
			},
		},
		required: ['entityId'],
		additionalProperties: false,
	},
	requiresApproval: false,

	async execute(input: ToolInput, _deps: ToolDeps): Promise<ToolResult> {
		const entityId = typeof input['entityId'] === 'string' ? input['entityId'] : '';
		if (entityId.length === 0) return fail('entityId is required');

		const kinds = parseKinds(input['kinds']);
		if (kinds === null) {
			return fail('kinds must be a non-empty subset of CALLS / INHERITS / IMPLEMENTS / REFERENCES');
		}

		const classEntity = await getEntity(null, entityId);
		if (classEntity === null) return fail(`entity not found: ${entityId}`);
		if (!CLASS_LIKE_KINDS.has(classEntity.kind)) {
			return fail(
				`entity ${entityId} is kind '${classEntity.kind}', not class-like ` +
				`(class / interface / type). Resolve a class entity via code_class_locate first.`,
			);
		}

		const u64 = await entityU64ForId(entityId);
		if (u64 === undefined) {
			// Defensive: entity row exists but reverse u64 lookup missed.
			// Treat as "no references" rather than throwing -- callers see
			// success with empty refs.
			log.warn({ entityId }, 'entityU64ForId miss for known entity');
			return ok(emptyOutput(entityId, classEntity.name));
		}

		const { entries: rawEntries, truncated } = await collectInEdges(u64, kinds);
		const fromIds = await reverseLookupIds(rawEntries.map(r => r.fromU64));

		// Hydrate from-entity rows in one pass; build the reference array
		// in original edge-walk order so callers see a stable shape.
		const fromEntities = await getEntitiesByIds(null, [...new Set(fromIds.values())]);
		const byId = new Map<string, Entity>(fromEntities.map(e => [e.id, e]));

		const refs: ReferenceEntry[] = [];
		const counts: Record<RefKind, number> = {
			CALLS: 0, INHERITS: 0, IMPLEMENTS: 0, REFERENCES: 0,
		};
		for (const r of rawEntries) {
			const sid = fromIds.get(r.fromU64);
			if (sid === undefined) continue; // dropped by reverse lookup (rare)
			const ent = byId.get(sid);
			if (ent === undefined) continue;

			counts[r.kind]++;
			const ref: ReferenceEntry = {
				kind:         r.kind,
				fromEntityId: sid,
				fromPath:     ent.file,
				fromLine:     ent.startLine,
			};
			const snippet = buildSnippet(ent.body);
			refs.push(snippet === undefined ? ref : { ...ref, snippet });
		}

		const out: ReferencesOutput = {
			entityId,
			className: classEntity.name,
			references: refs,
			truncated,
			counts,
		};

		log.info(
			{ entityId, className: classEntity.name, total: refs.length, truncated, counts },
			'code_class_references',
		);
		return ok(out);
	},
};

// ---------------------------------------------------------------------------
// In-edge collection
// ---------------------------------------------------------------------------

interface RawRef {
	readonly kind:    RefKind;
	readonly fromU64: bigint;
}

async function collectInEdges(
	toU64: bigint,
	kinds: ReadonlySet<RefKind>,
): Promise<{ entries: RawRef[]; truncated: boolean }> {
	const store    = await getGraphStore();
	const prefix   = encodeInEdgePrefix(toU64);
	const succ     = prefixSuccessor(prefix);
	const allowed  = new Set<number>();
	for (const k of kinds) {
		const byte = RELATION_KIND_BYTE[k];
		if (byte !== undefined) allowed.add(byte);
	}

	const entries: RawRef[] = [];
	let truncated = false;

	// in_edge key layout: [toU64 (8) | kindByte (1) | fromU64 (8)]
	for (const { key } of store.inEdge.getRange({ start: prefix, end: succ })) {
		const buf       = key as Buffer;
		const kindByte  = buf.readUInt8(8);
		if (!allowed.has(kindByte)) continue;
		const refKind   = byteToRefKind(kindByte);
		if (refKind === null) continue;
		const fromU64   = buf.readBigUInt64BE(9);

		if (entries.length >= REF_LIMIT) {
			truncated = true;
			break;
		}
		entries.push({ kind: refKind, fromU64 });
	}
	return { entries, truncated };
}

function byteToRefKind(b: number): RefKind | null {
	if (b === RELATION_KIND_BYTE.CALLS)       return 'CALLS';
	if (b === RELATION_KIND_BYTE.INHERITS)    return 'INHERITS';
	if (b === RELATION_KIND_BYTE.IMPLEMENTS)  return 'IMPLEMENTS';
	if (b === RELATION_KIND_BYTE.REFERENCES)  return 'REFERENCES';
	return null;
}

async function reverseLookupIds(u64s: readonly bigint[]): Promise<Map<bigint, string>> {
	if (u64s.length === 0) return new Map();
	// Dedupe before round-trip; per-call cost dominates.
	const unique = [...new Set(u64s)];
	return entityIdsByU64s(unique);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseKinds(raw: unknown): Set<RefKind> | null {
	if (raw === undefined || raw === null) return new Set(REF_KINDS);
	if (!Array.isArray(raw)) return null;
	if (raw.length === 0) return null;
	const out = new Set<RefKind>();
	for (const v of raw) {
		if (typeof v !== 'string') return null;
		if (!REF_KIND_SET.has(v as RefKind)) return null;
		out.add(v as RefKind);
	}
	return out.size > 0 ? out : null;
}

function buildSnippet(body: string): string | undefined {
	if (body.length === 0) return undefined;
	// First non-empty line, trimmed of leading whitespace, capped at SNIPPET_MAX_LEN.
	const firstNL = body.indexOf('\n');
	const head    = firstNL === -1 ? body : body.slice(0, firstNL);
	const trimmed = head.trim();
	if (trimmed.length === 0) return undefined;
	return trimmed.length <= SNIPPET_MAX_LEN
		? trimmed
		: trimmed.slice(0, SNIPPET_MAX_LEN) + '...';
}

function emptyOutput(entityId: string, className: string): ReferencesOutput {
	return {
		entityId,
		className,
		references: [],
		truncated:  false,
		counts:     { CALLS: 0, INHERITS: 0, IMPLEMENTS: 0, REFERENCES: 0 },
	};
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
		output: `[code_class_references] ${msg}`,
		format: 'text',
		success: false,
		error: msg,
	};
}

function safeJson(v: unknown): string {
	try {
		const j = JSON.stringify(v, null, 2);
		return j.length <= 8192 ? j : j.slice(0, 8192) + '\n... <truncated>';
	} catch {
		return '<unserializable>';
	}
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerCodeClassReferencesTool(): void {
	registerTool(codeClassReferencesTool);
}

// ---------------------------------------------------------------------------
// Test exports
// ---------------------------------------------------------------------------

export const _parseKindsForTest               = parseKinds;
export const _buildSnippetForTest             = buildSnippet;
export const _codeClassReferencesToolForTest  = codeClassReferencesTool;
export const REF_LIMIT_FOR_TEST               = REF_LIMIT;
