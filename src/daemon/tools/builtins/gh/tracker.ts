/**
 * gh_tracker -- the GitHub operations the workflow tracker needs that no other gh tool gives, as one op-table family.
 *
 * Raw `gh api` stays excluded from the gh tools. This family is the one amendment to that (decided 2026-10-26): every op
 * has a FIXED endpoint template or GraphQL query (or, for project_create, a fixed gh command) and no endpoint is ever an
 * input. Owner, repo, org and login are name fields checked by the input schema before any approval; a value that enters
 * a path or query is percent-encoded. The tool returns what the API returns; wrapper-level logic (ref building, the typed
 * issue fallback, sorting, error swallowing, search-string building) stays with the callers.
 *
 * The three paginated listings carry a fixed jq filter (-q) so gh prints one JSON value per line across every page, and
 * are read line by line: `gh api --paginate` alone prints one array per page, which is not one JSON document.
 */

import { Type } from '@sinclair/typebox';
import type { TSchema } from '@sinclair/typebox';
import type { ToolResult } from '../../types.js';
import { parseJsonLines } from './helpers.js';
import type { BuildContext, OpDef } from './op-table.js';
import { apiPath, defineGhFamily, field, kvField, lit, query, rejectInput, val } from './op-table.js';

const ID = 'gh_tracker';

/** The jq filters of the three paginated listings (the same ones the tracker wrappers use). */
export const COMMENTS_FILTER = '.[] | {id, author: .user.login, text: .body, at: .created_at, url: .html_url}';
export const ISSUE_NUMBERS_FILTER = '.[] | select(.pull_request | not) | .number';
export const ISSUE_TITLES_FILTER = '.[] | select(.pull_request | not) | {number, title}';

/** The fixed GraphQL queries. */
const ISSUE_TYPES_GQL = 'query($owner:String!){organization(login:$owner){issueTypes(first:25){nodes{name}}}}';
const SEARCH_GQL =
  'query($q:String!,$first:Int!,$after:String){' +
  'search(query:$q,type:ISSUE,first:$first,after:$after){' +
  'issueCount pageInfo{hasNextPage endCursor} ' +
  'nodes{... on Issue{number title state url ' +
  'author{login} assignees(first:20){nodes{login}} ' +
  'labels(first:50){nodes{name}} milestone{title}}}}}';

/** A host name with an optional port, as `new URL(origin).host` gives. */
const HOST_PATTERN = '^[A-Za-z0-9.-]+(?::[0-9]{1,5})?$';

const owner = field.name('Owner (user or organization) of the repository.');
const repo = field.name('Repository name.');
const number = field.int('Issue number.');
const title = field.str('Title.');
const body = field.str('Body text.', true);

/** The answer's shape: one typebox schema per property. */
const shapeOf = (shape: Record<string, TSchema>): Record<string, TSchema> => shape;

const bad = (msg: string): ToolResult => rejectInput(ID, msg);
const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const posInt = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;

/** The one JSON object gh printed, or a rejected failure that names what was expected. */
function jsonObject(ctx: BuildContext, what: string): Record<string, unknown> | ToolResult {
  try {
    const v: unknown = JSON.parse(ctx.stdout);
    if (isRecord(v)) { return v; }
  } catch { /* fall through */ }
  return bad(`gh api did not return the ${what} as a JSON object`);
}
const isFailure = (v: Record<string, unknown> | ToolResult): v is ToolResult => 'success' in v && typeof v['success'] === 'boolean';


const OPS: readonly OpDef[] = [
  // (1) issue_create_typed
  {
    name: 'issue_create_typed', command: ['api'], cls: 'common', limitS: 60, diagnostic: 'stderr',
    fields: { owner, repo, title, body, labels: field.strs('Labels to apply.'), type: field.str('Native issue type.') },
    required: ['owner', 'repo', 'title', 'body'],
    args: [
      lit('-X', 'POST'), apiPath('repos/', { field: 'owner' }, '/', { field: 'repo' }, '/issues'),
      kvField('-f', 'title', 'title'), kvField('-f', 'body', 'body'), kvField('-f', 'labels[]', 'labels', true), kvField('-f', 'type', 'type'),
    ],
    out: {
      kind: 'custom', shape: shapeOf({ number: Type.Number(), id: Type.Number() }),
      build: async ctx => {
        const j = jsonObject(ctx, 'created issue'); if (isFailure(j)) { return j; }
        if (!posInt(j['number']) || !posInt(j['id'])) { return bad('gh api issue create returned no numeric number and id'); }
        return { number: j['number'], id: j['id'] };
      },
    },
  },
  // (2) sub_issue_link
  {
    name: 'sub_issue_link', command: ['api'], cls: 'common', limitS: 30,
    fields: { owner, repo, number, subIssueId: field.int('REST database id of the child issue.') },
    required: ['owner', 'repo', 'number', 'subIssueId'],
    args: [lit('-X', 'POST'), apiPath('repos/', { field: 'owner' }, '/', { field: 'repo' }, '/issues/', { field: 'number' }, '/sub_issues'), kvField('-F', 'sub_issue_id', 'subIssueId')],
    out: { kind: 'custom', shape: shapeOf({ linked: Type.Boolean() }), build: async () => ({ linked: true }) },
  },
  // (3) issue_id
  {
    name: 'issue_id', command: ['api'], cls: 'none', limitS: 30,
    fields: { owner, repo, number },
    required: ['owner', 'repo', 'number'],
    args: [apiPath('repos/', { field: 'owner' }, '/', { field: 'repo' }, '/issues/', { field: 'number' })],
    out: {
      kind: 'custom', shape: shapeOf({ id: Type.Number() }),
      build: async ctx => {
        const j = jsonObject(ctx, 'issue'); if (isFailure(j)) { return j; }
        if (!posInt(j['id'])) { return bad('gh did not return a numeric id for the issue'); }
        return { id: j['id'] };
      },
    },
  },
  // (4) comments_list
  {
    name: 'comments_list', command: ['api'], cls: 'none', limitS: 60,
    fields: { owner, repo, number, since: field.str('Only comments created or updated at or after this ISO time.') },
    required: ['owner', 'repo', 'number'],
    args: [
      lit('--paginate'), apiPath('repos/', { field: 'owner' }, '/', { field: 'repo' }, '/issues/', { field: 'number' }, '/comments'),
      query({ key: 'per_page', value: '100' }, { key: 'since', field: 'since', optional: true }), lit('-q', COMMENTS_FILTER),
    ],
    out: {
      kind: 'custom',
      shape: shapeOf({ comments: Type.Array(Type.Object({ id: Type.String(), author: Type.String(), text: Type.String(), at: Type.String(), url: Type.Optional(Type.String()) })) }),
      build: async ctx => {
        const lines = parseJsonLines(ctx.stdout);
        if (!lines.ok) { return bad(`gh api returned a comment line that is not JSON (line ${lines.line}): ${lines.text}`); }
        const comments: Array<{ id: string; author: string; text: string; at: string; url?: string }> = [];
        for (const row of lines.values) {
          if (!isRecord(row) || (typeof row['id'] !== 'number' && typeof row['id'] !== 'string') || typeof row['text'] !== 'string' || typeof row['at'] !== 'string') {
            return bad('gh api returned an unexpected answer for the comment listing');
          }
          comments.push({ id: String(row['id']), author: typeof row['author'] === 'string' ? row['author'] : '', text: row['text'], at: row['at'], ...(typeof row['url'] === 'string' ? { url: row['url'] } : {}) });
        }
        return { comments };
      },
    },
  },
  // (5) comment_post
  {
    name: 'comment_post', command: ['api'], cls: 'common', limitS: 30,
    fields: { owner, repo, number, body: field.str('Comment text.', true) },
    required: ['owner', 'repo', 'number', 'body'],
    args: [lit('-X', 'POST'), apiPath('repos/', { field: 'owner' }, '/', { field: 'repo' }, '/issues/', { field: 'number' }, '/comments'), kvField('-f', 'body', 'body')],
    out: {
      kind: 'custom', shape: shapeOf({ id: Type.String() }),
      build: async ctx => {
        const j = jsonObject(ctx, 'new comment'); if (isFailure(j)) { return j; }
        const id = j['id'];
        if (!(typeof id === 'number' || typeof id === 'string') || !/^\d+$/.test(String(id))) { return bad('gh api returned no comment id for the new comment'); }
        return { id: String(id) };
      },
    },
  },
  // (6) issues_by_labels
  {
    name: 'issues_by_labels', command: ['api'], cls: 'none', limitS: 60,
    fields: { owner, repo, labels: field.strs('Labels the issue must carry, all of them.') },
    required: ['owner', 'repo', 'labels'],
    args: [
      lit('--paginate'), apiPath('repos/', { field: 'owner' }, '/', { field: 'repo' }, '/issues'),
      query({ key: 'state', value: 'all' }, { key: 'per_page', value: '100' }, { key: 'labels', field: 'labels', join: ',' }), lit('-q', ISSUE_NUMBERS_FILTER),
    ],
    out: {
      kind: 'custom', shape: shapeOf({ numbers: Type.Array(Type.Number()) }),
      build: async ctx => {
        const lines = parseJsonLines(ctx.stdout);
        if (!lines.ok) { return bad(`gh api returned an issue line that is not JSON (line ${lines.line}): ${lines.text}`); }
        if (!lines.values.every(posInt)) { return bad('gh api returned an unexpected answer for the issue listing'); }
        return { numbers: lines.values };
      },
    },
  },
  // (7) issues_titles
  {
    name: 'issues_titles', command: ['api'], cls: 'none', limitS: 60,
    fields: { owner, repo },
    required: ['owner', 'repo'],
    args: [
      lit('--paginate'), apiPath('repos/', { field: 'owner' }, '/', { field: 'repo' }, '/issues'),
      query({ key: 'state', value: 'all' }, { key: 'per_page', value: '100' }), lit('-q', ISSUE_TITLES_FILTER),
    ],
    out: {
      kind: 'custom', shape: shapeOf({ issues: Type.Array(Type.Object({ number: Type.Number(), title: Type.String() })) }),
      build: async ctx => {
        const lines = parseJsonLines(ctx.stdout);
        if (!lines.ok) { return bad(`gh api returned an issue line that is not JSON (line ${lines.line}): ${lines.text}`); }
        const issues: Array<{ number: number; title: string }> = [];
        for (const row of lines.values) {
          if (!isRecord(row) || typeof row['number'] !== 'number' || typeof row['title'] !== 'string') { return bad('gh api returned an unexpected answer for the issue listing'); }
          issues.push({ number: row['number'], title: row['title'] });
        }
        return { issues };
      },
    },
  },
  // (8) milestone_create
  {
    name: 'milestone_create', command: ['api'], cls: 'common', limitS: 30,
    fields: { owner, repo, title },
    required: ['owner', 'repo', 'title'],
    args: [lit('-X', 'POST'), apiPath('repos/', { field: 'owner' }, '/', { field: 'repo' }, '/milestones'), kvField('-f', 'title', 'title')],
    out: {
      kind: 'custom', shape: shapeOf({ number: Type.Number() }),
      build: async ctx => {
        const j = jsonObject(ctx, 'new milestone'); if (isFailure(j)) { return j; }
        if (!posInt(j['number'])) { return bad('gh api returned no numeric number for the new milestone'); }
        return { number: j['number'] };
      },
    },
  },
  // (9) token_scopes
  {
    name: 'token_scopes', command: ['api'], cls: 'none', limitS: 30,
    args: [lit('-i', '/user')],
    out: {
      kind: 'custom', shape: shapeOf({ scopes: Type.Array(Type.String()) }),
      build: async ctx => {
        for (const line of ctx.stdout.split(/\r?\n/)) {
          const m = /^x-oauth-scopes:\s*(.*)$/i.exec(line.trim());
          if (m !== null) { return { scopes: m[1]!.split(',').map(s => s.trim()).filter(s => s.length > 0) }; }
        }
        return { scopes: [] };
      },
    },
  },
  // (10) org_issue_types_list
  {
    name: 'org_issue_types_list', command: ['api'], cls: 'none', limitS: 30,
    fields: { org: field.name('Organization login.') },
    required: ['org'],
    args: [lit('graphql', '-f', `query=${ISSUE_TYPES_GQL}`), kvField('-f', 'owner', 'org')],
    out: {
      kind: 'custom', shape: shapeOf({ names: Type.Array(Type.String()) }),
      build: async ctx => {
        const j = jsonObject(ctx, 'issue types'); if (isFailure(j)) { return j; }
        const data = isRecord(j['data']) ? j['data'] : {};
        const organization = isRecord(data['organization']) ? data['organization'] : {};
        const types = isRecord(organization['issueTypes']) ? organization['issueTypes'] : {};
        const nodes = Array.isArray(types['nodes']) ? types['nodes'] : [];
        return { names: nodes.map(n => (isRecord(n) && typeof n['name'] === 'string' ? n['name'] : '')).filter(n => n.length > 0) };
      },
    },
  },
  // (11) org_issue_type_create
  {
    name: 'org_issue_type_create', command: ['api'], cls: 'common', limitS: 30,
    fields: { org: field.name('Organization login.'), name: field.str('Issue type name.'), color: field.str('Issue type color.'), description: field.str('Issue type description.', true) },
    required: ['org', 'name', 'color', 'description'],
    args: [
      lit('-X', 'POST'), apiPath('orgs/', { field: 'org' }, '/issue-types'),
      kvField('-f', 'name', 'name'), lit('-F', 'is_enabled=true'), kvField('-f', 'color', 'color'), kvField('-f', 'description', 'description'),
    ],
    out: { kind: 'custom', shape: shapeOf({ created: Type.Boolean() }), build: async () => ({ created: true }) },
  },
  // (12) current_login
  {
    name: 'current_login', command: ['api'], cls: 'none', limitS: 30,
    args: [lit('user')],
    out: {
      kind: 'custom', shape: shapeOf({ login: Type.String() }),
      build: async ctx => {
        const j = jsonObject(ctx, 'current user'); if (isFailure(j)) { return j; }
        if (typeof j['login'] !== 'string' || j['login'].length === 0) { return bad('gh api user returned no login (is gh authenticated?)'); }
        return { login: j['login'] };
      },
    },
  },
  // (13) user_by_host
  {
    name: 'user_by_host', command: ['api'], cls: 'none', limitS: 30,
    fields: { host: { kind: 'string', pattern: HOST_PATTERN, description: 'GitHub host, with a port when it has one.' }, login: field.name('Account login.') },
    required: ['host', 'login'],
    args: [val('--hostname', 'host'), apiPath('users/', { field: 'login' })],
    out: {
      kind: 'custom', shape: shapeOf({ login: Type.String(), node_id: Type.String() }),
      build: async ctx => {
        const j = jsonObject(ctx, 'user'); if (isFailure(j)) { return j; }
        if (typeof j['login'] !== 'string' || typeof j['node_id'] !== 'string') { return bad('gh api users returned no login and node_id'); }
        return { login: j['login'], node_id: j['node_id'] };
      },
    },
  },
  // (14) tasks_query
  {
    name: 'tasks_query', command: ['api'], cls: 'none', limitS: 60,
    fields: { q: field.str('The GitHub search string.'), first: field.int('Page size.'), after: field.str('The cursor of the page before.') },
    required: ['q', 'first'],
    args: [lit('graphql', '-f', `query=${SEARCH_GQL}`), kvField('-f', 'q', 'q'), kvField('-F', 'first', 'first'), kvField('-f', 'after', 'after')],
    out: {
      kind: 'custom',
      shape: {
        issueCount: Type.Optional(Type.Number()),
        pageInfo: Type.Object({ hasNextPage: Type.Boolean(), endCursor: Type.Optional(Type.String()) }),
        nodes: Type.Array(Type.Unknown()),
      },
      build: async ctx => {
        const j = jsonObject(ctx, 'search answer'); if (isFailure(j)) { return j; }
        const data = isRecord(j['data']) ? j['data'] : undefined;
        const search = data !== undefined && isRecord(data['search']) ? data['search'] : undefined;
        if (search === undefined) { return bad(`gh api graphql search returned unexpected JSON: '${ctx.stdout.slice(0, 120)}'`); }
        const info = isRecord(search['pageInfo']) ? search['pageInfo'] : {};
        const cursor = info['endCursor'];
        return {
          ...(typeof search['issueCount'] === 'number' ? { issueCount: search['issueCount'] } : {}),
          pageInfo: { hasNextPage: info['hasNextPage'] === true, ...(typeof cursor === 'string' && cursor.length > 0 ? { endCursor: cursor } : {}) },
          nodes: Array.isArray(search['nodes']) ? search['nodes'] : [],
        };
      },
    },
  },
  // (15) project_create: not a gh api call
  {
    name: 'project_create', command: ['project', 'create'], cls: 'common', limitS: 60,
    fields: { owner, title },
    required: ['owner', 'title'],
    args: [val('--title', 'title'), val('--owner', 'owner'), lit('--format', 'json')],
    out: {
      kind: 'custom', shape: shapeOf({ number: Type.Integer(), url: Type.String() }),
      build: async ctx => {
        const j = jsonObject(ctx, 'new project'); if (isFailure(j)) { return j; }
        if (!posInt(j['number'])) { return bad('gh project create returned no numeric project number'); }
        return { number: j['number'], url: typeof j['url'] === 'string' ? j['url'] : '' };
      },
    },
  },
];

export const ghTrackerTool = defineGhFamily({
  id: ID,
  description: 'GitHub operations for the workflow tracker through fixed endpoints: create an issue with a native type, link a sub-issue, read an issue id, list issue comments, number and title listings (every page), post a comment and get its id, create a milestone, read the token scopes, list or create org issue types, read the current login or a user by host, query tasks by search, and create a project board.',
  ops: OPS,
});
