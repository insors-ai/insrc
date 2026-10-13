/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The one precedence chain for "which repository does this call mean"
 * (Epic c2ba6fa6, Story s11). The MCP server (docgen, approve) and the daemon's
 * step handlers each supply where their cwd, INSRC_REPO and the cwd-to-repo
 * lookup come from; the order lives here only:
 *
 *   1. an explicit non-empty `repo` argument   (the caller knows best)
 *   2. the registered repo containing the cwd  (per-session workspace)
 *   3. INSRC_REPO                              (headless/cron fallback)
 *   4. undefined                               (callers raise their own no-repo error)
 *
 * A failing lookup (the daemon unreachable) rejects rather than falling
 * through to INSRC_REPO: a broken daemon must not be misread as "the pinned
 * repo".
 */

export interface RepoSources {
	readonly cwd:           string;
	readonly envRepo:       string | undefined;
	readonly resolveForCwd: (cwd: string) => Promise<string | null>;
}

export async function resolveRepoFrom(explicit: string | undefined, sources: RepoSources): Promise<string | undefined> {
	if (explicit !== undefined && explicit.length > 0) return explicit;
	const match = await sources.resolveForCwd(sources.cwd);
	if (match !== null && match.length > 0) return match;
	const env = sources.envRepo;
	return env !== undefined && env.length > 0 ? env : undefined;
}
