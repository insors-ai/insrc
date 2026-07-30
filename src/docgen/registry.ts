/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * docgen — DocTypeRegistry (Epic 870ed3dd, Story s1 · t3).
 *
 * The single registration + resolution surface. Because each registration
 * binds its own `extract()`, this registry is the ONLY dispatch path from a
 * docType to an extractor AND the ONLY source of the capability listing every
 * access surface enumerates — so the daemon tool registry, IPC method table,
 * and MCP tool surface cannot drift (k4). Registration is startup-wiring only
 * and fails FAST: a duplicate docType or a malformed record throws
 * synchronously before any request is served, rather than surfacing later as a
 * broken capability listing on all three surfaces at once.
 */

import type {
	DocTypeRegistration,
	DocTypeRegistry,
	SerializableDocTypeRegistration,
} from './types.js';

/** Two extractors claimed the same docType — a startup wiring bug. */
export class DuplicateDocTypeError extends Error {
	readonly docType: string;
	constructor(docType: string) {
		super(`docgen: docType '${docType}' is already registered`);
		this.name = 'DuplicateDocTypeError';
		this.docType = docType;
	}
}

/** A registration record is malformed (bad schema, or capability.id mismatch). */
export class InvalidRegistrationError extends Error {
	readonly docType: string;
	constructor(docType: string, why: string) {
		super(`docgen: invalid registration for docType '${docType}': ${why}`);
		this.name = 'InvalidRegistrationError';
		this.docType = docType;
	}
}

/** A plain (non-array, non-null) object. */
function isPlainObject(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * The default in-memory registry. Insertion order is preserved by the Map, so
 * `list()` returns registrations in registration order.
 */
export class InMemoryDocTypeRegistry implements DocTypeRegistry {
	private readonly byDocType = new Map<string, DocTypeRegistration>();

	register(entry: DocTypeRegistration): void {
		if (typeof entry.docType !== 'string' || entry.docType.length === 0) {
			throw new InvalidRegistrationError(String(entry.docType), 'docType must be a non-empty string');
		}
		if (this.byDocType.has(entry.docType)) {
			throw new DuplicateDocTypeError(entry.docType);
		}
		if (!isPlainObject(entry.extractorInputSchema)) {
			throw new InvalidRegistrationError(entry.docType, 'extractorInputSchema must be a JSON-schema object');
		}
		if (entry.capability.id !== entry.docType) {
			throw new InvalidRegistrationError(
				entry.docType,
				`capability.id '${entry.capability.id}' must match docType '${entry.docType}'`,
			);
		}
		if (typeof entry.extract !== 'function') {
			throw new InvalidRegistrationError(entry.docType, 'extract must be a function');
		}
		this.byDocType.set(entry.docType, entry);
	}

	/** Every registration, in registration order. The array is a fresh copy —
	 *  mutating it does not alter the registry. */
	list(): readonly DocTypeRegistration[] {
		return [...this.byDocType.values()];
	}

	get(docType: string): DocTypeRegistration | undefined {
		return this.byDocType.get(docType);
	}
}

/** Project a registration to the subset that crosses a process boundary
 *  (IPC / MCP) — everything except the bound `extract` function. Callers on the
 *  daemon tool surface, the IPC method table, and the MCP tool surface all
 *  enumerate via this, so their capability sets are identical by construction. */
export function toSerializable(entry: DocTypeRegistration): SerializableDocTypeRegistration {
	return {
		docType:              entry.docType,
		capability:           entry.capability,
		extractorInputSchema: entry.extractorInputSchema,
	};
}
