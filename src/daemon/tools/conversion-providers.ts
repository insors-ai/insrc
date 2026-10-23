/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Builds the ToolDeps.conversion field: the two text-conversion roles
 * (tools.convert, tools.convert.escalate) resolved through the RoleRouter, so
 * the tier and model follow the user's roleTiers like any other role and no
 * direct REST provider is ever built.
 */

import type { AnalyzeConfig } from '../../config/analyze.js';
import { createRoleRouter, type RoleRouter } from '../../analyze/context/role-router.js';
import type { ConversionProviders } from './types.js';

export function createConversionProviders(
	cfg:      AnalyzeConfig,
	repoPath: string,
	router:   RoleRouter = createRoleRouter(),
): ConversionProviders {
	return {
		resolveProvider: role => router.resolveProviderForRole(role, cfg, repoPath).provider,
	};
}
