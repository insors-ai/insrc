/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Internal types for the sc2 Target-resolution engine (E20260806914cbf5e:S002).
 *
 * The SHARED vocabulary (ResolvedTarget, ConfigSourceLayer, ExternalProtocol)
 * lives in `src/shared/types.ts` — consumers (s3/s4/s5 detectors) import only
 * those + `resolve`. `ConfigSourceMap` is private to this module.
 */

import type { ConfigSourceLayer } from '../../shared/types.js';

/**
 * The merged, precedence-resolved view of a repo's at-rest config sources.
 * Each key maps to its winning value and the layer that value came from, after
 * folding all four sources with the total precedence
 * `k8s > docker > envFile > localConfig`.
 */
export type ConfigSourceMap = Map<string, { value: string; layer: ConfigSourceLayer }>;

/** One key/value pair parsed out of a single config source, tagged with its layer. */
export interface ConfigEntry {
	readonly key:   string;
	readonly value: string;
	readonly layer: ConfigSourceLayer;
}
