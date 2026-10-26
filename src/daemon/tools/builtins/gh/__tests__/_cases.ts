import type { TypedTool } from '../../../call-tool.js';
import * as actions from '../actions.js';
import * as issue from '../issue.js';
import * as pr from '../pr.js';
import * as project from '../project.js';
import * as release from '../release.js';
import * as repo from '../repo.js';

export type GhCase = [TypedTool, Record<string, unknown>, string, { stdout?: string; json?: string }?];

const ISSUE = { number: 7, title: 'a | b', state: 'OPEN', author: { login: 'x' }, assignees: [{ login: 'y' }], labels: [{ name: 'bug' }], body: 'text', url: 'https://github.com/o/r/issues/7', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z', comments: [{ author: { login: 'z' }, body: 'c', createdAt: '2026-01-01T00:00:00Z' }] };
const PR = { number: 3, title: 't', state: 'OPEN', isDraft: false, author: { login: 'x' }, reviewRequests: [{ login: 'r' }], labels: [{ name: 'l' }], baseRefName: 'main', headRefName: 'f', mergeable: 'MERGEABLE', mergeStateStatus: 'CLEAN', body: 'b', url: 'u', additions: 1, deletions: 2, changedFiles: 1 };
/** gh sends a null author for a deleted account */
const GHOST_ISSUE = { ...ISSUE, author: null, comments: [{ author: null, body: 'c' }], body: null };
const GHOST_PR = { ...PR, author: null, body: null, mergeable: null };
const REPO = { nameWithOwner: 'o/r', description: null, visibility: 'PUBLIC', isPrivate: false, isFork: false, isArchived: false, pushedAt: '2026-01-01T00:00:00Z', stargazerCount: 1, forkCount: 0, defaultBranchRef: { name: 'main' }, primaryLanguage: null, url: 'u' };
const REL = { tagName: 'v1', name: 'one', isDraft: false, isPrerelease: false, author: { login: 'a' }, publishedAt: 'p', createdAt: 'c', url: 'u', body: null };
const PROJECT = { number: 2, title: 'p', shortDescription: null, public: true, closed: false, url: 'u', owner: { login: 'o', type: 'User' }, fields: { totalCount: 3 }, items: { totalCount: 4 }, updatedAt: '2026-01-01T00:00:00Z' };
const URL_OUT = 'https://github.com/o/r/pull/3\n';

/** tool, an input that satisfies it, what the fake gh prints, and for gh_run_view what its --json and --log calls print */
export const CASES: GhCase[] = [
	[issue.ghIssueListTool, {}, JSON.stringify([ISSUE])],
	[issue.ghIssueViewTool, { number: 7 }, JSON.stringify(ISSUE)],
	[issue.ghIssueListTool, {}, JSON.stringify([GHOST_ISSUE])],
	[issue.ghIssueViewTool, { number: 7 }, JSON.stringify(GHOST_ISSUE)],
	[issue.ghIssueCreateTool, { title: 't' }, URL_OUT],
	[issue.ghIssueCommentTool, { number: 7, body: 'b' }, URL_OUT],
	[issue.ghIssueEditTool, { number: 7, title: 't' }, ''],
	[issue.ghIssueCloseTool, { number: 7 }, ''],
	[issue.ghIssueReopenTool, { number: 7 }, ''],
	[issue.ghIssueLinkTool, { number: 7, target: '#8' }, URL_OUT],
	[pr.ghPrListTool, {}, JSON.stringify([PR])],
	[pr.ghPrViewTool, { number: 3 }, JSON.stringify(PR)],
	[pr.ghPrDiffTool, { number: 3 }, 'diff --git a/x b/x\n+y\n'],
	[pr.ghPrChecksTool, { number: 3 }, JSON.stringify({ number: 3, statusCheckRollup: [{ name: 'ci', status: 'COMPLETED', conclusion: 'SUCCESS' }, { state: 'SUCCESS' }] })],
	[pr.ghPrFilesTool, { number: 3 }, JSON.stringify({ files: [{ path: 'a.ts', additions: 1, deletions: 0 }] })],
	[pr.ghPrListTool, {}, JSON.stringify([GHOST_PR])],
	[pr.ghPrViewTool, { number: 3 }, JSON.stringify(GHOST_PR)],
	[pr.ghPrCreateTool, { title: 't' }, URL_OUT],
	[pr.ghPrEditTool, { number: 3, title: 't' }, ''],
	[pr.ghPrCommentTool, { number: 3, body: 'b' }, URL_OUT],
	[pr.ghPrReviewTool, { number: 3, event: 'approve' }, ''],
	[pr.ghPrMergeTool, { number: 3, method: 'squash' }, 'merged'],
	[pr.ghPrCloseTool, { number: 3 }, ''],
	[pr.ghPrReadyTool, { number: 3 }, ''],
	[repo.ghRepoViewTool, {}, JSON.stringify(REPO)],
	[repo.ghRepoListTool, {}, JSON.stringify([REPO])],
	[repo.ghRepoCreateTool, { name: 'o/r', visibility: 'private' }, 'https://github.com/o/r\n'],
	[repo.ghRepoForkTool, { repo: 'o/r' }, 'forked'],
	[repo.ghRepoCloneTool, { repo: 'o/r' }, 'cloned'],
	[release.ghReleaseListTool, {}, 'one\tLatest\tv1\t2026-01-01\n'],
	[release.ghReleaseViewTool, { tag: 'v1' }, JSON.stringify(REL)],
	[release.ghReleaseCreateTool, { tag: 'v1' }, 'https://github.com/o/r/releases/v1\n'],
	[release.ghReleaseEditTool, { tag: 'v1', title: 't' }, ''],
	[release.ghReleasePublishTool, { tag: 'v1' }, ''],
	[project.ghProjectListTool, { owner: 'o' }, JSON.stringify({ projects: [PROJECT] })],
	[project.ghProjectViewTool, { number: 2 }, JSON.stringify(PROJECT)],
	[project.ghProjectItemListTool, { number: 2 }, JSON.stringify({ items: [{ id: 'i', title: 't', content: { type: 'Issue', number: 1, title: 't', url: 'u' }, fieldValues: { nodes: [{ a: 1 }] } }, { id: 'd' }] })],
	[project.ghProjectItemAddTool, { number: 2, url: 'https://github.com/o/r/issues/1' }, ''],
	[project.ghProjectItemUpdateTool, { projectId: 'p', itemId: 'i', fieldId: 'f', value: 'v' }, ''],
	[project.ghProjectItemArchiveTool, { number: 2, itemId: 'i' }, ''],
	[project.ghProjectFieldListTool, { number: 2 }, JSON.stringify({ fields: [{ id: 'f', name: 'Status', type: 'SINGLE_SELECT', options: [{ id: 'o', name: 'Todo' }] }] })],
	[actions.ghRunListTool, {}, JSON.stringify([{ databaseId: 9, number: 1, name: 'ci', workflowName: 'ci', conclusion: null, status: 'queued', headBranch: 'main' }])],
	[actions.ghRunViewTool, { runId: 9 }, '', { stdout: 'build\tCompile\tlog line\n', json: JSON.stringify({ jobs: [{ name: 'build', status: 'completed', conclusion: 'failure' }], status: 'completed', conclusion: 'failure', workflowName: 'ci', headBranch: 'main' }) }],
	[actions.ghRunRerunTool, { runId: 9 }, ''],
	[actions.ghRunCancelTool, { runId: 9 }, ''],
	[actions.ghWorkflowListTool, {}, 'ci\tactive\t123\n'],
	[actions.ghWorkflowRunTool, { workflow: 'ci.yml' }, ''],
	[repo.ghRepoDeleteTool, { repo: 'o/r' }, ''],
	[release.ghReleaseDeleteTool, { tag: 'v1' }, ''],
	[project.ghProjectItemDeleteTool, { number: 2, itemId: 'i' }, ''],
];

