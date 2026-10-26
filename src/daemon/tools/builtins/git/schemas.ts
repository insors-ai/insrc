/**
 * The typed results of the git tools: one typebox schema per tool result, and the type each schema gives under the
 * name the tool has always exported, so imports keep compiling. A tool that declares one as its outputSchema has its
 * result checked by the executor and can be called through callTool.
 */

import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';

/** Set when a read that only informs the result could not run; the result is otherwise as if it had. */
const warnings = () => Type.Optional(Type.Array(Type.String(), { description: 'Reads that could not run; the result keeps its placeholder for them.' }));

// ---- git_status ------------------------------------------------------------

export const GitStatusEntrySchema = Type.Object({
  path: Type.String(),
  /** For rename / copy operations, the original path. */
  origPath: Type.Optional(Type.String()),
  /** Git porcelain status letter for this side (M / A / D / R / C / U / ?). */
  code: Type.String(),
});
export type GitStatusEntry = Static<typeof GitStatusEntrySchema>;

export const GitStatusDataSchema = Type.Object({
  clean: Type.Boolean(),
  branch: Type.String(),
  upstream: Type.Optional(Type.String()),
  ahead: Type.Optional(Type.Number()),
  behind: Type.Optional(Type.Number()),
  staged: Type.Array(GitStatusEntrySchema),
  unstaged: Type.Array(GitStatusEntrySchema),
  untracked: Type.Array(Type.String()),
  conflicts: Type.Array(GitStatusEntrySchema),
});
export type GitStatusData = Static<typeof GitStatusDataSchema>;

// ---- git_log ---------------------------------------------------------------

export const GitLogCommitSchema = Type.Object({
  sha: Type.String(),
  shortSha: Type.String(),
  author: Type.String(),
  authorEmail: Type.String(),
  /** ISO-8601 author date. */
  date: Type.String(),
  subject: Type.String(),
  /** Commit body, may be empty. Trailing whitespace trimmed. */
  body: Type.String(),
});
export type GitLogCommit = Static<typeof GitLogCommitSchema>;

export const GitLogDataSchema = Type.Object({
  commits: Type.Array(GitLogCommitSchema),
  /** Git revision range actually queried (resolved ref or HEAD). */
  ref: Type.String(),
});
export type GitLogData = Static<typeof GitLogDataSchema>;

// ---- git_diff and git_show -------------------------------------------------

export const GitDiffFileStatSchema = Type.Object({
  path: Type.String(),
  /** Previous path when the file was renamed. */
  origPath: Type.Optional(Type.String()),
  insertions: Type.Number(),
  deletions: Type.Number(),
  /** 'modified' | 'added' | 'deleted' | 'renamed' | 'copied' | 'binary' */
  change: Type.String(),
});
export type GitDiffFileStat = Static<typeof GitDiffFileStatSchema>;

export const GitDiffDataSchema = Type.Object({
  /** Resolved mode label: 'unstaged' | 'staged' | 'range' | 'commit'. */
  mode: Type.String(),
  /** Git revision pair actually diffed (e.g. "HEAD -- worktree"). */
  range: Type.String(),
  files: Type.Array(GitDiffFileStatSchema),
  totalInsertions: Type.Number(),
  totalDeletions: Type.Number(),
  truncated: Type.Boolean(),
  /** Bytes of diff body returned. */
  diffBytes: Type.Number(),
});
export type GitDiffData = Static<typeof GitDiffDataSchema>;

export const GitShowDataSchema = Type.Object({
  sha: Type.String(),
  shortSha: Type.String(),
  author: Type.String(),
  authorEmail: Type.String(),
  date: Type.String(),
  subject: Type.String(),
  body: Type.String(),
  parents: Type.Array(Type.String()),
  files: Type.Array(GitDiffFileStatSchema),
  totalInsertions: Type.Number(),
  totalDeletions: Type.Number(),
  truncated: Type.Boolean(),
  diffBytes: Type.Number(),
  warnings: warnings(),
});
export type GitShowData = Static<typeof GitShowDataSchema>;

// ---- git_blame -------------------------------------------------------------

export const GitBlameLineSchema = Type.Object({
  line: Type.Number(),
  sha: Type.String(),
  shortSha: Type.String(),
  author: Type.String(),
  authorEmail: Type.String(),
  /** Epoch seconds. */
  authorTime: Type.Number(),
  summary: Type.String(),
  content: Type.String(),
});
export type GitBlameLine = Static<typeof GitBlameLineSchema>;

export const GitBlameDataSchema = Type.Object({
  path: Type.String(),
  ref: Type.String(),
  lines: Type.Array(GitBlameLineSchema),
  /** Per-SHA line count. */
  commits: Type.Array(Type.Object({
    sha: Type.String(), shortSha: Type.String(), author: Type.String(), summary: Type.String(), lineCount: Type.Number(),
  })),
});
export type GitBlameData = Static<typeof GitBlameDataSchema>;

// ---- git_stage -------------------------------------------------------------

export const GitStageOpSchema = Type.Union([Type.Literal('stage'), Type.Literal('unstage')]);
export type GitStageOp = Static<typeof GitStageOpSchema>;

export const GitStageDataSchema = Type.Object({
  op: GitStageOpSchema,
  paths: Type.Array(Type.String()),
  /** Paths that still had changes in the index after the op (for visibility). */
  indexAfter: Type.Array(Type.String()),
  warnings: warnings(),
});
export type GitStageData = Static<typeof GitStageDataSchema>;

// ---- the other tools -------------------------------------------------------

const lits = <T extends string>(...v: T[]) => Type.Union(v.map(x => Type.Literal(x)));

export const GitBranchEntrySchema = Type.Object({
  name: Type.String(),
  current: Type.Boolean(),
  /** Upstream (e.g. `origin/main`) when tracking. */
  upstream: Type.Optional(Type.String()),
  /** Last commit on this branch -- short SHA. */
  shortSha: Type.String(),
  /** Last commit subject. */
  subject: Type.String(),
});
export type GitBranchEntry = Static<typeof GitBranchEntrySchema>;
export const GitBranchDataSchema = Type.Object({
  op: lits('list', 'create', 'switch', 'delete'),
  branches: Type.Optional(Type.Array(GitBranchEntrySchema)),
  /** For create / switch / delete: the affected branch name. */
  target: Type.Optional(Type.String()),
  /** For switch: the previous branch (for easy revert). */
  previous: Type.Optional(Type.String()),
  warnings: warnings(),
});
export type GitBranchData = Static<typeof GitBranchDataSchema>;

export const GitTagEntrySchema = Type.Object({
  name: Type.String(),
  /** Annotated tag subject if present, or commit subject. */
  subject: Type.String(),
  shortSha: Type.String(),
});
export type GitTagEntry = Static<typeof GitTagEntrySchema>;
export const GitTagDataSchema = Type.Object({
  op: lits('list', 'create', 'delete'),
  tags: Type.Optional(Type.Array(GitTagEntrySchema)),
  target: Type.Optional(Type.String()),
});
export type GitTagData = Static<typeof GitTagDataSchema>;

export const GitRemoteEntrySchema = Type.Object({ name: Type.String(), fetchUrl: Type.String(), pushUrl: Type.String() });
export type GitRemoteEntry = Static<typeof GitRemoteEntrySchema>;
export const GitRemoteDataSchema = Type.Object({
  op: lits('list', 'add', 'remove', 'set-url', 'rename'),
  remotes: Type.Optional(Type.Array(GitRemoteEntrySchema)),
  name: Type.Optional(Type.String()),
  url: Type.Optional(Type.String()),
  newName: Type.Optional(Type.String()),
});
export type GitRemoteData = Static<typeof GitRemoteDataSchema>;

export const GitStashEntrySchema = Type.Object({ ref: Type.String(), branch: Type.String(), message: Type.String() });
export type GitStashEntry = Static<typeof GitStashEntrySchema>;
export const GitStashDataSchema = Type.Object({
  op: lits('list', 'push', 'pop', 'apply', 'drop', 'clear', 'show'),
  entries: Type.Optional(Type.Array(GitStashEntrySchema)),
  affectedRef: Type.Optional(Type.String()),
  output: Type.String(),
});
export type GitStashData = Static<typeof GitStashDataSchema>;

export const GitWorktreeEntrySchema = Type.Object({
  path: Type.String(),
  head: Type.String(),
  branch: Type.Optional(Type.String()),
  detached: Type.Boolean(),
  locked: Type.Boolean(),
  prunable: Type.Boolean(),
});
export type GitWorktreeEntry = Static<typeof GitWorktreeEntrySchema>;
export const GitWorktreeDataSchema = Type.Object({
  op: lits('list', 'add', 'remove', 'move', 'prune'),
  worktrees: Type.Optional(Type.Array(GitWorktreeEntrySchema)),
  path: Type.Optional(Type.String()),
  branch: Type.Optional(Type.String()),
  newPath: Type.Optional(Type.String()),
});
export type GitWorktreeData = Static<typeof GitWorktreeDataSchema>;

export const GitCheckoutDataSchema = Type.Object({
  mode: lits('ref', 'path'),
  ref: Type.Optional(Type.String()),
  paths: Type.Optional(Type.Array(Type.String())),
  previous: Type.Optional(Type.String()),
  warnings: warnings(),
});
export type GitCheckoutData = Static<typeof GitCheckoutDataSchema>;

export const GitResetDataSchema = Type.Object({
  mode: lits('soft', 'mixed', 'hard'),
  ref: Type.String(),
  branch: Type.String(),
  previousShortSha: Type.String(),
  requiresForcePush: Type.Boolean(),
  warnings: warnings(),
});
export type GitResetData = Static<typeof GitResetDataSchema>;

export const GitPushDataSchema = Type.Object({
  remote: Type.String(),
  ref: Type.String(),
  pushed: Type.Boolean(),
  shortSha: Type.String(),
  forceMode: Type.Optional(lits('none', 'lease', 'raw')),
  warnings: warnings(),
});
export type GitPushData = Static<typeof GitPushDataSchema>;

export const GitCommitDataSchema = Type.Object({
  sha: Type.String(),
  shortSha: Type.String(),
  branch: Type.String(),
  filesChanged: Type.Number(),
  insertions: Type.Number(),
  deletions: Type.Number(),
  message: Type.String(),
  warnings: warnings(),
});
export type GitCommitData = Static<typeof GitCommitDataSchema>;

export const GitAmendDataSchema = Type.Object({
  sha: Type.String(),
  shortSha: Type.String(),
  branch: Type.String(),
  mode: lits('message', 'staged'),
  message: Type.String(),
  /** True when HEAD was already pushed to the tracked upstream before the amend. */
  requiresForcePush: Type.Boolean(),
  warnings: warnings(),
});
export type GitAmendData = Static<typeof GitAmendDataSchema>;

export const GitPullDataSchema = Type.Object({
  remote: Type.String(),
  branch: Type.String(),
  mode: lits('ff-only', 'merge', 'rebase'),
  /** Stdout/stderr from git pull -- free-form. */
  output: Type.String(),
});
export type GitPullData = Static<typeof GitPullDataSchema>;

export const GitFetchDataSchema = Type.Object({
  remote: Type.String(),
  /** Individual update lines parsed from stderr (e.g. "  abc..def  main -> origin/main"). */
  updates: Type.Array(Type.String()),
  /** Raw stderr so the caller can inspect pruned / forced updates if interested. */
  raw: Type.String(),
});
export type GitFetchData = Static<typeof GitFetchDataSchema>;

export const GitMergeDataSchema = Type.Object({
  ref: Type.String(),
  branch: Type.String(),
  strategy: lits('ff-only', 'no-ff', 'default', 'squash'),
  merged: Type.Boolean(),
  inConflict: Type.Boolean(),
  conflicts: Type.Array(Type.String()),
  warnings: warnings(),
});
export type GitMergeData = Static<typeof GitMergeDataSchema>;

export const GitRebaseDataSchema = Type.Object({
  op: lits('start', 'continue', 'abort', 'skip'),
  onto: Type.Optional(Type.String()),
  branch: Type.String(),
  inConflict: Type.Boolean(),
  conflicts: Type.Array(Type.String()),
  /** HEAD short SHA after the rebase (success only). */
  shortSha: Type.Optional(Type.String()),
  warnings: warnings(),
});
export type GitRebaseData = Static<typeof GitRebaseDataSchema>;

export const GitRevertDataSchema = Type.Object({
  op: lits('start', 'continue', 'abort', 'skip'),
  refs: Type.Array(Type.String()),
  inConflict: Type.Boolean(),
  conflicts: Type.Array(Type.String()),
  warnings: warnings(),
});
export type GitRevertData = Static<typeof GitRevertDataSchema>;

export const GitCherryPickDataSchema = Type.Object({
  op: lits('start', 'continue', 'abort', 'skip'),
  refs: Type.Array(Type.String()),
  inConflict: Type.Boolean(),
  conflicts: Type.Array(Type.String()),
  warnings: warnings(),
});
export type GitCherryPickData = Static<typeof GitCherryPickDataSchema>;

// ---- the new read tools ----------------------------------------------------

export const GitRevParseDataSchema = Type.Object({ values: Type.Array(Type.String()) });
export type GitRevParseData = Static<typeof GitRevParseDataSchema>;

export const GitRevListDataSchema = Type.Union([
  Type.Object({ commits: Type.Array(Type.String()) }),
  Type.Object({ count: Type.Number() }),
]);
export type GitRevListData = Static<typeof GitRevListDataSchema>;

export const GitLsFilesDataSchema = Type.Object({ files: Type.Array(Type.String()) });
export type GitLsFilesData = Static<typeof GitLsFilesDataSchema>;

export const GitTreeEntrySchema = Type.Object({ mode: Type.String(), type: lits('blob', 'tree', 'commit'), sha: Type.String(), path: Type.String() });
export const GitLsTreeDataSchema = Type.Union([
  Type.Object({ entries: Type.Array(GitTreeEntrySchema) }),
  Type.Object({ names: Type.Array(Type.String()) }),
]);
export type GitLsTreeData = Static<typeof GitLsTreeDataSchema>;

export const GitCatFileObjectSchema = Type.Object({
  rev: Type.String(),
  exists: Type.Boolean(),
  sha: Type.Optional(Type.String()),
  type: Type.Optional(Type.String()),
  size: Type.Optional(Type.Number()),
  /** The object's bytes as UTF-8 text (encoding 'utf8'). */
  content: Type.Optional(Type.String()),
  /** The object's bytes, base64 (encoding 'base64'): lossless for binary. */
  contentBase64: Type.Optional(Type.String()),
});
export const GitCatFileDataSchema = Type.Union([
  Type.Object({ objects: Type.Array(GitCatFileObjectSchema) }),
  Type.Object({ type: Type.String(), size: Type.Number() }),
  Type.Object({ exists: Type.Boolean() }),
]);
export type GitCatFileData = Static<typeof GitCatFileDataSchema>;

export const GitForEachRefDataSchema = Type.Object({ refs: Type.Array(Type.Record(Type.String(), Type.String())) });
export type GitForEachRefData = Static<typeof GitForEachRefDataSchema>;

export const GitSymbolicRefDataSchema = Type.Object({ target: Type.Union([Type.String(), Type.Null()]) });
export type GitSymbolicRefData = Static<typeof GitSymbolicRefDataSchema>;

export const GitShowRefDataSchema = Type.Object({ refs: Type.Array(Type.Object({ sha: Type.String(), name: Type.String() })) });
export type GitShowRefData = Static<typeof GitShowRefDataSchema>;

export const GitMergeBaseDataSchema = Type.Union([
  Type.Object({ bases: Type.Array(Type.String()) }),
  Type.Object({ isAncestor: Type.Boolean() }),
]);
export type GitMergeBaseData = Static<typeof GitMergeBaseDataSchema>;

export const GitHashObjectDataSchema = Type.Object({ sha: Type.String() });
export type GitHashObjectData = Static<typeof GitHashObjectDataSchema>;

export const GitPathHistoryDataSchema = Type.Object({
  commits: Type.Array(Type.Object({ sha: Type.String(), committerTime: Type.String(), subject: Type.Optional(Type.String()) })),
});
export type GitPathHistoryData = Static<typeof GitPathHistoryDataSchema>;

export const GitFetchRefsDataSchema = Type.Object({
  updated: Type.Array(Type.Object({ ref: Type.String(), old: Type.String(), new: Type.String() })),
});
export type GitFetchRefsData = Static<typeof GitFetchRefsDataSchema>;

export const GitConfigDataSchema = Type.Object({ found: Type.Boolean(), value: Type.Optional(Type.String()) });
export type GitConfigData = Static<typeof GitConfigDataSchema>;

export const GitLsRemoteDataSchema = Type.Object({
  entries: Type.Array(Type.Object({ objectId: Type.String(), ref: Type.String() })),
  symrefs: Type.Array(Type.Object({ ref: Type.String(), target: Type.String() })),
});
export type GitLsRemoteData = Static<typeof GitLsRemoteDataSchema>;

export const GitUpdateRefDataSchema = Type.Object({ ref: Type.String(), deleted: Type.Literal(true) });
export type GitUpdateRefData = Static<typeof GitUpdateRefDataSchema>;

export const GitRmDataSchema = Type.Object({ paths: Type.Array(Type.String()) });
export type GitRmData = Static<typeof GitRmDataSchema>;
