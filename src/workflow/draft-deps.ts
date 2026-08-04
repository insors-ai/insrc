/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Brainstorm draft-provider resolution (Epic brainstorm S010 — sc/c3+c4).
 *
 * The single place both drive layers (the daemon `workflow.run` path in
 * `daemon/workflow-rpc.ts` and the controller-driven MCP `insrc_workflow_step`
 * path in `mcp/workflow-step/phases/{plan,step}.ts`) resolve the mid-tier
 * provider that the adaptive `elicit` runner drafts one decision per turn with.
 *
 * Resolution goes through the RoleRouter's `brainstorm.decision.draft` role
 * (peripheral → tier `mid`), so it rides the existing CliProvider/Ollama path —
 * never a direct REST backend (k1). Only the `brainstorm` workflow carries a
 * draftProvider; every other workflow resolves to an EMPTY `{}` so its executor
 * drive is byte-identical to before this seam existed.
 */

import { createRoleRouter } from '../analyze/context/role-router.js';
import { loadAnalyzeConfig } from '../config/analyze.js';
import type { RoleId } from '../config/role-taxonomy.js';
import type { ExecutorDeps } from './executor.js';

/** The peripheral/mid reasoning role that drafts one brainstorm decision. */
const DRAFT_ROLE: RoleId = 'brainstorm.decision.draft';

/**
 * Resolve the optional executor deps carrying the mid-tier draft provider for a
 * run. Returns `{}` for every non-brainstorm workflow (no config load, no
 * provider construction — the executor drive stays byte-identical). For
 * `brainstorm`, resolves the `brainstorm.decision.draft` role through the
 * RoleRouter (mid tier, CliProvider/Ollama — no REST) and returns it as the
 * executor's `draftProvider` dep.
 */
export function resolveDraftDeps(workflow: string, repoPath: string): ExecutorDeps {
	if (workflow !== 'brainstorm') return {};
	const cfg = loadAnalyzeConfig();
	const { provider } = createRoleRouter().resolveProviderForRole(DRAFT_ROLE, cfg, repoPath);
	return { draftProvider: provider };
}
