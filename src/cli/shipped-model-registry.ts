/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * TUI stopgap (Epic ce99b72065d03b1b, s3): a model registry over the shipped
 * definitions only, with no approved-model profiles, so the TUI's two tier
 * resolution callers (the model-tiers pane and the review command) never read
 * the user's store (k2). s5 removes it when those callers move to
 * models.definitions / models.resolveRole.
 */

import { SHIPPED_DEFINITIONS } from '../config/model-defaults.js';
import { buildModelRegistry, type ModelRegistry } from '../daemon/model-registry.js';

let cached: ModelRegistry | undefined;

/** The registry over the shipped definitions file and no approved profiles. */
export function shippedModelRegistry(): ModelRegistry {
	cached ??= buildModelRegistry(SHIPPED_DEFINITIONS, []);
	return cached;
}
