/**
 * The five multi-operation tools with the operations they lacked (Story s8): git_stash, git_worktree, git_remote,
 * git_branch and git_tag, each widened by extendGitTool. Every input that was valid before is valid now and runs the old
 * code with the old class; the new operations are new values of `op`.
 *
 * A new operation does not reuse a field of the old schema that has no safety pattern (the old `name`, `url`, `ref`): it
 * has its own field with the pattern (`remote`, `branchName`, `tagName`, `commit`...), so that an input that cannot be run
 * is refused by the schema before an approval is asked. The few fields it does share with the old schema (`force`, `push`,
 * `message`, `path`, the stash `ref`) are declared exactly as the old schema declares them.
 */

import { Type } from '@sinclair/typebox';
import { field } from '../gh/op-table.js';
import type { FieldSpec } from '../gh/op-table.js';
import { extendGitTool } from './op-table.js';
import type { GitOpSpec } from './op-table.js';
import { SAFE_REF, SAFE_REFS_REF, SAFE_REV } from './safe-args.js';
import { gitBranchTool } from './branch.js';
import { gitRemoteTool } from './remote.js';
import { gitStashTool } from './stash.js';
import { gitTagTool } from './tag.js';
import { gitWorktreeTool } from './worktree.js';

const refName = (description: string): FieldSpec => ({ ...field.str(description), pattern: SAFE_REF });
const rev = (description: string): FieldSpec => ({ ...field.str(description), pattern: SAFE_REV });
/** A string exactly as the old schemas declare theirs: any text, empty allowed. */
const plain = (description: string): FieldSpec => ({ kind: 'string', empty: true, description });
const noDash = (description: string): FieldSpec => ({ ...field.str(description), pattern: '^(?!-)[^\\u0000]+$' });
const flag = (on: unknown, ...words: string[]): string[] => (on === true ? words : []);
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
const text = (v: unknown): string | undefined => (typeof v === 'string' && v.length > 0 ? v : undefined);

const op = (name: string, rest: Omit<GitOpSpec, 'name' | 'timeoutMs'> & { timeoutMs?: number }): GitOpSpec => ({ timeoutMs: 60_000, ...rest, name });

// ---- git_stash ----------------------------------------------------------------------------------------------------

export const STASH_EXTRA_OPS: readonly GitOpSpec[] = [
  op('branch', {
    cls: 'common',
    fields: { branchName: refName('The branch to create from the stash and apply it on.'), ref: plain('The stash entry (default stash@{0}).') },
    required: ['branchName'], refs: ['ref'], notice: 'The stash entry is dropped once it is applied.',
    argv: i => ['stash', 'branch', String(i['branchName']), ...(text(i['ref']) !== undefined ? [text(i['ref'])!] : [])],
  }),
  op('create', {
    cls: 'common', fields: { message: plain('The message of the stash commit.') },
    answer: { sha: Type.String() }, parse: run => ({ sha: run.stdout.trim() }),
    argv: i => ['stash', 'create', ...(text(i['message']) !== undefined ? [text(i['message'])!] : [])],
  }),
  op('store', {
    cls: 'common', fields: { commit: rev('The stash commit made by create.'), message: plain('The message of the stash entry.') },
    required: ['commit'], refs: ['commit'],
    argv: i => ['stash', 'store', ...(text(i['message']) !== undefined ? ['-m', text(i['message'])!] : []), String(i['commit'])],
  }),
  op('export', {
    cls: 'common', fields: { toRef: { ...field.str('The ref to write the exported stash chain to.'), pattern: SAFE_REFS_REF }, ref: plain('The stash entries to export (default all).') },
    required: ['toRef'], refs: ['ref'],
    argv: i => ['stash', 'export', '--to-ref', String(i['toRef']), ...(text(i['ref']) !== undefined ? [text(i['ref'])!] : [])],
  }),
  op('import', {
    cls: 'common', fields: { commit: rev('A commit made by stash export.') }, required: ['commit'], refs: ['commit'],
    argv: i => ['stash', 'import', String(i['commit'])],
  }),
];

// ---- git_worktree -------------------------------------------------------------------------------------------------

const wtPath = (description: string): FieldSpec => plain(description);
export const WORKTREE_EXTRA_OPS: readonly GitOpSpec[] = [
  op('lock', {
    cls: 'common', fields: { path: wtPath('The worktree to lock.'), reason: field.str('Why it is locked.') }, required: ['path'], paths: ['path'],
    argv: i => ['worktree', 'lock', ...(text(i['reason']) !== undefined ? ['--reason', text(i['reason'])!] : []), String(i['path'])],
  }),
  op('unlock', {
    cls: 'common', fields: { path: wtPath('The worktree to unlock.') }, required: ['path'], paths: ['path'],
    argv: i => ['worktree', 'unlock', String(i['path'])],
  }),
  op('repair', {
    cls: 'common', fields: { repairPaths: field.strs('Worktrees whose links to repair (default: the ones git knows).') }, paths: ['repairPaths'],
    argv: i => ['worktree', 'repair', ...list(i['repairPaths'])],
  }),
];

// ---- git_remote ---------------------------------------------------------------------------------------------------

export const REMOTE_EXTRA_OPS: readonly GitOpSpec[] = [
  op('show', {
    cls: 'none', timeoutMs: 120_000, fields: { remote: refName('The remote.'), query: field.bool('Ask the remote itself (needs the network); default: what is stored here.') },
    required: ['remote'],
    argv: i => ['remote', 'show', ...(i['query'] === true ? [] : ['-n']), String(i['remote'])],
  }),
  op('prune', {
    cls: i => (i['dryRun'] === true ? 'none' : 'destructive'), mutating: true, timeoutMs: 120_000,
    fields: { remote: refName('The remote.'), dryRun: field.bool('Only report what would be deleted.') }, required: ['remote'],
    notice: 'Remote-tracking branches that are gone from the remote are deleted.',
    argv: i => ['remote', 'prune', ...flag(i['dryRun'], '--dry-run'), String(i['remote'])],
  }),
  op('update', {
    cls: 'common', timeoutMs: 600_000, fields: { remotes: field.strs('The remotes or groups to fetch (default: all).'), pruneRefs: field.bool('Also prune stale remote-tracking branches.') }, refs: ['remotes'],
    argv: i => ['remote', 'update', ...flag(i['pruneRefs'], '--prune'), ...list(i['remotes'])],
  }),
  op('set-head', {
    cls: 'common', timeoutMs: 120_000,
    fields: { remote: refName('The remote.'), headBranch: refName('The branch to make the remote HEAD.'), auto: field.bool('Ask the remote which branch its HEAD is.'), deleteHead: field.bool('Remove the remote HEAD.') },
    required: ['remote'], oneOf: [['headBranch', 'auto', 'deleteHead']],
    argv: i => ['remote', 'set-head', String(i['remote']), i['auto'] === true ? '--auto' : i['deleteHead'] === true ? '--delete' : String(i['headBranch'])],
  }),
  op('set-branches', {
    cls: 'common', fields: { remote: refName('The remote.'), branches: field.strs('The branches to track.'), addBranches: field.bool('Add to the tracked branches instead of replacing them.') },
    required: ['remote', 'branches'], refs: ['branches'],
    argv: i => ['remote', 'set-branches', ...flag(i['addBranches'], '--add'), String(i['remote']), ...list(i['branches'])],
  }),
  op('set-url-add', {
    cls: 'common', fields: { remote: refName('The remote.'), newUrl: noDash('The url to add.'), push: field.bool('Change the push urls (--push).') }, required: ['remote', 'newUrl'],
    argv: i => ['remote', 'set-url', '--add', ...flag(i['push'], '--push'), String(i['remote']), String(i['newUrl'])],
  }),
  op('set-url-delete', {
    cls: 'common', fields: { remote: refName('The remote.'), urlPattern: noDash('A regular expression the urls to delete match.'), push: field.bool('Change the push urls (--push).') }, required: ['remote', 'urlPattern'],
    argv: i => ['remote', 'set-url', '--delete', ...flag(i['push'], '--push'), String(i['remote']), String(i['urlPattern'])],
  }),
];

// ---- git_branch ---------------------------------------------------------------------------------------------------

export const BRANCH_EXTRA_OPS: readonly GitOpSpec[] = [
  op('rename', {
    cls: i => (i['force'] === true ? 'destructive' : 'common'), fields: { fromName: refName('The branch to rename (default: the current one).'), toName: refName('The new name.'), force: field.bool('For delete: use -D to remove unmerged branches. Use with care.') },
    required: ['toName'], notice: 'force overwrites an existing branch of the new name.',
    argv: i => ['branch', i['force'] === true ? '-M' : '-m', ...(text(i['fromName']) !== undefined ? [text(i['fromName'])!] : []), String(i['toName'])],
  }),
  op('copy', {
    cls: i => (i['force'] === true ? 'destructive' : 'common'), fields: { fromName: refName('The branch to copy (default: the current one).'), toName: refName('The name of the copy.'), force: field.bool('For delete: use -D to remove unmerged branches. Use with care.') },
    required: ['toName'], notice: 'force overwrites an existing branch of the new name.',
    argv: i => ['branch', i['force'] === true ? '-C' : '-c', ...(text(i['fromName']) !== undefined ? [text(i['fromName'])!] : []), String(i['toName'])],
  }),
  op('set-upstream-to', {
    cls: 'common', fields: { branchName: refName('The branch (default: the current one).'), upstream: rev('The upstream, e.g. origin/main.') }, required: ['upstream'],
    argv: i => ['branch', `--set-upstream-to=${String(i['upstream'])}`, ...(text(i['branchName']) !== undefined ? [text(i['branchName'])!] : [])],
  }),
  op('unset-upstream', {
    cls: 'common', fields: { branchName: refName('The branch (default: the current one).') },
    argv: i => ['branch', '--unset-upstream', ...(text(i['branchName']) !== undefined ? [text(i['branchName'])!] : [])],
  }),
  op('edit-description', {
    // git branch --edit-description opens an editor; the description is the config value branch.<name>.description
    cls: 'common', okCodes: [0, 5], fields: { branchName: refName('The branch.'), description: field.str('The description; empty removes it.', true) }, required: ['branchName', 'description'],
    argv: i => (text(i['description']) !== undefined ? ['config', `branch.${String(i['branchName'])}.description`, String(i['description'])] : ['config', '--unset', `branch.${String(i['branchName'])}.description`]),
  }),
];

// ---- git_tag ------------------------------------------------------------------------------------------------------

export const TAG_EXTRA_OPS: readonly GitOpSpec[] = [
  op('verify', {
    cls: 'none', okCodes: [0, 1], fields: { tagNames: field.strs('The tags to verify.') }, required: ['tagNames'], refs: ['tagNames'],
    answer: { verified: Type.Boolean(), text: Type.String() }, parse: run => ({ verified: run.code === 0, text: `${run.stdout}${run.stderr}`.trim() }),
    argv: i => ['tag', '-v', ...list(i['tagNames'])],
  }),
  op('sign', {
    cls: 'common', fields: { tagName: refName('The tag to create.'), target: rev('The commit to tag (default HEAD).'), message: plain('The tag message.'), key: field.str('The key to sign with (default: the configured one).') },
    required: ['tagName', 'message'], refs: ['key'],
    argv: i => ['tag', '-s', ...(text(i['key']) !== undefined ? ['-u', text(i['key'])!] : []), '-m', String(i['message']), String(i['tagName']), ...(text(i['target']) !== undefined ? [text(i['target'])!] : [])],
  }),
];

export const gitStashExtended = extendGitTool(gitStashTool, STASH_EXTRA_OPS);
export const gitWorktreeExtended = extendGitTool(gitWorktreeTool, WORKTREE_EXTRA_OPS);
export const gitRemoteExtended = extendGitTool(gitRemoteTool, REMOTE_EXTRA_OPS);
export const gitBranchExtended = extendGitTool(gitBranchTool, BRANCH_EXTRA_OPS);
export const gitTagExtended = extendGitTool(gitTagTool, TAG_EXTRA_OPS);
