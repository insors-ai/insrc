/**
 * Output schemas of the gh tools: the typebox shape of ToolResult.data. Rows copied from gh keep gh's fields
 * optional beyond the few every row has, so a gh release that adds or drops a field does not fail a call.
 */

import { Type } from '@sinclair/typebox';
import type { Static, TSchema } from '@sinclair/typebox';

/** A field gh may leave out or send as null (a deleted account has no author): both are accepted. */
const Maybe = <T extends TSchema>(t: T) => Type.Optional(Type.Union([t, Type.Null()]));

const Login = Type.Object({ login: Maybe(Type.String()) });
const Named = Type.Object({ name: Type.String() });

export const GhIssueRowSchema = Type.Object({
  number: Type.Number(),
  title: Type.String(),
  state: Type.String(),
  author: Maybe(Login),
  assignees: Maybe(Type.Array(Login)),
  labels: Maybe(Type.Array(Named)),
  body: Maybe(Type.String()),
  url: Maybe(Type.String()),
  createdAt: Maybe(Type.String()),
  updatedAt: Maybe(Type.String()),
  comments: Maybe(Type.Array(Type.Object({
    author: Maybe(Login), body: Type.String(), createdAt: Maybe(Type.String()),
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
  isDraft: Maybe(Type.Boolean()),
  author: Maybe(Login),
  assignees: Maybe(Type.Array(Login)),
  reviewRequests: Maybe(Type.Array(Type.Object({ login: Maybe(Type.String()), name: Maybe(Type.String()) }))),
  labels: Maybe(Type.Array(Named)),
  baseRefName: Maybe(Type.String()),
  headRefName: Maybe(Type.String()),
  mergeable: Maybe(Type.String()),
  mergeStateStatus: Maybe(Type.String()),
  body: Maybe(Type.String()),
  url: Maybe(Type.String()),
  createdAt: Maybe(Type.String()),
  updatedAt: Maybe(Type.String()),
  additions: Maybe(Type.Number()),
  deletions: Maybe(Type.Number()),
  changedFiles: Maybe(Type.Number()),
});
export type GhPrRow = Static<typeof GhPrRowSchema>;

export const GhPrListDataSchema = Type.Object({ count: Type.Number(), prs: Type.Array(GhPrRowSchema) });
export const GhPrDiffDataSchema = Type.Object({ number: Type.Number(), diffBytes: Type.Number(), truncated: Type.Boolean() });
export const GhPrCheckSchema = Type.Object({
  name: Maybe(Type.String()), state: Maybe(Type.String()),
  status: Maybe(Type.String()), conclusion: Maybe(Type.String()),
});
export const GhPrChecksDataSchema = Type.Object({ number: Type.Number(), checks: Type.Array(GhPrCheckSchema) });
export const GhPrFilesDataSchema = Type.Object({
  number: Type.Number(),
  files: Type.Array(Type.Object({ path: Type.String(), additions: Type.Number(), deletions: Type.Number() })),
});
export const GhPrUrlDataSchema = Type.Object({ url: Type.String() });
export const GhPrReviewDataSchema = Type.Object({ number: Type.Number(), event: Type.String() });
export const GhPrMergeDataSchema = Type.Object({ number: Type.Number(), method: Type.String() });
