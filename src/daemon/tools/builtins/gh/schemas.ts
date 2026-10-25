/**
 * Output schemas of the gh tools: the typebox shape of ToolResult.data. Rows copied from gh keep gh's fields
 * optional beyond the few every row has, so a gh release that adds or drops a field does not fail a call.
 */

import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';

const Login = Type.Object({ login: Type.Optional(Type.String()) });
const Named = Type.Object({ name: Type.String() });

export const GhIssueRowSchema = Type.Object({
  number: Type.Number(),
  title: Type.String(),
  state: Type.String(),
  author: Type.Optional(Login),
  assignees: Type.Optional(Type.Array(Login)),
  labels: Type.Optional(Type.Array(Named)),
  body: Type.Optional(Type.String()),
  url: Type.Optional(Type.String()),
  createdAt: Type.Optional(Type.String()),
  updatedAt: Type.Optional(Type.String()),
  comments: Type.Optional(Type.Array(Type.Object({
    author: Type.Optional(Login), body: Type.String(), createdAt: Type.Optional(Type.String()),
  }))),
});
export type GhIssueRow = Static<typeof GhIssueRowSchema>;

export const GhIssueListDataSchema = Type.Object({ count: Type.Number(), issues: Type.Array(GhIssueRowSchema) });
export const GhIssueCreateDataSchema = Type.Object({ url: Type.String() });
export const GhIssueCommentDataSchema = Type.Object({ number: Type.Number(), url: Type.String() });
export const GhNumberDataSchema = Type.Object({ number: Type.Number() });
export const GhIssueStateDataSchema = Type.Object({ number: Type.Number(), op: Type.Union([Type.Literal('close'), Type.Literal('reopen')]) });
export const GhIssueLinkDataSchema = Type.Object({ number: Type.Number(), target: Type.String(), relation: Type.String() });

export const GhPrRowSchema = Type.Object({
  number: Type.Number(),
  title: Type.String(),
  state: Type.String(),
  isDraft: Type.Optional(Type.Boolean()),
  author: Type.Optional(Login),
  assignees: Type.Optional(Type.Array(Login)),
  reviewRequests: Type.Optional(Type.Array(Type.Object({ login: Type.Optional(Type.String()), name: Type.Optional(Type.String()) }))),
  labels: Type.Optional(Type.Array(Named)),
  baseRefName: Type.Optional(Type.String()),
  headRefName: Type.Optional(Type.String()),
  mergeable: Type.Optional(Type.String()),
  mergeStateStatus: Type.Optional(Type.String()),
  body: Type.Optional(Type.String()),
  url: Type.Optional(Type.String()),
  createdAt: Type.Optional(Type.String()),
  updatedAt: Type.Optional(Type.String()),
  additions: Type.Optional(Type.Number()),
  deletions: Type.Optional(Type.Number()),
  changedFiles: Type.Optional(Type.Number()),
});
export type GhPrRow = Static<typeof GhPrRowSchema>;

export const GhPrListDataSchema = Type.Object({ count: Type.Number(), prs: Type.Array(GhPrRowSchema) });
export const GhPrDiffDataSchema = Type.Object({ number: Type.Number(), diffBytes: Type.Number(), truncated: Type.Boolean() });
export const GhPrCheckSchema = Type.Object({
  name: Type.Optional(Type.String()), state: Type.Optional(Type.String()),
  status: Type.Optional(Type.String()), conclusion: Type.Optional(Type.String()),
});
export const GhPrChecksDataSchema = Type.Object({ number: Type.Number(), checks: Type.Array(GhPrCheckSchema) });
export const GhPrFilesDataSchema = Type.Object({
  number: Type.Number(),
  files: Type.Array(Type.Object({ path: Type.String(), additions: Type.Number(), deletions: Type.Number() })),
});
export const GhPrUrlDataSchema = Type.Object({ url: Type.String() });
export const GhPrReviewDataSchema = Type.Object({ number: Type.Number(), event: Type.String() });
export const GhPrMergeDataSchema = Type.Object({ number: Type.Number(), method: Type.String() });
