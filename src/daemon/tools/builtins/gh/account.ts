/**
 * The search, account and environment families of gh: gh_search, gh_ruleset, gh_org, gh_auth, gh_status,
 * gh_codespace, gh_config and gh_extension (the Story LLD, section 2.8).
 *
 * Free text goes through sc3 (convertText with a key-value cross-check): auth status, ruleset list and status.
 * config list has a deterministic parser and makes no model call.
 */

import { Type } from '@sinclair/typebox';
import { ghConvert } from './convert.js';
import { csv, defineGhFamily, field, lit, on, onOff, pos, last, rep, spread, val } from './op-table.js';
import type { BuildContext, OpDef } from './op-table.js';
import { parseConfigList } from './parsers.js';

const ORDER = ['asc', 'desc'] as const;
const VISIBILITY = ['public', 'private', 'internal'] as const;

// ---------------------------------------------------------------------------
// gh_search
// ---------------------------------------------------------------------------

const ISSUE_ITEM = ['assignees', 'author', 'authorAssociation', 'body', 'closedAt', 'commentsCount', 'createdAt', 'id', 'isLocked', 'isPullRequest', 'labels', 'number', 'repository', 'state', 'title', 'updatedAt', 'url'] as const;
const REPO_ITEM = ['createdAt', 'defaultBranch', 'description', 'forksCount', 'fullName', 'hasDownloads', 'hasIssues', 'hasPages', 'hasProjects', 'hasWiki', 'homepage', 'id', 'isArchived', 'isDisabled', 'isFork', 'isPrivate', 'language', 'license', 'name', 'openIssuesCount', 'owner', 'pushedAt', 'size', 'stargazersCount', 'updatedAt', 'url', 'visibility', 'watchersCount'] as const;

const q = { query: field.str('The search query.') } as const;
const common = {
  limit: field.int('Maximum number of results.'),
  owner: field.strs('Filter on repository owner.'),
  repo: field.strs('Filter on repository (OWNER/NAME).'),
} as const;
const people = {
  app: field.str('Filter by GitHub App author.'), assignee: field.str('Filter by assignee.'), author: field.str('Filter by author.'),
  commenter: field.str('Filter on comments by user.'), involves: field.str('Filter on involvement of user.'), mentions: field.str('Filter on user mentions.'),
  teamMentions: field.str('Filter on team mentions.'), milestone: field.str('Filter by milestone title.'), language: field.str('Filter on coding language.'),
  label: field.strs('Filter on label.'), project: field.expr('Filter on project board number.'),
  closed: field.expr('Filter on closed-at date.'), created: field.expr('Filter on created-at date.'), updated: field.expr('Filter on last-updated date.'),
  comments: field.expr('Filter on number of comments.'), interactions: field.expr('Filter on number of reactions and comments.'), reactions: field.expr('Filter on number of reactions.'),
  archived: field.bool('Filter on the archived state of the repository.'), locked: field.bool('Filter on locked conversations.'),
  noAssignee: field.bool('Filter on missing assignee.'), noLabel: field.bool('Filter on missing label.'), noMilestone: field.bool('Filter on missing milestone.'), noProject: field.bool('Filter on missing project.'),
  match: field.manyOf(['title', 'body', 'comments'], 'Restrict the search to fields of the issue.'),
  order: field.oneOf(ORDER), state: field.oneOf(['open', 'closed']), visibility: field.manyOf(VISIBILITY),
} as const;

const issueArgs = [
  val('--app', 'app'), onOff('--archived', 'archived'), val('--assignee', 'assignee'), val('--author', 'author'), val('--closed', 'closed'), val('--commenter', 'commenter'),
  val('--comments', 'comments'), val('--created', 'created'), val('--interactions', 'interactions'), val('--involves', 'involves'), rep('--label', 'label'), val('--language', 'language'),
  val('-L', 'limit'), onOff('--locked', 'locked'), rep('--match', 'match'), val('--mentions', 'mentions'), val('--milestone', 'milestone'), on('--no-assignee', 'noAssignee'),
  on('--no-label', 'noLabel'), on('--no-milestone', 'noMilestone'), on('--no-project', 'noProject'), val('--order', 'order'), rep('--owner', 'owner'), val('--project', 'project'),
  val('--reactions', 'reactions'), rep('-R', 'repo'), val('--state', 'state'), val('--team-mentions', 'teamMentions'), val('--updated', 'updated'), rep('--visibility', 'visibility'),
] as const;

const searchOps: OpDef[] = [
  {
    name: 'code', command: ['search', 'code'], cls: 'none', limitS: 60,
    fields: { ...q, extension: field.str('Filter on file extension.'), filename: field.str('Filter on file name.'), language: field.str('Filter on language.'), limit: common.limit, match: field.manyOf(['file', 'path'], 'Restrict the search to file contents or file path.'), owner: common.owner, repo: common.repo, size: field.expr('Filter on size range, in kilobytes.') },
    required: ['query'], args: [val('--extension', 'extension'), val('--filename', 'filename'), val('--language', 'language'), val('-L', 'limit'), rep('--match', 'match'), rep('--owner', 'owner'), rep('-R', 'repo'), val('--size', 'size'), last('query')],
    out: { kind: 'items', jsonFields: ['path', 'repository', 'sha', 'textMatches', 'url'] },
  },
  {
    name: 'commits', command: ['search', 'commits'], cls: 'none', limitS: 60,
    fields: {
      ...q, ...common, author: field.str('Filter by author.'), authorDate: field.expr('Filter on authored date.'), authorEmail: field.str('Filter on author email.'), authorName: field.str('Filter on author name.'),
      committer: field.str('Filter by committer.'), committerDate: field.expr('Filter on committed date.'), committerEmail: field.str('Filter on committer email.'), committerName: field.str('Filter on committer name.'),
      hash: field.str('Filter by commit hash.'), merge: field.bool('Filter on merge commits.'), order: field.oneOf(ORDER), parent: field.str('Filter by parent hash.'),
      sort: field.oneOf(['author-date', 'committer-date']), tree: field.str('Filter by tree hash.'), visibility: field.manyOf(VISIBILITY),
    },
    required: ['query'],
    args: [val('--author', 'author'), val('--author-date', 'authorDate'), val('--author-email', 'authorEmail'), val('--author-name', 'authorName'), val('--committer', 'committer'), val('--committer-date', 'committerDate'),
      val('--committer-email', 'committerEmail'), val('--committer-name', 'committerName'), val('--hash', 'hash'), val('-L', 'limit'), onOff('--merge', 'merge'), val('--order', 'order'), rep('--owner', 'owner'),
      val('--parent', 'parent'), rep('-R', 'repo'), val('--sort', 'sort'), val('--tree', 'tree'), rep('--visibility', 'visibility'), last('query')],
    out: { kind: 'items', jsonFields: ['author', 'commit', 'committer', 'id', 'parents', 'repository', 'sha', 'url'] },
  },
  {
    name: 'issues', command: ['search', 'issues'], cls: 'none', limitS: 60,
    fields: {
      ...q, ...common, ...people, includePrs: field.bool('Include pull requests in the results.'),
      sort: field.oneOf(['comments', 'created', 'interactions', 'reactions', 'reactions-+1', 'reactions--1', 'reactions-heart', 'reactions-smile', 'reactions-tada', 'reactions-thinking_face', 'updated']),
    },
    required: ['query'], args: [...issueArgs, onOff('--include-prs', 'includePrs'), val('--sort', 'sort'), last('query')],
    out: { kind: 'items', jsonFields: ISSUE_ITEM },
  },
  {
    name: 'prs', command: ['search', 'prs'], cls: 'none', limitS: 60,
    fields: {
      ...q, ...common, ...people, base: field.str('Filter on base branch name.'), checks: field.oneOf(['pending', 'success', 'failure']), draft: field.bool('Filter on draft state.'),
      head: field.str('Filter on head branch name.'), merged: field.bool('Filter on merged state.'), mergedAt: field.expr('Filter on merged-at date.'),
      review: field.oneOf(['none', 'required', 'approved', 'changes_requested']), reviewRequested: field.str('Filter on user or team requested to review.'), reviewedBy: field.str('Filter on user who reviewed.'),
      sort: field.oneOf(['comments', 'reactions', 'reactions-+1', 'reactions--1', 'reactions-smile', 'reactions-thinking_face', 'reactions-heart', 'reactions-tada', 'interactions', 'created', 'updated']),
    },
    required: ['query'],
    args: [...issueArgs, val('-B', 'base'), val('--checks', 'checks'), onOff('--draft', 'draft'), val('-H', 'head'), onOff('--merged', 'merged'), val('--merged-at', 'mergedAt'), val('--review', 'review'),
      val('--review-requested', 'reviewRequested'), val('--reviewed-by', 'reviewedBy'), val('--sort', 'sort'), last('query')],
    out: { kind: 'items', jsonFields: [...ISSUE_ITEM, 'isDraft'] },
  },
  {
    name: 'repos', command: ['search', 'repos'], cls: 'none', limitS: 60,
    fields: {
      ...q, limit: common.limit, owner: common.owner, archived: field.bool('Filter on the archived state.'), created: field.expr('Filter on created-at date.'), followers: field.expr('Filter on number of followers.'),
      forks: field.expr('Filter on number of forks.'), goodFirstIssues: field.expr('Filter on number of good-first-issue issues.'), helpWantedIssues: field.expr('Filter on number of help-wanted issues.'),
      includeForks: field.oneOf(['false', 'true', 'only']), language: field.str('Filter on language.'), license: field.strs('Filter on license type.'),
      match: field.manyOf(['name', 'description', 'readme'], 'Restrict the search to fields of the repository.'), numberTopics: field.expr('Filter on number of topics.'), order: field.oneOf(ORDER),
      size: field.expr('Filter on size range, in kilobytes.'), sort: field.oneOf(['forks', 'help-wanted-issues', 'stars', 'updated']), stars: field.expr('Filter on number of stars.'),
      topic: field.strs('Filter on topic.'), updated: field.expr('Filter on last-updated date.'), visibility: field.manyOf(VISIBILITY),
    },
    required: ['query'],
    args: [onOff('--archived', 'archived'), val('--created', 'created'), val('--followers', 'followers'), val('--forks', 'forks'), val('--good-first-issues', 'goodFirstIssues'), val('--help-wanted-issues', 'helpWantedIssues'),
      val('--include-forks', 'includeForks'), val('--language', 'language'), rep('--license', 'license'), val('-L', 'limit'), rep('--match', 'match'), val('--number-topics', 'numberTopics'), val('--order', 'order'),
      rep('--owner', 'owner'), val('--size', 'size'), val('--sort', 'sort'), val('--stars', 'stars'), rep('--topic', 'topic'), val('--updated', 'updated'), rep('--visibility', 'visibility'), last('query')],
    out: { kind: 'items', jsonFields: REPO_ITEM },
  },
];

export const ghSearchTool = defineGhFamily({ id: 'gh_search', description: 'Search GitHub: code, commits, issues, pull requests and repositories. Number, size and date qualifiers accept comparisons and ranges (>100, 10..50, >=2024-01-01).', ops: searchOps });

// ---------------------------------------------------------------------------
// gh_ruleset, gh_org, gh_auth, gh_status
// ---------------------------------------------------------------------------

const RulesetItems = Type.Object({ items: Type.Array(Type.Object({ id: Type.String(), name: Type.String() })) });
const HostsSchema = Type.Object({
  hosts: Type.Array(Type.Object({ host: Type.String(), login: Type.String(), active: Type.Boolean(), state: Type.Union([Type.Literal('logged-in'), Type.Literal('failed')]) })),
});
const StatusRepos = Type.Object({ repositories: Type.Array(Type.String()) });

/** ruleset list: gh prints text; the model reads {id, name} out of it and both are checked against the text. */
async function buildRulesetList(c: BuildContext) {
  const conv = await ghConvert('gh_ruleset', c.stdout, RulesetItems, v => v.items.flatMap(i => [i.id, i.name]), c.deps, { required: true });
  if (!conv.ok) { return conv.failure; }
  const items = conv.value?.items ?? [];
  return { count: items.length, items };
}

export const ghRulesetTool = defineGhFamily({
  id: 'gh_ruleset', description: 'Repository and organization rulesets: list, view one, check the rules that apply to a branch.',
  ops: [
    {
      name: 'list', command: ['ruleset', 'list'], cls: 'none', limitS: 30, repo: true,
      fields: { org: field.str('List the rulesets of this organization.'), parents: field.bool('Include rulesets configured at higher levels.'), limit: field.int('Maximum number of rulesets.') },
      args: [val('-o', 'org'), onOff('--parents', 'parents'), val('-L', 'limit')],
      out: { kind: 'custom', shape: { count: Type.Number(), items: Type.Array(Type.Object({ id: Type.String(), name: Type.String() })) }, build: buildRulesetList },
    },
    {
      name: 'view', command: ['ruleset', 'view'], cls: 'none', limitS: 30, repo: true,
      fields: { rulesetId: field.str('ID of the ruleset.'), org: field.str('Organization of an organization-level ruleset.'), parents: field.bool('Include rulesets configured at higher levels.') },
      required: ['rulesetId'], args: [pos('rulesetId'), val('-o', 'org'), onOff('--parents', 'parents')], out: { kind: 'text' },
    },
    {
      name: 'check', command: ['ruleset', 'check'], cls: 'none', limitS: 30, repo: true,
      fields: { branch: field.str('Branch to check; default: the current branch.'), default: field.bool('Check the default branch.') }, exclusive: [['branch', 'default']],
      args: [pos('branch'), on('--default', 'default')], out: { kind: 'text' },
    },
  ],
});

export const ghOrgTool = defineGhFamily({
  id: 'gh_org', description: 'Organizations you belong to.',
  ops: [{ name: 'list', command: ['org', 'list'], cls: 'none', limitS: 30, fields: { limit: field.int('Maximum number of organizations.') }, args: [val('-L', 'limit')], out: { kind: 'lines', property: 'name' } }],
});

/** auth status: the text names hosts and accounts; the model reads {host, login, active, state} and host and login are checked against it. */
async function buildAuthStatus(c: BuildContext) {
  const raw = c.stdout.trim().length > 0 ? c.stdout : c.stderr;
  const conv = await ghConvert('gh_auth', raw, HostsSchema, v => v.hosts.flatMap(h => [h.host, h.login]), c.deps, { required: true });
  if (!conv.ok) { return conv.failure; }
  return { hosts: conv.value?.hosts ?? [] };
}

const hostUser = { hostname: field.str('Host name of the GitHub instance.'), user: field.str('The account.') } as const;

export const ghAuthTool = defineGhFamily({
  id: 'gh_auth', description: 'Authentication state: status of the signed-in hosts and accounts, switch the active account, log an account out.',
  ops: [
    {
      name: 'status', command: ['auth', 'status'], cls: 'none', limitS: 30, fields: { hostname: hostUser.hostname }, args: [val('-h', 'hostname')],
      out: { kind: 'custom', shape: { hosts: HostsSchema.properties.hosts }, build: buildAuthStatus },
    },
    { name: 'switch', command: ['auth', 'switch'], cls: 'common', limitS: 30, fields: hostUser, required: ['hostname', 'user'], args: [val('-h', 'hostname'), val('-u', 'user')], out: { kind: 'mutation' }, target: i => `${String(i['user'])}@${String(i['hostname'])}` },
    { name: 'logout', command: ['auth', 'logout'], cls: 'destructive', limitS: 30, fields: hostUser, required: ['hostname', 'user'], args: [val('-h', 'hostname'), val('-u', 'user')], out: { kind: 'mutation' }, target: i => `${String(i['user'])}@${String(i['hostname'])}` },
  ],
});

/** status: the answer is gh's text; the repositories it names are read out and checked against it. */
async function buildStatus(c: BuildContext) {
  const conv = await ghConvert('gh_status', c.stdout, StatusRepos, v => v.repositories, c.deps);
  if (!conv.ok) { return conv.failure; }
  return { text: c.stdout };
}

export const ghStatusTool = defineGhFamily({
  id: 'gh_status', description: 'Your GitHub status: assigned issues and pull requests, mentions, review requests and repository activity.',
  ops: [{
    name: 'status', command: ['status'], cls: 'none', limitS: 60, fields: { exclude: field.strs('Repositories (OWNER/NAME) to leave out.'), org: field.str('Report within this organization.') },
    args: [csv('-e', 'exclude'), val('-o', 'org')], out: { kind: 'custom', shape: { text: Type.String() }, build: buildStatus },
  }],
});

// ---------------------------------------------------------------------------
// gh_codespace
// ---------------------------------------------------------------------------

const codespace = { codespace: field.str('Name of the codespace.') } as const;
const scope = { org: field.str('Organization (admin only).'), user: field.str('User (used with org).') } as const;
const CODESPACE_ITEM = ['createdAt', 'displayName', 'gitStatus', 'lastUsedAt', 'machineName', 'name', 'owner', 'repository', 'state', 'vscsTarget'] as const;
const CODESPACE_VIEW = ['billableOwner', 'createdAt', 'devcontainerPath', 'displayName', 'environmentId', 'gitStatus', 'idleTimeoutMinutes', 'lastUsedAt', 'location', 'machineDisplayName', 'machineName', 'name', 'owner', 'prebuild', 'recentFolders', 'repository', 'retentionExpiresAt', 'retentionPeriodDays', 'state', 'vscsTarget'] as const;
const DURATION = /^(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h))+$/;
const PORT_PAIR = /^\d+:(?:public|private|org)$/;

const codespaceOps: OpDef[] = [
  {
    name: 'list', command: ['codespace', 'list'], cls: 'none', limitS: 30,
    fields: { limit: field.int('Maximum number of codespaces.'), org: scope.org, repo: field.str('Repository (OWNER/NAME).'), user: scope.user },
    args: [val('-L', 'limit'), val('-o', 'org'), val('-R', 'repo'), val('-u', 'user')], out: { kind: 'items', jsonFields: CODESPACE_ITEM },
  },
  {
    name: 'view', command: ['codespace', 'view'], cls: 'none', limitS: 30, fields: codespace, required: ['codespace'], args: [val('-c', 'codespace'), lit('--json', CODESPACE_VIEW.join(','))],
    out: { kind: 'custom', shape: { item: Type.Object(Object.fromEntries(CODESPACE_VIEW.map(k => [k, Type.Unknown()]))) }, build: async c => {
      let item: unknown;
      try { item = JSON.parse(c.stdout); } catch { item = undefined; }
      return typeof item === 'object' && item !== null ? { item } : { output: '[gh_codespace] gh did not print JSON', format: 'text' as const, success: false, error: 'gh did not print JSON', failure: { kind: 'rejected' as const, message: 'gh did not print JSON' } };
    } },
  },
  { name: 'logs', command: ['codespace', 'logs'], cls: 'none', limitS: 60, fields: codespace, required: ['codespace'], args: [val('-c', 'codespace')], maxBytes: 128 * 1024, out: { kind: 'textCapped' } },
  { name: 'ports', command: ['codespace', 'ports'], cls: 'none', limitS: 30, fields: codespace, required: ['codespace'], args: [val('-c', 'codespace')], out: { kind: 'items', jsonFields: ['browseUrl', 'label', 'sourcePort', 'visibility'] } },
  {
    name: 'create', command: ['codespace', 'create'], cls: 'common', limitS: 600,
    fields: {
      repo: field.str('Repository (OWNER/NAME).'), branch: field.str('Repository branch.'), machine: field.str('Hardware specification of the VM.'), displayName: field.str('Display name (48 characters or fewer).'),
      idleTimeout: field.str('Allowed inactivity before the codespace stops, e.g. 10m or 1h.'), retentionPeriod: field.str('Time after shutdown before the codespace is deleted (30 days at most), e.g. 72h.'),
      location: field.oneOf(['EastUs', 'SouthEastAsia', 'WestEurope', 'WestUs2']), devcontainerPath: field.str('Path of the devcontainer.json to use.'), status: field.bool('Show the status of the post-create command and dotfiles.'),
    },
    required: ['repo'],
    check: i => ['idleTimeout', 'retentionPeriod'].map(k => [k, i[k]] as const).find(([, v]) => typeof v === 'string' && !DURATION.test(v))?.[0] !== undefined
      ? 'op create: idleTimeout and retentionPeriod are durations such as 10m, 1h or 72h' : undefined,
    args: [lit('--default-permissions'), val('-R', 'repo'), val('-b', 'branch'), val('-m', 'machine'), val('-d', 'displayName'), val('--idle-timeout', 'idleTimeout'), val('--retention-period', 'retentionPeriod'),
      val('-l', 'location'), val('--devcontainer-path', 'devcontainerPath'), on('-s', 'status')],
    notice: 'The permissions the codespace requests in its devcontainer are accepted without a further question (--default-permissions is always passed).',
    out: { kind: 'mutation' }, target: i => String(i['repo']),
  },
  {
    name: 'edit', command: ['codespace', 'edit'], cls: 'common', limitS: 30, fields: { ...codespace, displayName: field.str('Display name.'), machine: field.str('Hardware specification of the VM.') },
    required: ['codespace'], args: [val('-c', 'codespace'), val('-d', 'displayName'), val('-m', 'machine')], out: { kind: 'mutation' }, target: i => String(i['codespace']),
  },
  {
    name: 'stop', command: ['codespace', 'stop'], cls: 'common', limitS: 60, fields: { ...codespace, ...scope }, required: ['codespace'],
    args: [val('-c', 'codespace'), val('-o', 'org'), val('-u', 'user')], out: { kind: 'mutation' }, target: i => String(i['codespace']),
  },
  {
    name: 'rebuild', command: ['codespace', 'rebuild'], cls: 'common', limitS: 600, fields: { ...codespace, full: field.bool('Perform a full rebuild.') }, required: ['codespace'],
    args: [val('-c', 'codespace'), on('--full', 'full')], out: { kind: 'mutation' }, target: i => String(i['codespace']),
  },
  {
    name: 'delete', command: ['codespace', 'delete'], cls: 'destructive', limitS: 60,
    fields: { ...codespace, all: field.bool('Delete all codespaces.'), days: field.int('Delete codespaces older than this many days.', 0), force: field.bool('Skip confirmation for codespaces with unsaved changes.'), ...scope },
    oneOf: [['codespace', 'all']], with: { days: ['all'] },
    args: [val('-c', 'codespace'), on('--all', 'all'), val('--days', 'days'), on('-f', 'force'), val('-o', 'org'), val('-u', 'user')], out: { kind: 'mutation' }, target: i => String(i['codespace'] ?? 'all'),
  },
  {
    name: 'cp', command: ['codespace', 'cp'], cls: 'common', limitS: 300,
    fields: { ...codespace, sources: field.strs('Files to copy (prefix remote:... for paths in the codespace).'), dest: field.str('Destination.'), recursive: field.bool('Copy directories recursively.'), profile: field.str('Name of the SSH profile to use.') },
    required: ['codespace', 'sources', 'dest'], args: [val('-c', 'codespace'), on('-r', 'recursive'), val('-p', 'profile'), spread('sources'), pos('dest')], out: { kind: 'mutation' }, target: i => String(i['dest']),
  },
  {
    name: 'ports-visibility', command: ['codespace', 'ports', 'visibility'], cls: 'destructive', limitS: 30,
    fields: { ...codespace, ports: field.strs('Port and visibility pairs such as 8080:public (public, private or org).') }, required: ['codespace', 'ports'],
    check: i => (Array.isArray(i['ports']) ? (i['ports'] as unknown[]) : []).find(p => typeof p !== 'string' || !PORT_PAIR.test(p)) !== undefined ? 'op ports-visibility: each port must be PORT:public, PORT:private or PORT:org' : undefined,
    args: [spread('ports'), val('-c', 'codespace')], out: { kind: 'mutation' }, target: i => String(i['codespace']),
  },
];

export const ghCodespaceTool = defineGhFamily({ id: 'gh_codespace', description: 'Codespaces: list, view, logs, ports, create, edit, stop, rebuild, delete, copy files and change port visibility.', ops: codespaceOps });

// ---------------------------------------------------------------------------
// gh_config and gh_extension
// ---------------------------------------------------------------------------

export const ghConfigTool = defineGhFamily({
  id: 'gh_config', description: 'Read the gh configuration: one key, or the whole list.',
  ops: [
    {
      name: 'get', command: ['config', 'get'], cls: 'none', limitS: 30, fields: { key: field.str('Configuration key.'), host: field.str('Get the per-host setting.') }, required: ['key'], args: [pos('key'), val('-h', 'host')],
      out: { kind: 'custom', shape: { key: Type.String(), value: Type.String() }, build: async c => ({ key: String(c.input['key']), value: c.stdout.replace(/\r?\n$/, '') }) },
    },
    {
      name: 'list', command: ['config', 'list'], cls: 'none', limitS: 30, fields: { host: field.str('Get the per-host configuration.') }, args: [val('-h', 'host')],
      out: { kind: 'custom', shape: { entries: Type.Array(Type.Object({ key: Type.String(), value: Type.String() })) }, build: async c => ({ entries: parseConfigList(c.stdout) }) },
    },
  ],
});

export const ghExtensionTool = defineGhFamily({
  id: 'gh_extension', description: 'gh extensions: list the installed ones, search the available ones.',
  ops: [
    { name: 'list', command: ['extension', 'list'], cls: 'none', limitS: 30, args: [], out: { kind: 'rows' } },
    {
      name: 'search', command: ['extension', 'search'], cls: 'none', limitS: 60,
      fields: { query: field.str('The search query.'), owner: field.strs('Filter on owner.'), license: field.strs('Filter on license type.'), sort: field.oneOf(['forks', 'help-wanted-issues', 'stars', 'updated']), order: field.oneOf(ORDER), limit: field.int('Maximum number of extensions.') },
      args: [rep('--license', 'license'), val('-L', 'limit'), val('--order', 'order'), rep('--owner', 'owner'), val('--sort', 'sort'), last('query')], out: { kind: 'items', jsonFields: REPO_ITEM },
    },
  ],
});
