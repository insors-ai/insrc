/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Pure, schema-driven config reconciliation.
 *
 * `reconcileConfig(existing, catalog)` merges the recognized CONFIG_CATALOG
 * keys over the on-disk config, carrying every value it can and filling /
 * repairing the rest from catalog defaults — so a config that predates a
 * schema change is brought up to the current shape WITHOUT losing anything
 * the catalog does not enumerate.
 *
 * STRICTLY PURE — no fs, IPC, socket, or clock. The daemon-boot caller
 * (src/daemon/index.ts step 2b) runs before the socket exists and before
 * the DB opens, so this module must be side-effect free. The I/O side
 * (read / write-once) lives in reconcile-io.ts.
 *
 * DESIGN (approved LLD a1 — refined to copy-on-write):
 *   The output is a MERGE over `existing`, never a rebuild from catalog
 *   rows, so catalog-unenumerable keys (models.analyze.roleTiers.<roleId>,
 *   models.analyze.byRepo.<absPath>.*, models.agents, …) survive blindly.
 *   We copy-on-write: the root is shallow-copied and each ancestor node is
 *   shallow-copied only when a descendant leaf is actually written. Any
 *   subtree that is never touched keeps its ORIGINAL object reference
 *   (referential preservation), and `existing` is never mutated — a
 *   deep-frozen input reconciles cleanly because we only ever write into
 *   freshly-owned copies.
 *
 * Per key the outcome is one of:
 *   - filled   — the catalog key is absent → the default is written
 *   - carried  — the key is present and type-valid → kept untouched
 *   - repaired — the key is present but type-invalid (or an ancestor
 *                collided with a scalar/array) → the default is substituted
 *                and the discarded prior value is recorded
 */

import { CONFIG_CATALOG, type ConfigOption } from './config-catalog.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** A repaired key: the catalog dot-path plus the value that was discarded
 *  (the type-invalid leaf, or the scalar/array an ancestor collided with). */
export interface ConfigRepair {
	readonly path:      string;
	readonly discarded: unknown;
}

export interface ConfigReconcileResult {
	/** The reconciled config document (a new root; untouched subtrees shared). */
	readonly config:   Record<string, unknown>;
	/** true iff anything was filled or repaired. */
	readonly changed:  boolean;
	/** Catalog dot-paths present and type-valid, carried through unchanged. */
	readonly carried:  readonly string[];
	/** Catalog dot-paths that were absent and got the catalog default. */
	readonly filled:   readonly string[];
	/** Catalog dot-paths repaired to the default (with the discarded value). */
	readonly repaired: readonly ConfigRepair[];
}

/**
 * A programmer error in our own shipped catalog — distinct from every
 * user-config or filesystem failure, so callers can flag "the catalog we
 * shipped is self-inconsistent" differently from "the user's config is bad".
 * Thrown for a catalog row with an out-of-domain `type`, or a row whose own
 * default fails its own declared type predicate.
 */
export class ConfigCatalogError extends Error {
	readonly catalogPath: string;
	constructor(catalogPath: string, message: string) {
		super(message);
		this.name = 'ConfigCatalogError';
		this.catalogPath = catalogPath;
	}
}

// ---------------------------------------------------------------------------
// Predicates
// ---------------------------------------------------------------------------

/** A plain (non-array, non-null) object — the only thing we descend into. */
function isPlainObject(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Type-match predicate — an EXHAUSTIVE switch over the closed ConfigOption
 * discriminant 'string' | 'number' | 'boolean' | 'enum'. Adding a new
 * discriminant member without a matching arm is a COMPILE error (the
 * `never` assignment), not a silent pass-through. 'enum' rows carry no
 * allowed-values field, so their predicate degenerates to a string check
 * (7 of the 41 rows are enums).
 */
function matchesType(value: unknown, type: ConfigOption['type']): boolean {
	switch (type) {
		case 'string':  return typeof value === 'string';
		case 'number':  return typeof value === 'number';
		case 'boolean': return typeof value === 'boolean';
		case 'enum':    return typeof value === 'string';
		default: {
			const _exhaustive: never = type;
			void _exhaustive;
			return false;
		}
	}
}

const IN_DOMAIN: ReadonlySet<string> = new Set(['string', 'number', 'boolean', 'enum']);

/** Catalog-integrity check — throws ConfigCatalogError (a shipped-catalog
 *  bug), never degrades to fill-default. */
function assertRowValid(opt: ConfigOption): void {
	if (!IN_DOMAIN.has(opt.type)) {
		throw new ConfigCatalogError(opt.path,
			`catalog row '${opt.path}' has out-of-domain type '${String(opt.type)}'`);
	}
	if (!matchesType(opt.default, opt.type)) {
		throw new ConfigCatalogError(opt.path,
			`catalog row '${opt.path}' default does not satisfy its own '${opt.type}' predicate`);
	}
}

/** Clone a catalog default before writing it, so no config ever shares a
 *  reference into the catalog literal. Scalars pass through structuredClone
 *  unchanged; the current catalog holds only scalars. */
function cloneDefault(value: unknown): unknown {
	if (value === null || typeof value !== 'object') return value;
	return structuredClone(value);
}

// ---------------------------------------------------------------------------
// Classification (read-only) + write (copy-on-write)
// ---------------------------------------------------------------------------

type Outcome =
	| { readonly kind: 'carried' }
	| { readonly kind: 'fill' }
	| { readonly kind: 'repair'; readonly discarded: unknown };

/** Determine a key's outcome by reading the current document — no writes,
 *  so shared subtrees stay shared until a write is actually required. */
function classify(root: Record<string, unknown>, keys: readonly string[], type: ConfigOption['type']): Outcome {
	let node: unknown = root;
	for (let i = 0; i < keys.length - 1; i++) {
		if (!isPlainObject(node)) {
			// An ancestor slot is not a plain object. Absent (undefined) → the
			// path just needs synthesizing (fill). A defined scalar/array →
			// collision: the subtree is replaced, the discarded value recorded.
			return node === undefined ? { kind: 'fill' } : { kind: 'repair', discarded: node };
		}
		node = node[keys[i]!];
	}
	if (!isPlainObject(node)) {
		return node === undefined ? { kind: 'fill' } : { kind: 'repair', discarded: node };
	}
	const leaf = keys[keys.length - 1]!;
	if (!Object.prototype.hasOwnProperty.call(node, leaf)) return { kind: 'fill' };
	const current = node[leaf];
	if (matchesType(current, type)) return { kind: 'carried' };
	return { kind: 'repair', discarded: current };
}

/**
 * Copy-on-write set of a leaf. Descends from the owned root, shallow-copying
 * each ancestor exactly once (tracked in `owned`) before writing through it —
 * so `existing`'s objects are read but never mutated, and any ancestor that
 * collides with a scalar/array/undefined is replaced with a fresh object.
 */
function writeLeaf(
	root: Record<string, unknown>,
	owned: WeakSet<object>,
	keys: readonly string[],
	value: unknown,
): void {
	let obj = root;
	for (let i = 0; i < keys.length - 1; i++) {
		const key = keys[i]!;
		const child = obj[key];
		if (isPlainObject(child) && owned.has(child)) {
			obj = child;
		} else if (isPlainObject(child)) {
			const copy = { ...child };
			owned.add(copy);
			obj[key] = copy;
			obj = copy;
		} else {
			const fresh: Record<string, unknown> = {};
			owned.add(fresh);
			obj[key] = fresh;
			obj = fresh;
		}
	}
	obj[keys[keys.length - 1]!] = value;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Reconcile an on-disk config document against the catalog. Pure: `existing`
 * is never mutated. A non-object `existing` (undefined / null / array /
 * string / number / boolean) is treated as `{}` — every catalog key is filled.
 *
 * @throws ConfigCatalogError if a catalog row has an out-of-domain type or a
 *         default that fails its own predicate (a shipped-catalog bug).
 */
export function reconcileConfig(
	existing: unknown,
	catalog: readonly ConfigOption[] = CONFIG_CATALOG,
): ConfigReconcileResult {
	// Root is a shallow copy so we never write through to `existing`; nested
	// nodes are copied lazily (copy-on-write) only when a descendant is written.
	const config: Record<string, unknown> = isPlainObject(existing) ? { ...existing } : {};
	const owned = new WeakSet<object>();
	owned.add(config);

	const carried:  string[] = [];
	const filled:   string[] = [];
	const repaired: ConfigRepair[] = [];

	for (const opt of catalog) {
		assertRowValid(opt);
		const keys = opt.path.split('.');
		const outcome = classify(config, keys, opt.type);
		switch (outcome.kind) {
			case 'carried':
				carried.push(opt.path);
				break;
			case 'fill':
				writeLeaf(config, owned, keys, cloneDefault(opt.default));
				filled.push(opt.path);
				break;
			case 'repair':
				writeLeaf(config, owned, keys, cloneDefault(opt.default));
				repaired.push({ path: opt.path, discarded: outcome.discarded });
				break;
		}
	}

	const changed = filled.length + repaired.length > 0;
	return { config, changed, carried, filled, repaired };
}
