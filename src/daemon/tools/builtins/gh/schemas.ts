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

const NameOnly = Type.Object({ name: Maybe(Type.String()) });

export const GhRepoRowSchema = Type.Object({
  nameWithOwner: Type.String(),
  description: Maybe(Type.String()),
  visibility: Maybe(Type.String()),
  isPrivate: Maybe(Type.Boolean()),
  isFork: Maybe(Type.Boolean()),
  isArchived: Maybe(Type.Boolean()),
  pushedAt: Maybe(Type.String()),
  stargazerCount: Maybe(Type.Number()),
  forkCount: Maybe(Type.Number()),
  defaultBranchRef: Maybe(NameOnly),
  primaryLanguage: Maybe(NameOnly),
  url: Maybe(Type.String()),
});
export const GhRepoListDataSchema = Type.Object({ count: Type.Number(), repos: Type.Array(GhRepoRowSchema) });
export const GhRepoCreateDataSchema = Type.Object({ name: Type.String(), url: Type.String() });
export const GhRepoForkDataSchema = Type.Object({ source: Type.String() });
export const GhRepoNameDataSchema = Type.Object({ repo: Type.String() });
export const GhRepoCloneDataSchema = Type.Object({ repo: Type.String(), dir: Maybe(Type.String()) });

export const GhReleaseRowSchema = Type.Object({
  tagName: Type.String(),
  name: Maybe(Type.String()),
  isDraft: Maybe(Type.Boolean()),
  isPrerelease: Maybe(Type.Boolean()),
  author: Maybe(Login),
  publishedAt: Maybe(Type.String()),
  createdAt: Maybe(Type.String()),
  url: Maybe(Type.String()),
  body: Maybe(Type.String()),
});
export const GhReleaseListDataSchema = Type.Object({ count: Type.Number(), releases: Type.Array(GhReleaseRowSchema) });
export const GhReleaseCreateDataSchema = Type.Object({ tag: Type.String(), url: Type.String() });
export const GhReleaseTagDataSchema = Type.Object({ tag: Type.String() });

const Count = Type.Object({ totalCount: Maybe(Type.Number()) });
export const GhProjectRowSchema = Type.Object({
  number: Type.Number(),
  title: Type.String(),
  shortDescription: Maybe(Type.String()),
  public: Maybe(Type.Boolean()),
  closed: Maybe(Type.Boolean()),
  url: Maybe(Type.String()),
  owner: Maybe(Type.Object({ login: Maybe(Type.String()), type: Maybe(Type.String()) })),
  fields: Maybe(Count),
  items: Maybe(Count),
  updatedAt: Maybe(Type.String()),
});
export const GhProjectListDataSchema = Type.Object({ count: Type.Number(), projects: Type.Array(GhProjectRowSchema) });
export const GhProjectItemRowSchema = Type.Object({
  id: Type.String(),
  title: Maybe(Type.String()),
  content: Maybe(Type.Object({
    title: Maybe(Type.String()), number: Maybe(Type.Number()), url: Maybe(Type.String()), type: Maybe(Type.String()),
  })),
  fieldValues: Maybe(Type.Object({ nodes: Maybe(Type.Array(Type.Record(Type.String(), Type.Unknown()))) })),
});
export const GhProjectItemListDataSchema = Type.Object({ count: Type.Number(), items: Type.Array(GhProjectItemRowSchema) });
export const GhProjectItemAddDataSchema = Type.Object({ number: Type.Number(), url: Type.String() });
export const GhProjectItemUpdateDataSchema = Type.Object({ projectId: Type.String(), itemId: Type.String(), fieldId: Type.String() });
export const GhProjectItemArchiveDataSchema = Type.Object({ projectId: Type.String(), itemId: Type.String(), undo: Type.Boolean() });
export const GhProjectItemDeleteDataSchema = Type.Object({ projectId: Type.String(), itemId: Type.String() });
export const GhProjectFieldListDataSchema = Type.Object({
  number: Type.Number(),
  fields: Type.Array(Type.Object({
    id: Maybe(Type.String()), name: Type.String(), type: Maybe(Type.String()),
    options: Maybe(Type.Array(Type.Object({ id: Maybe(Type.String()), name: Type.String() }))),
  })),
});

export const GhRunRowSchema = Type.Object({
  databaseId: Maybe(Type.Number()),
  number: Maybe(Type.Number()),
  name: Maybe(Type.String()),
  workflowName: Maybe(Type.String()),
  displayTitle: Maybe(Type.String()),
  conclusion: Maybe(Type.String()),
  status: Maybe(Type.String()),
  event: Maybe(Type.String()),
  headBranch: Maybe(Type.String()),
  headSha: Maybe(Type.String()),
  url: Maybe(Type.String()),
  createdAt: Maybe(Type.String()),
  updatedAt: Maybe(Type.String()),
});
export const GhRunListDataSchema = Type.Object({ count: Type.Number(), runs: Type.Array(GhRunRowSchema) });
export const GhRunViewDataSchema = Type.Object({
  runId: Type.Number(),
  jobs: Type.Array(Type.Object({
    name: Type.String(), status: Maybe(Type.String()), conclusion: Maybe(Type.String()), url: Maybe(Type.String()),
  })),
  truncated: Type.Boolean(),
});
export const GhRunIdDataSchema = Type.Object({ runId: Type.Number() });
export const GhWorkflowListDataSchema = Type.Object({
  count: Type.Number(),
  workflows: Type.Array(Type.Object({
    id: Maybe(Type.Number()), name: Type.String(), path: Maybe(Type.String()), state: Maybe(Type.String()),
  })),
});
export const GhWorkflowRunDataSchema = Type.Object({ workflow: Type.String() });

/** What the model reads out of gh's free text: file paths of a diff and job/step names of a run log. */
export const GhDiffFilesSchema = Type.Object({ files: Type.Array(Type.String()) });
export const GhLogStepsSchema = Type.Object({ steps: Type.Array(Type.Object({ job: Type.String(), step: Type.String() })) });
