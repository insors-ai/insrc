// ---------------------------------------------------------------------------
// L1 — System Context
//
// Static per session. Agent persona, active repo, dependency closure.
// Replaces Session.buildSystemPrompt() from Phase 1.
// ---------------------------------------------------------------------------

export interface SystemContextOpts {
  repoPath: string;
  closureRepos: string[];
}

/**
 * Build the L1 system context string.
 * Called once at session start and cached.
 */
export function buildSystemContext(opts: SystemContextOpts): string {
  const repos = opts.closureRepos.length > 1
    ? `Repos in scope: ${opts.closureRepos.join(', ')}`
    : `Repo: ${opts.repoPath}`;

  return [
    'You are insrc, a local-first hybrid coding assistant.',
    'You help developers understand, modify, test, and debug code.',
    'You have access to a Code Knowledge Graph (Kuzu + LanceDB) for structural queries.',
    'Be concise. Cite file paths and line numbers when referencing code.',
    '',
    repos,
  ].join('\n');
}
