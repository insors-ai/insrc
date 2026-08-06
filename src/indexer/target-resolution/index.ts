/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * sc2 Target-resolution engine (E20260806914cbf5e:S002) — public surface.
 *
 * Consumers (the outbound detectors s3/s4/s5) import `resolve` here + the shared
 * `ResolvedTarget` / `ExternalProtocol` / `ConfigSourceLayer` types from
 * `shared/types.ts`. Everything else (the parsers, the ConfigSourceMap, the
 * precedence-merge) stays private to this module behind the sc2 boundary.
 */

export { resolve, resolveAgainst, invalidateRepoConfig } from './resolver.js';
export { buildConfigSourceMap } from './config-sources.js';
export type { ConfigSourceMap, ConfigEntry } from './types.js';
