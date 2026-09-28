/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * sc4 (S003) — the vendored LinkML metamodel schema asset + its boot-time
 * validator.
 *
 * The ErDefinition body element is validated with ajv (validateAgainstSchema)
 * against a STATIC JSON Schema vendored under src/assets/artifacts/schemas/ and
 * shipped by copy-assets — so no Python/LinkML toolchain runs at runtime (k5).
 * This module is the SINGLE resolver for that asset's location: both the ER
 * validator (loadLinkmlMetamodelSchema) and the boot-time check
 * (validateLinkmlMetamodelAsset) read from it, so they can never disagree.
 *
 * Modelled on src/docgen/asset-validator.ts: a mis-staged/corrupt asset is a
 * fail-fast startup refusal (LinkmlMetamodelAssetError re-raised to the daemon's
 * top-level fatal handler), never a silent skip of ER validation.
 */

import { readFileSync } from 'node:fs';
import { stat, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getLogger } from '../../../shared/logger.js';
import type { StructuredSchema } from '../../../shared/types.js';

const log = getLogger('artifacts:companion:metamodel');

/** The vendored schema's basename. */
export const LINKML_METAMODEL_ASSET = 'linkml-metamodel.schema.json';

/** The single source of truth for where the artifact schema assets live
 *  (out/assets/artifacts/schemas, resolved from import.meta.url). Both the ER
 *  validator and the boot-time asset check read from here.
 *  out/workflow/artifacts/companion/metamodel.js → ../../../assets/artifacts/schemas */
export const ARTIFACT_SCHEMA_DIR = join(
	dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'assets', 'artifacts', 'schemas',
);

/** Test-only override of the schema dir, shared by the loader + the boot
 *  validator so a test can point BOTH at a temp dir at once. Undefined in
 *  production → ARTIFACT_SCHEMA_DIR. */
let schemaDirOverride: string | undefined;
export function _setArtifactSchemaDirForTests(dir?: string): void { schemaDirOverride = dir; schemaCache = undefined; }

/** The artifact schema dir currently in effect (the test override when set). */
export function artifactSchemaDir(): string { return schemaDirOverride ?? ARTIFACT_SCHEMA_DIR; }

let schemaCache: StructuredSchema | undefined;

/**
 * Load + cache the vendored LinkML metamodel JSON Schema. Reads synchronously
 * from the resolved asset dir; parse/read failures propagate (the ER validator
 * turns a load failure into a HIGH finding, and the boot check catches a missing
 * asset up front). Cached per process (the schema is a static bundled asset).
 */
export function loadLinkmlMetamodelSchema(): StructuredSchema {
	if (schemaCache !== undefined) return schemaCache;
	const abs = join(artifactSchemaDir(), LINKML_METAMODEL_ASSET);
	const raw = readFileSync(abs, 'utf8');
	schemaCache = JSON.parse(raw) as StructuredSchema;
	return schemaCache;
}

/** Reset the schema cache (tests). */
export function _resetMetamodelCacheForTests(): void { schemaCache = undefined; }

/** Thrown when the vendored LinkML metamodel schema asset is missing / unreadable
 *  / unparseable. Carries a single actionable 'Fix:' line naming the copy-assets
 *  ship step (mirrors DocgenAssetValidationError). */
export class LinkmlMetamodelAssetError extends Error {
	readonly path:   string;
	readonly reason: string;
	constructor(path: string, reason: string) {
		super(
			`artifacts: LinkML metamodel schema asset validation failed:\n` +
				`  - ${LINKML_METAMODEL_ASSET}: ${path} (${reason})\n` +
				'Fix: rebuild so src/assets/artifacts/schemas/linkml-metamodel.schema.json ' +
				'ships via copy-assets.mjs into out/assets/artifacts/schemas/.',
		);
		this.name = 'LinkmlMetamodelAssetError';
		this.path = path;
		this.reason = reason;
	}
}

/**
 * Validate the vendored LinkML metamodel schema asset at boot: it must exist, be
 * readable, be non-empty, and parse as a JSON object. Returns silently when
 * sound; otherwise throws LinkmlMetamodelAssetError. Read-only (stat + readFile).
 */
export async function validateLinkmlMetamodelAsset(): Promise<void> {
	const abs = join(artifactSchemaDir(), LINKML_METAMODEL_ASSET);
	try {
		await stat(abs);
	} catch (err) {
		const reason = (err as NodeJS.ErrnoException).code === 'ENOENT' ? 'file not found' : `stat failed: ${(err as Error).message}`;
		throw new LinkmlMetamodelAssetError(abs, reason);
	}
	let body: string;
	try {
		body = await readFile(abs, 'utf8');
	} catch (err) {
		throw new LinkmlMetamodelAssetError(abs, `read failed: ${(err as Error).message}`);
	}
	if (body.trim().length === 0) {
		throw new LinkmlMetamodelAssetError(abs, 'file is empty');
	}
	try {
		const parsed = JSON.parse(body) as unknown;
		if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
			throw new Error('not a JSON object');
		}
	} catch (err) {
		throw new LinkmlMetamodelAssetError(abs, `unparseable schema: ${(err as Error).message}`);
	}
	log.info({ dir: artifactSchemaDir(), asset: LINKML_METAMODEL_ASSET }, 'LinkML metamodel schema asset validated');
}
