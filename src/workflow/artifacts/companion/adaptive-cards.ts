/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * sc4 (S004) — the vendored Adaptive Cards schema asset + its boot-time validator.
 *
 * The authored `uxDefinition` body element is validated with ajv
 * (validateAgainstSchema) against a STATIC JSON Schema vendored under
 * src/assets/artifacts/schemas/ and shipped by copy-assets — so no Adaptive Cards
 * SDK/toolchain runs at runtime (k5). This module is the SINGLE resolver for that
 * asset's location: both the UX validator (loadAdaptiveCardsSchema) and the
 * boot-time check (validateAdaptiveCardsAsset) read from it, so they can never
 * disagree.
 *
 * Modelled on ./metamodel.ts: a mis-staged/corrupt asset is a fail-fast startup
 * refusal (AdaptiveCardsAssetError re-raised to the daemon's top-level fatal
 * handler), never a silent skip of UX validation. The schema dir is shared with
 * metamodel.ts (the ONE artifact-schema dir), so a test override points BOTH at a
 * temp dir at once.
 */

import { readFileSync } from 'node:fs';
import { stat, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { getLogger } from '../../../shared/logger.js';
import type { StructuredSchema } from '../../../shared/types.js';
import { artifactSchemaDir } from './metamodel.js';

const log = getLogger('artifacts:companion:adaptive-cards');

/** The vendored schema's basename. */
export const ADAPTIVE_CARDS_ASSET = 'adaptive-cards.schema.json';

let schemaCache: StructuredSchema | undefined;

/**
 * Load + cache the vendored Adaptive Cards JSON Schema. Reads synchronously from
 * the resolved artifact-schema dir (shared with metamodel.ts); parse/read failures
 * propagate (validateUxDefinition turns a load failure into a UxDefinitionError,
 * and the boot check catches a missing asset up front). Cached per process (the
 * schema is a static bundled asset).
 */
export function loadAdaptiveCardsSchema(): StructuredSchema {
	if (schemaCache !== undefined) return schemaCache;
	const abs = join(artifactSchemaDir(), ADAPTIVE_CARDS_ASSET);
	const raw = readFileSync(abs, 'utf8');
	schemaCache = JSON.parse(raw) as StructuredSchema;
	return schemaCache;
}

/** Reset the schema cache (tests). */
export function _resetAdaptiveCardsCacheForTests(): void { schemaCache = undefined; }

/** Thrown when the vendored Adaptive Cards schema asset is missing / unreadable /
 *  unparseable. Carries a single actionable 'Fix:' line naming the copy-assets ship
 *  step (mirrors LinkmlMetamodelAssetError). */
export class AdaptiveCardsAssetError extends Error {
	readonly path:   string;
	readonly reason: string;
	constructor(path: string, reason: string) {
		super(
			`artifacts: Adaptive Cards schema asset validation failed:\n` +
				`  - ${ADAPTIVE_CARDS_ASSET}: ${path} (${reason})\n` +
				'Fix: rebuild so src/assets/artifacts/schemas/adaptive-cards.schema.json ' +
				'ships via copy-assets.mjs into out/assets/artifacts/schemas/.',
		);
		this.name = 'AdaptiveCardsAssetError';
		this.path = path;
		this.reason = reason;
	}
}

/**
 * Validate the vendored Adaptive Cards schema asset at boot: it must exist, be
 * readable, be non-empty, and parse as a JSON object. Returns silently when sound;
 * otherwise throws AdaptiveCardsAssetError. Read-only (stat + readFile).
 */
export async function validateAdaptiveCardsAsset(): Promise<void> {
	const abs = join(artifactSchemaDir(), ADAPTIVE_CARDS_ASSET);
	try {
		await stat(abs);
	} catch (err) {
		const reason = (err as NodeJS.ErrnoException).code === 'ENOENT' ? 'file not found' : `stat failed: ${(err as Error).message}`;
		throw new AdaptiveCardsAssetError(abs, reason);
	}
	let body: string;
	try {
		body = await readFile(abs, 'utf8');
	} catch (err) {
		throw new AdaptiveCardsAssetError(abs, `read failed: ${(err as Error).message}`);
	}
	if (body.trim().length === 0) {
		throw new AdaptiveCardsAssetError(abs, 'file is empty');
	}
	try {
		const parsed = JSON.parse(body) as unknown;
		if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
			throw new Error('not a JSON object');
		}
	} catch (err) {
		throw new AdaptiveCardsAssetError(abs, `unparseable schema: ${(err as Error).message}`);
	}
	log.info({ dir: artifactSchemaDir(), asset: ADAPTIVE_CARDS_ASSET }, 'Adaptive Cards schema asset validated');
}
