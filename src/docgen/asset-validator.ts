/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * docgen — boot-time runtime-asset validator (Epic 870ed3dd, Story s7).
 *
 * Modelled on src/analyze/context/boot-validator.ts: asserts the docgen runtime
 * assets (runtime.json + the two bundles it references) exist + are non-empty
 * BEFORE the daemon serves requests, so a mis-staged asset in an installed build
 * is a fail-fast startup refusal (the daemon logs + exits cleanly) rather than a
 * silent generation-time fallbackUnavailable. Every failure is collected into a
 * single typed throw carrying one actionable 'Fix:' line naming the copy-assets
 * ship step.
 *
 * Reads via the SAME resolver loadRuntime uses (docgenAssetDir /
 * resolveDocgenRuntimeManifest from render/shell.ts), so the validator and the
 * renderer can never disagree about the asset location. Read-only: stat +
 * readFile only — no mutation, no network, no new asset-shipping path (the
 * recursive copy-assets.mjs remains the ONE path).
 */

import { stat, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { getLogger } from '../shared/logger.js';
import { docgenAssetDir, resolveDocgenRuntimeManifest } from './render/shell.js';

const log = getLogger('docgen:asset-validator');

/** One failed docgen runtime-asset component. */
export interface DocgenAssetFailure {
	readonly componentId: string;   // 'runtime.json' | the bundle filename
	readonly path:        string;
	readonly reason:      string;
}

/** Thrown when one or more docgen runtime assets are missing / unreadable /
 *  empty / malformed. Collects EVERY failure with a single 'Fix:' line so the
 *  operator gets the full picture in one refusal. */
export class DocgenAssetValidationError extends Error {
	readonly missing: readonly DocgenAssetFailure[];

	constructor(missing: DocgenAssetFailure[]) {
		const list = missing.map(m => `  - ${m.componentId}: ${m.path} (${m.reason})`).join('\n');
		super(
			`docgen: runtime asset validation failed:\n${list}\n` +
				'Fix: rebuild so src/assets/docgen/{runtime.json,mermaid.min.js,svg-pan-zoom.min.js} ' +
				'ship via copy-assets.mjs into out/assets/docgen/.',
		);
		this.name = 'DocgenAssetValidationError';
		this.missing = missing;
	}
}

/**
 * Validate the docgen runtime assets. Reads runtime.json via the shared
 * resolver, then stat + non-empty-checks the two bundles it references. Returns
 * silently when all are present + non-empty; otherwise throws a single
 * DocgenAssetValidationError listing every failure (ac1). A malformed/missing
 * manifest short-circuits — without it the bundle set is unknown.
 */
export async function validateDocgenAssets(): Promise<void> {
	const dir = docgenAssetDir();

	let manifest;
	try {
		manifest = await resolveDocgenRuntimeManifest();
	} catch (err) {
		const e = err as NodeJS.ErrnoException;
		const reason = e.code === 'ENOENT'
			? 'file not found'
			: `unreadable or malformed manifest: ${e.message}`;
		throw new DocgenAssetValidationError([{ componentId: 'runtime.json', path: join(dir, 'runtime.json'), reason }]);
	}

	const failures: DocgenAssetFailure[] = [];
	for (const asset of [manifest.mermaidAsset, manifest.svgPanZoomAsset]) {
		const abs = join(dir, asset);
		try {
			await stat(abs);
		} catch (err) {
			failures.push({
				componentId: asset,
				path:        abs,
				reason:      (err as NodeJS.ErrnoException).code === 'ENOENT' ? 'file not found' : `stat failed: ${(err as Error).message}`,
			});
			continue;
		}
		let body: string;
		try {
			body = await readFile(abs, 'utf8');
		} catch (err) {
			failures.push({ componentId: asset, path: abs, reason: `read failed: ${(err as Error).message}` });
			continue;
		}
		if (body.trim().length === 0) {
			failures.push({ componentId: asset, path: abs, reason: 'file is empty' });
		}
	}

	if (failures.length > 0) throw new DocgenAssetValidationError(failures);
	log.info({ dir, assets: [manifest.mermaidAsset, manifest.svgPanZoomAsset] }, 'docgen runtime assets validated');
}
