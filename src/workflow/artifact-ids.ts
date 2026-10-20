/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The one identity scheme for every artifact (sc1).
 *
 * `ArtifactIds` builds and reads the flat artifact ids (`DEF-<h>`,
 * `LLD-<h>-s1`, `TASK-<h>-s1-t3`, `AMD-<h>-2`, ...) and `RequirementIds`
 * builds and reads the requirement ids stored in Define documents
 * (`E<date><hash8>[:S<nnn>]:FR<nnn>`). Both are pure string layers: no disk,
 * no clock, no fallback. The form is strict: a story is `s<n>`, a task is
 * `t<n>`, a hash is lowercase hex. An uppercase story or task spelling is not an id.
 */

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** A key or an input that cannot produce a valid id. */
export class InvalidArtifactKeyError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'InvalidArtifactKeyError';
	}
}

/** A path or folder date was needed and no Epic anchor exists. Raised before
 *  any path is computed or file written. */
export class MissingAnchorError extends InvalidArtifactKeyError {
	constructor(message: string) {
		super(message);
		this.name = 'MissingAnchorError';
	}
}

/** How a path calculation treats a missing anchor: a read never invents one; a
 *  write supplies the root the record is about to be stamped with. */
export type PathIntent =
	| { readonly kind: 'read' }
	| { readonly kind: 'write'; readonly root: { readonly createdAt: string } };

// ---------------------------------------------------------------------------
// ArtifactIds
// ---------------------------------------------------------------------------

export type ArtifactIdKind =
	| 'DEF' | 'HLD' | 'EPIC' | 'SPEC' | 'ISSUE'
	| 'LLD' | 'PLAN' | 'BUILD' | 'CR' | 'TESTS' | 'EXT' | 'STORY' | 'TASKS'
	| 'TASK' | 'DIAG' | 'AMD';

/** The parts of an artifact id. `epicHash` is the hash the id carries; for
 *  SPEC and ISSUE it is the run's own hash. */
export interface ArtifactKey {
	readonly kind:     ArtifactIdKind;
	readonly epicHash: string;
	readonly story?:   string | undefined;
	readonly task?:    string | undefined;
	readonly seq?:     number | undefined;
}

interface KindShape {
	readonly story: boolean;
	readonly task:  boolean;
	readonly seq:   boolean;
}

/** Which of story, task and seq each kind requires; all others are forbidden. */
const SHAPES: Readonly<Record<ArtifactIdKind, KindShape>> = {
	DEF:   { story: false, task: false, seq: false },
	HLD:   { story: false, task: false, seq: false },
	EPIC:  { story: false, task: false, seq: false },
	SPEC:  { story: false, task: false, seq: false },
	ISSUE: { story: false, task: false, seq: false },
	LLD:   { story: true,  task: false, seq: false },
	PLAN:  { story: true,  task: false, seq: false },
	BUILD: { story: true,  task: false, seq: false },
	CR:    { story: true,  task: false, seq: false },
	TESTS: { story: true,  task: false, seq: false },
	EXT:   { story: true,  task: false, seq: false },
	STORY: { story: true,  task: false, seq: false },
	TASKS: { story: true,  task: false, seq: false },
	TASK:  { story: true,  task: true,  seq: false },
	DIAG:  { story: true,  task: false, seq: true  },
	AMD:   { story: false, task: false, seq: true  },
};

const EPIC_HASH_RE = /^[0-9a-f]{16}$/;
const RUN_HASH_RE  = /^[0-9a-f]{8,}$/;
const STORY_RE     = /^s[1-9]\d*$/;
const TASK_RE      = /^t[1-9]\d*$/;
const SEQ_RE       = /^[1-9]\d*$/;

function isKind(s: string): s is ArtifactIdKind {
	return Object.prototype.hasOwnProperty.call(SHAPES, s);
}

function check(key: ArtifactKey): void {
	const { kind } = key;
	if (!isKind(kind)) throw new InvalidArtifactKeyError(`unknown artifact kind '${String(kind)}'`);
	const shape = SHAPES[kind];
	const hashRe = kind === 'SPEC' || kind === 'ISSUE' ? RUN_HASH_RE : EPIC_HASH_RE;
	if (typeof key.epicHash !== 'string' || !hashRe.test(key.epicHash)) {
		throw new InvalidArtifactKeyError(`${kind}: hash must be lowercase hex (got '${String(key.epicHash)}')`);
	}
	const field = (name: 'story' | 'task' | 'seq', required: boolean, present: boolean): void => {
		if (required && !present) throw new InvalidArtifactKeyError(`${kind}: ${name} is required`);
		if (!required && present) throw new InvalidArtifactKeyError(`${kind}: ${name} is not allowed`);
	};
	field('story', shape.story, key.story !== undefined);
	field('task', shape.task, key.task !== undefined);
	field('seq', shape.seq, key.seq !== undefined);
	if (key.story !== undefined && !STORY_RE.test(key.story)) {
		throw new InvalidArtifactKeyError(`${kind}: story must be s<n> (got '${key.story}'); an uppercase S<nnn> id is converted by the s9 conversion`);
	}
	if (key.task !== undefined && !TASK_RE.test(key.task)) {
		throw new InvalidArtifactKeyError(`${kind}: task must be t<n> (got '${key.task}')`);
	}
	if (key.seq !== undefined && (!Number.isInteger(key.seq) || key.seq < 1)) {
		throw new InvalidArtifactKeyError(`${kind}: seq must be an integer from 1 (got ${String(key.seq)})`);
	}
}

export const ArtifactIds = {
	/** Build the id text for a key. Throws {@link InvalidArtifactKeyError}. */
	make(key: ArtifactKey): string {
		check(key);
		const parts: string[] = [key.kind, key.epicHash];
		if (key.kind === 'AMD') {
			parts.push(String(key.seq));
			return parts.join('-');
		}
		if (key.story !== undefined) parts.push(key.story);
		if (key.task !== undefined) parts.push(key.task);
		if (key.seq !== undefined) parts.push(String(key.seq));
		return parts.join('-');
	},

	/** Read an id into its key, or undefined when the text is not an artifact id
	 *  in the strict form. Never throws. */
	parse(id: string): ArtifactKey | undefined {
		if (typeof id !== 'string') return undefined;
		const parts = id.split('-');
		const kind = parts[0];
		if (kind === undefined || !isKind(kind)) return undefined;
		const shape = SHAPES[kind];
		const rest = parts.slice(2);
		const expected = (shape.story ? 1 : 0) + (shape.task ? 1 : 0) + (shape.seq ? 1 : 0);
		if (parts.length < 2 || rest.length !== expected) return undefined;
		let i = 0;
		const story = shape.story ? rest[i++] : undefined;
		const task  = shape.task ? rest[i++] : undefined;
		const seqText = shape.seq ? rest[i++] : undefined;
		if (seqText !== undefined && !SEQ_RE.test(seqText)) return undefined;
		const key: ArtifactKey = {
			kind,
			epicHash: parts[1] as string,
			...(story !== undefined ? { story } : {}),
			...(task !== undefined ? { task } : {}),
			...(seqText !== undefined ? { seq: Number(seqText) } : {}),
		};
		try {
			return ArtifactIds.make(key) === id ? key : undefined;
		} catch {
			return undefined;
		}
	},

	/** {@link ArtifactIds.make} that answers undefined instead of throwing, for a renderer or reader that falls back to a plain label. */
	tryMake(key: ArtifactKey): string | undefined {
		try { return ArtifactIds.make(key); } catch { return undefined; }
	},

	/** The ordinal n of an `s<n>` story, or null when the text is not one. */
	storyOrdinal(story: string): number | null {
		return typeof story === 'string' && STORY_RE.test(story) ? Number(story.slice(1)) : null;
	},

	/** The ordinal n of a `t<n>` task, or null when the text is not one. */
	taskOrdinal(task: string): number | null {
		return typeof task === 'string' && TASK_RE.test(task) ? Number(task.slice(1)) : null;
	},

	/** The parent key: TASK to STORY, STORY to EPIC, TASKS and DIAG to STORY;
	 *  undefined for the rest. */
	parentOf(key: ArtifactKey): ArtifactKey | undefined {
		switch (key.kind) {
			case 'TASK':
			case 'TASKS':
			case 'DIAG':
				return { kind: 'STORY', epicHash: key.epicHash, story: key.story };
			case 'STORY':
				return { kind: 'EPIC', epicHash: key.epicHash };
			default:
				return undefined;
		}
	},
} as const;

// ---------------------------------------------------------------------------
// RequirementIds
// ---------------------------------------------------------------------------

/** The segments of a requirement id. `story` is present only for a per-story one. */
export interface RequirementIdParts {
	readonly date:   string;
	readonly hash8:  string;
	readonly story?: number | undefined;
	readonly fr:     number;
}

const REQ_CANONICAL_RE = /^E(\d{8})([0-9a-f]{8})(?::S(\d+))?:FR(\d+)$/;
const REQ_SLUG_RE      = /^E(\d{8})([0-9a-f]{8})(?:-S(\d+))?-FR(\d+)$/;

const pad3 = (n: number): string => String(n).padStart(3, '0');

function utcDate(createdAt: string): string {
	const d = new Date(createdAt);
	if (typeof createdAt !== 'string' || Number.isNaN(d.getTime())) {
		throw new InvalidArtifactKeyError(`requirement id: invalid createdAt '${String(createdAt)}'`);
	}
	return `${String(d.getUTCFullYear()).padStart(4, '0')}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
}

export const RequirementIds = {
	/** Mint a requirement id: `E<date><hash8>[:S<nnn>]:FR<nnn>`. */
	mint(epicHash: string, createdAt: string, ordinal: number, storyId?: string): string {
		if (typeof epicHash !== 'string' || !/^[0-9a-f]{8,}$/.test(epicHash)) {
			throw new InvalidArtifactKeyError(`requirement id: epicHash must be lowercase hex (got '${String(epicHash)}')`);
		}
		if (!Number.isInteger(ordinal) || ordinal < 1) {
			throw new InvalidArtifactKeyError(`requirement id: ordinal must be an integer from 1 (got ${String(ordinal)})`);
		}
		let s = `E${utcDate(createdAt)}${epicHash.slice(0, 8)}`;
		if (storyId !== undefined) {
			if (!STORY_RE.test(storyId)) {
				throw new InvalidArtifactKeyError(`requirement id: story must be s<n> (got '${storyId}')`);
			}
			s += `:S${pad3(Number(storyId.slice(1)))}`;
		}
		return `${s}:FR${pad3(ordinal)}`;
	},

	/** Read a canonical or slug requirement id, or undefined on a miss. */
	parse(id: string): RequirementIdParts | undefined {
		if (typeof id !== 'string') return undefined;
		const m = REQ_CANONICAL_RE.exec(id) ?? REQ_SLUG_RE.exec(id);
		if (m === null) return undefined;
		const date = m[1] as string;
		const hash8 = m[2] as string;
		const fr = Number(m[4]);
		return m[3] !== undefined ? { date, hash8, story: Number(m[3]), fr } : { date, hash8, fr };
	},

	isRequirementId(id: string): boolean {
		return RequirementIds.parse(id) !== undefined;
	},
} as const;
