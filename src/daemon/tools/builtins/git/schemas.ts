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
