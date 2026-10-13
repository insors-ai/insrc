/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Session-aware repo resolution for the step handlers that run in the daemon
 * (Epic c2ba6fa6, Story s11). The precedence chain is the one in
 * src/shared/resolve-repo-core.ts, shared with src/mcp/resolve-repo.ts (which
 * the MCP server's own docgen and approve tools keep using); this wrapper only
 * says where the inputs come from on the daemon side:
 *
 *   - the cwd and INSRC_REPO are the CALLER's, from the step context inside a
 *     step call, this process's outside one (src/shared/step-context.ts);
 *   - the cwd-to-repo lookup is the registry's `repo.resolveForCwd`, called
 *     in-process through the installed step daemon client.
 */

import { resolveRepoFrom } from '../../shared/resolve-repo-core.js';
import { stepDaemonClient } from './daemon-client.js';
import { stepCwd, stepEnvRepo } from '../../shared/step-context.js';

/** Test seam: inject the CWD-containment lookup + the CWD value so the
 *  precedence can be exercised without a live daemon. Defaults are the real
 *  daemon IPC call and the step context's cwd (process.cwd() outside one). */
export interface ResolveRepoDeps {
	readonly resolveForCwd?: ((cwd: string) => Promise<string | null>) | undefined;
	readonly cwd?: string | undefined;
}

/** Test seam: globally override the cwd-to-repo lookup, for handler-level tests
 *  that cannot thread `deps`. Call with no argument to restore the real lookup. */
let _resolveForCwdOverride: ((cwd: string) => Promise<string | null>) | undefined;
export function _setResolveForCwdForTests(fn?: (cwd: string) => Promise<string | null>): void {
	_resolveForCwdOverride = fn;
}

/** Resolve the session repo path, or undefined when nothing matches: the
 *  caller's cwd and INSRC_REPO from the step context (this process's outside
 *  a step call), the cwd looked up through the installed daemon client. */
export async function resolveRepoPath(explicit: string | undefined, deps: ResolveRepoDeps = {}): Promise<string | undefined> {
	return resolveRepoFrom(explicit, {
		cwd:           deps.cwd ?? stepCwd(),
		envRepo:       stepEnvRepo(),
		resolveForCwd: deps.resolveForCwd ?? _resolveForCwdOverride ?? ((cwd: string) => stepDaemonClient().resolveRepoForCwd(cwd)),
	});
}
