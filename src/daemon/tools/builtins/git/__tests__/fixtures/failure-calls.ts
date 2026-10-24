/**
 * The calls whose failure text git-failures.test.ts pins: every operation of every one of the 22 tools, made
 * outside a repository. The baseline of their output was recorded from the commit before Story s4.
 */
export const FAILURE_CALLS: readonly (readonly [string, Record<string, unknown>])[] = [
	['git_status', {}],
	['git_log', {}], ['git_log', { path: 'x', limit: 5 }],
	['git_diff', {}], ['git_diff', { staged: true }], ['git_diff', { from: 'HEAD~1', to: 'HEAD' }],
	['git_show', { ref: 'HEAD' }], ['git_show', { ref: 'HEAD', path: 'x' }],
	['git_blame', { path: 'x' }], ['git_blame', {}],
	['git_branch', { op: 'list' }], ['git_branch', { op: 'create', name: 'b' }], ['git_branch', { op: 'create' }],
	['git_branch', { op: 'switch', name: 'b' }], ['git_branch', { op: 'switch' }],
	['git_branch', { op: 'delete', name: 'b' }], ['git_branch', { op: 'delete' }],
	['git_stage', { op: 'stage', paths: ['x'] }], ['git_stage', { op: 'unstage', paths: ['x'] }], ['git_stage', { op: 'stage', paths: [] }],
	['git_commit', { message: 'm', allowDetached: true }], ['git_commit', {}], ['git_commit', { message: 'm', allowEmpty: true, allowDetached: true }],
	['git_amend', { mode: 'message', message: 'm' }], ['git_amend', { mode: 'message' }], ['git_amend', { mode: 'staged' }],
	['git_push', { remote: 'origin', ref: 'main' }], ['git_push', { remote: 'origin', ref: 'main', force: true, forceToMain: true }],
	['git_push', { remote: 'origin', ref: 'main', force: true }], ['git_push', { remote: 'origin' }],
	['git_pull', { remote: 'origin', ref: 'main' }], ['git_pull', { remote: 'origin' }],
	['git_fetch', {}], ['git_fetch', { remote: 'origin', prune: true }],
	['git_checkout', { mode: 'ref', ref: 'main' }], ['git_checkout', { mode: 'ref' }],
	['git_checkout', { mode: 'path', paths: ['x'] }], ['git_checkout', { mode: 'path' }],
	['git_merge', { ref: 'main' }], ['git_merge', {}], ['git_merge', { abort: true }],
	['git_rebase', { onto: 'main' }], ['git_rebase', {}], ['git_rebase', { op: 'continue' }], ['git_rebase', { op: 'abort' }], ['git_rebase', { op: 'skip' }],
	['git_stash', { op: 'list' }], ['git_stash', { op: 'push' }], ['git_stash', { op: 'show' }], ['git_stash', { op: 'pop' }], ['git_stash', { op: 'drop' }], ['git_stash', { op: 'clear' }],
	['git_reset', { ref: 'HEAD', mode: 'mixed' }], ['git_reset', { mode: 'soft' }],
	['git_revert', { refs: ['HEAD'] }], ['git_revert', {}], ['git_revert', { op: 'abort' }], ['git_revert', { op: 'continue' }],
	['git:cherry-pick', { refs: ['HEAD'] }], ['git:cherry-pick', {}], ['git:cherry-pick', { op: 'abort' }], ['git:cherry-pick', { op: 'continue' }],
	['git_tag', { op: 'list' }], ['git_tag', { op: 'create', name: 't' }], ['git_tag', { op: 'create' }], ['git_tag', { op: 'delete', name: 't' }],
	['git_remote', { op: 'list' }], ['git_remote', { op: 'add', name: 'o', url: 'u' }], ['git_remote', { op: 'add', name: 'o' }],
	['git_remote', { op: 'remove', name: 'o' }], ['git_remote', { op: 'set-url', name: 'o', url: 'u' }], ['git_remote', { op: 'rename', name: 'o', newName: 'p' }],
	['git_worktree', { op: 'list' }], ['git_worktree', { op: 'add', path: 'p' }], ['git_worktree', { op: 'add' }],
	['git_worktree', { op: 'remove', path: 'p' }], ['git_worktree', { op: 'move', path: 'p', newPath: 'q' }], ['git_worktree', { op: 'prune' }],
];
