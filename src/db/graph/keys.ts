/**
 * Binary key encoders/decoders for the LMDB graph storage layer.
 *
 * Per the design doc (plans/graph-storage-lmdb.md, "Key encoding"):
 * all composite keys are concatenations of fixed-width binary fields,
 * with `\0` as the segment delimiter for variable-length string parts.
 * Big-endian u64 / u32 ensures LMDB's lexicographic ordering matches
 * numeric ordering -- critical for sequential ID inserts to land at
 * the right edge of the B+ tree.
 *
 * Phase 1.1: codec helpers. ID allocation lands in Phase 1.2; record
 * value codecs (msgpack typed encoders) land in Phase 1.3.
 *
 * No ad-hoc concatenation in callers -- all key building goes through
 * these helpers.
 */

// ---------------------------------------------------------------------------
// Relation kinds (12-kind enum, encoded as u8 in edge keys)
// ---------------------------------------------------------------------------

export const RELATION_KIND_BYTE = {
	CONTAINS:        1,
	DEFINES:         2,
	INHERITS:        3,
	IMPLEMENTS:      4,
	CALLS:           5,
	IMPORTS:         6,
	EXPORTS:         7,
	DEPENDS_ON:      8,
	REFERENCES:      9,
	READS:          10,
	WRITES:         11,
	STEP_DEPENDS_ON: 12,
} as const;

export type RelationKind = keyof typeof RELATION_KIND_BYTE;

const KIND_NAME_BY_BYTE: Record<number, RelationKind> = (() => {
	const out: Record<number, RelationKind> = {};
	for (const [k, v] of Object.entries(RELATION_KIND_BYTE)) {
		out[v] = k as RelationKind;
	}
	return out;
})();

export function kindByteToName(b: number): RelationKind {
	const name = KIND_NAME_BY_BYTE[b];
	if (name === undefined) {
		throw new Error(`unknown relation-kind byte: ${b}`);
	}
	return name;
}

// ---------------------------------------------------------------------------
// Entity-kind codec (u8) -- mirrors the design doc's EntityKind enum
// ---------------------------------------------------------------------------

export const ENTITY_KIND_BYTE = {
	// Aligned with the domain EntityKind enum in shared/types.ts.
	// u8 slot positions are fixed: never reorder, never reuse a removed
	// slot (additive-only changes; bump SCHEMA_VERSION when adding).
	repo:      1,
	file:      2,
	module:    3,
	function:  4,
	method:    5,
	class:     6,
	interface: 7,
	type:      8,
	variable:  9,
	document:  10,
	section:   11,
	config:    12,
} as const;

export type EntityKind = keyof typeof ENTITY_KIND_BYTE;

const ENTITY_KIND_NAME_BY_BYTE: Record<number, EntityKind> = (() => {
	const out: Record<number, EntityKind> = {};
	for (const [k, v] of Object.entries(ENTITY_KIND_BYTE)) {
		out[v] = k as EntityKind;
	}
	return out;
})();

export function entityKindByteToName(b: number): EntityKind {
	const name = ENTITY_KIND_NAME_BY_BYTE[b];
	if (name === undefined) {
		throw new Error(`unknown entity-kind byte: ${b}`);
	}
	return name;
}

// ---------------------------------------------------------------------------
// Primary-key encoders (fixed-width)
// ---------------------------------------------------------------------------

export function encodeEntityKey(id: bigint): Buffer {
	const buf = Buffer.alloc(8);
	buf.writeBigUInt64BE(id, 0);
	return buf;
}

export function decodeEntityKey(buf: Buffer): bigint {
	if (buf.length !== 8) {
		throw new Error(`expected 8-byte entity key, got ${buf.length}`);
	}
	return buf.readBigUInt64BE(0);
}

export function encodeRepoKey(id: number): Buffer {
	const buf = Buffer.alloc(4);
	buf.writeUInt32BE(id, 0);
	return buf;
}

export function decodeRepoKey(buf: Buffer): number {
	if (buf.length !== 4) {
		throw new Error(`expected 4-byte repo key, got ${buf.length}`);
	}
	return buf.readUInt32BE(0);
}

export function encodeUnresolvedKey(id: bigint): Buffer {
	// same shape as entity key (u64 BE); separate function for clarity
	return encodeEntityKey(id);
}

export const decodeUnresolvedKey = decodeEntityKey;

// ---------------------------------------------------------------------------
// Edge keys (out_edge / in_edge)
// ---------------------------------------------------------------------------

export function encodeOutEdgeKey(from: bigint, kind: number, to: bigint): Buffer {
	if (kind < 0 || kind > 0xff) {
		throw new Error(`relation-kind byte out of range: ${kind}`);
	}
	const buf = Buffer.alloc(17);
	buf.writeBigUInt64BE(from, 0);
	buf.writeUInt8(kind, 8);
	buf.writeBigUInt64BE(to, 9);
	return buf;
}

export function encodeInEdgeKey(to: bigint, kind: number, from: bigint): Buffer {
	if (kind < 0 || kind > 0xff) {
		throw new Error(`relation-kind byte out of range: ${kind}`);
	}
	const buf = Buffer.alloc(17);
	buf.writeBigUInt64BE(to, 0);
	buf.writeUInt8(kind, 8);
	buf.writeBigUInt64BE(from, 9);
	return buf;
}

/**
 * Prefix for `getRange` scans: pass `kind === undefined` to get all
 * out-edges of a node, or a specific kind to scope.
 */
export function encodeOutEdgePrefix(from: bigint, kind?: number): Buffer {
	if (kind === undefined) {
		const buf = Buffer.alloc(8);
		buf.writeBigUInt64BE(from, 0);
		return buf;
	}
	if (kind < 0 || kind > 0xff) {
		throw new Error(`relation-kind byte out of range: ${kind}`);
	}
	const buf = Buffer.alloc(9);
	buf.writeBigUInt64BE(from, 0);
	buf.writeUInt8(kind, 8);
	return buf;
}

export function encodeInEdgePrefix(to: bigint, kind?: number): Buffer {
	return encodeOutEdgePrefix(to, kind);
}

export function decodeOutEdgeKey(buf: Buffer): { from: bigint; kind: number; to: bigint } {
	if (buf.length !== 17) {
		throw new Error(`expected 17-byte out-edge key, got ${buf.length}`);
	}
	return {
		from: buf.readBigUInt64BE(0),
		kind: buf.readUInt8(8),
		to:   buf.readBigUInt64BE(9),
	};
}

export function decodeInEdgeKey(buf: Buffer): { to: bigint; kind: number; from: bigint } {
	if (buf.length !== 17) {
		throw new Error(`expected 17-byte in-edge key, got ${buf.length}`);
	}
	return {
		to:   buf.readBigUInt64BE(0),
		kind: buf.readUInt8(8),
		from: buf.readBigUInt64BE(9),
	};
}

/**
 * Increment a binary buffer by one (treating it as a big-endian
 * arbitrary-precision integer). Used to compute the exclusive end of
 * a prefix range scan: `getRange({ start: prefix, end: prefixSuccessor(prefix) })`.
 *
 * Wraps around with a leading `0x01` byte if all bytes are 0xff
 * (essentially never happens for our key shapes but we handle it for
 * correctness).
 */
export function prefixSuccessor(buf: Buffer): Buffer {
	const out = Buffer.from(buf);
	for (let i = out.length - 1; i >= 0; i--) {
		const v = out[i]!;
		if (v < 0xff) {
			out[i] = v + 1;
			return out;
		}
		out[i] = 0;
	}
	return Buffer.concat([Buffer.from([0x01]), out]);
}

// ---------------------------------------------------------------------------
// Composite keys with utf8 strings + null delimiters
// ---------------------------------------------------------------------------

const NULL_DELIM = Buffer.from([0x00]);

function utf8(s: string): Buffer {
	if (s.includes('\0')) {
		throw new Error('utf8 segment contains null byte (cannot be used in composite key)');
	}
	return Buffer.from(s, 'utf8');
}

// name_index: (u32 repo BE, u8 kind, utf8 name) -> u64 entity_id
export function encodeNameIndexKey(repoId: number, kindByte: number, name: string): Buffer {
	const repo = encodeRepoKey(repoId);
	const k = Buffer.from([kindByte & 0xff]);
	const n = utf8(name);
	return Buffer.concat([repo, k, n]);
}

export function encodeNameIndexPrefix(repoId: number, kindByte?: number): Buffer {
	const repo = encodeRepoKey(repoId);
	if (kindByte === undefined) return repo;
	return Buffer.concat([repo, Buffer.from([kindByte & 0xff])]);
}

// unresolved_by_file: (u32 repo, utf8 from_file) -- dupsort u64 unresolved_id
export function encodeUnresolvedByFileKey(repoId: number, fromFile: string): Buffer {
	return Buffer.concat([encodeRepoKey(repoId), utf8(fromFile)]);
}

// plan_step: (utf8 plan_id, \0, u32 idx BE)
export function encodePlanStepKey(planId: string, idx: number): Buffer {
	const plan = utf8(planId);
	const i = Buffer.alloc(4);
	i.writeUInt32BE(idx >>> 0, 0);
	return Buffer.concat([plan, NULL_DELIM, i]);
}

export function encodePlanStepPrefix(planId: string): Buffer {
	return Buffer.concat([utf8(planId), NULL_DELIM]);
}

// conversation_turn: (utf8 session_id, \0, u32 idx BE)
export function encodeConversationTurnKey(sessionId: string, idx: number): Buffer {
	const s = utf8(sessionId);
	const i = Buffer.alloc(4);
	i.writeUInt32BE(idx >>> 0, 0);
	return Buffer.concat([s, NULL_DELIM, i]);
}

export function encodeConversationTurnPrefix(sessionId: string): Buffer {
	return Buffer.concat([utf8(sessionId), NULL_DELIM]);
}

// conversation_turn_by_repo: (utf8 repo, \0, utf8 turn_id) -- dupsort empty
export function encodeConvTurnByRepoKey(repo: string, turnId: string): Buffer {
	return Buffer.concat([utf8(repo), NULL_DELIM, utf8(turnId)]);
}

export function encodeConvTurnByRepoPrefix(repo: string): Buffer {
	return Buffer.concat([utf8(repo), NULL_DELIM]);
}

// todo_list_by_session: (utf8 session_id, \0, utf8 list_id) -- dupsort empty
export function encodeTodoListBySessionKey(sessionId: string, listId: string): Buffer {
	return Buffer.concat([utf8(sessionId), NULL_DELIM, utf8(listId)]);
}

export function encodeTodoListBySessionPrefix(sessionId: string): Buffer {
	return Buffer.concat([utf8(sessionId), NULL_DELIM]);
}

// todo_item: (utf8 list_id, \0, utf8 order_key, \0, utf8 item_id)
export function encodeTodoItemKey(listId: string, orderKey: string, itemId: string): Buffer {
	return Buffer.concat([utf8(listId), NULL_DELIM, utf8(orderKey), NULL_DELIM, utf8(itemId)]);
}

export function encodeTodoItemPrefix(listId: string): Buffer {
	return Buffer.concat([utf8(listId), NULL_DELIM]);
}

// todo_comment: (utf8 item_id, \0, utf8 comment_id)
export function encodeTodoCommentKey(itemId: string, commentId: string): Buffer {
	return Buffer.concat([utf8(itemId), NULL_DELIM, utf8(commentId)]);
}

export function encodeTodoCommentPrefix(itemId: string): Buffer {
	return Buffer.concat([utf8(itemId), NULL_DELIM]);
}

// config_by_scope: (utf8 scope, \0, utf8 namespace, \0, utf8 category, \0, utf8 entry_id)
export function encodeConfigByScopeKey(
	scope: string,
	namespace: string,
	category: string,
	entryId: string,
): Buffer {
	return Buffer.concat([
		utf8(scope), NULL_DELIM,
		utf8(namespace), NULL_DELIM,
		utf8(category), NULL_DELIM,
		utf8(entryId),
	]);
}

export function encodeConfigByScopePrefix(
	scope: string,
	namespace?: string,
	category?: string,
): Buffer {
	const parts: Buffer[] = [utf8(scope), NULL_DELIM];
	if (namespace !== undefined) {
		parts.push(utf8(namespace), NULL_DELIM);
		if (category !== undefined) {
			parts.push(utf8(category), NULL_DELIM);
		}
	}
	return Buffer.concat(parts);
}
