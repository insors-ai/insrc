/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Session-aware repo resolution for the step handlers that run in the daemon
 * (Epic c2ba6fa6, Story s11). A copy of src/mcp/resolve-repo.ts, which stays
 * for the MCP server's own docgen and approve tools; this one is for the moved
 * handlers, so no daemon module imports the MCP server's resolver.
 *
 * Resolution order:
 *   1. explicit non-empty `repo` argument      (caller knows best — wins outright)
 *   2. the registered repo whose path contains the caller's cwd  (per-session workspace)
 *   3. the caller's INSRC_REPO                 (headless/cron fallback, unchanged)
 *
 * Inside a step call the caller's cwd and INSRC_REPO come from the step
 * context; outside one, from this process (see src/shared/step-context.ts).
 *   4. undefined                               (callers raise their existing no-repo error)
 *
 * Why this fixes cross-repo use: the MCP stdio server is spawned per-session
 * with the session workspace as its CWD, but INSRC_REPO is a STATIC global env
 * shared by every spawned process — so two sessions in two repos both defaulted
 * to the same pinned repo. Consulting the session CWD (matched against the
 * daemon's live multi-repo registry) makes resolution correct per-session.
 *
 * The CWD→repo containment match itself lives daemon-side (`repo.resolveForCwd`),
 * next to the registry that owns the paths — this resolver is a thin async
 * caller, through the installed step daemon client (in the daemon, the
 * request handler called in-process). A broken/unreachable daemon surfaces its error here rather than
 * silently falling through to INSRC_REPO (a broken daemon must not be misread
 * as "the pinned repo"). See `docs/designs/LLD-make-insrc-mcp-server-s-repo-S001.md`.
 */

import { stepDaemonClient } from './daemon-client.js';
import { stepCwd, stepEnvRepo } from '../../shared/step-context.js';

/** Test seam: inject the CWD-containment lookup + the CWD value so the
 *  precedence can be exercised without a live daemon. Defaults are the real
 *  daemon IPC call and the step context's cwd (process.cwd() outside one). */
export interface ResolveRepoDeps {
	readonly resolveForCwd?: ((cwd: string) => Promise<string | null>) | undefined;
	readonly cwd?: string | undefined;
}

/** Test seam: globally override the daemon CWD-containment lookup so
 *  handler-level tests (which cannot thread `deps`) can exercise resolution
 *  without a live daemon. Call with no argument to restore the real IPC call. */
let _resolveForCwdOverride: ((cwd: string) => Promise<string | null>) | undefined;
export function _setResolveForCwdForTests(fn?: (cwd: string) => Promise<string | null>): void {
	_resolveForCwdOverride = fn;
}

/** Resolve the session repo path, or undefined when nothing matches.
 *  Async because the CWD-containment branch consults the daemon registry. */
export async function resolveRepoPath(explicit: string | undefined, deps: ResolveRepoDeps = {}): Promise<string | undefined> {
	if (explicit !== undefined && explicit.length > 0) return explicit;
	// CWD-containment match against the live registry (daemon-side). Rejection
	// (daemon down) propagates by design — see module header.
	const resolveForCwd = deps.resolveForCwd ?? _resolveForCwdOverride ?? ((cwd: string) => stepDaemonClient().resolveRepoForCwd(cwd));
	const match = await resolveForCwd(deps.cwd ?? stepCwd());
	if (match !== null && match.length > 0) return match;
	return stepEnvRepo();
}
