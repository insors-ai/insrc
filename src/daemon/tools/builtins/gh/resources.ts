/**
 * The resource families of gh: gh_label, gh_gist, gh_secret, gh_variable, gh_cache, gh_ssh_key and gh_gpg_key
 * (the Story LLD, section 2.8). A secret or a variable value goes to gh on standard input, never in argv; a public
 * key given as text does too.
 */

import { defineGhFamily, field, lit, litIf, on, pos, spread, val, csv } from './op-table.js';
import type { OpDef } from './op-table.js';

const ORDER = ['asc', 'desc'] as const;
const APPS = ['actions', 'codespaces', 'dependabot'] as const;
const VISIBILITY = ['all', 'private', 'selected'] as const;

// ---------------------------------------------------------------------------
// gh_label
// ---------------------------------------------------------------------------

const labelName = { name: field.str('Name of the label.') } as const;

export const ghLabelTool = defineGhFamily({
  id: 'gh_label', dashSafe: true, description: 'Repository labels: list, create, edit, clone from another repository, delete.',
  ops: [
    {
      name: 'list', command: ['label', 'list'], cls: 'none', limitS: 30, repo: true,
      fields: { search: field.str('Search label names and descriptions.'), sort: field.oneOf(['created', 'name']), order: field.oneOf(ORDER), limit: field.int('Maximum number of labels.') },
      args: [val('-S', 'search'), val('--sort', 'sort'), val('--order', 'order'), val('-L', 'limit')],
      out: { kind: 'items', jsonFields: ['color', 'createdAt', 'description', 'id', 'isDefault', 'name', 'updatedAt', 'url'] },
    },
    {
      name: 'create', command: ['label', 'create'], cls: 'common', limitS: 30, repo: true,
      fields: { ...labelName, color: field.str('Color of the label.'), description: field.str('Description of the label.', true), force: field.bool('Update the label if it already exists.') },
      required: ['name'], args: [pos('name'), val('-c', 'color'), val('-d', 'description'), on('-f', 'force')], out: { kind: 'mutation' }, target: i => String(i['name']),
    },
    {
      name: 'edit', command: ['label', 'edit'], cls: 'common', limitS: 30, repo: true,
      fields: { ...labelName, newName: field.str('New name of the label.'), color: field.str('Color of the label.'), description: field.str('Description of the label.', true) },
      required: ['name'], args: [pos('name'), val('-n', 'newName'), val('-c', 'color'), val('-d', 'description')], out: { kind: 'mutation' }, target: i => String(i['newName'] ?? i['name']),
    },
    {
      name: 'clone', command: ['label', 'clone'], cls: 'common', limitS: 30, repo: true,
      fields: { sourceRepository: field.str('Repository to copy the labels from, as OWNER/NAME.'), force: field.bool('Overwrite labels in the destination repository.') },
      required: ['sourceRepository'], args: [pos('sourceRepository'), on('-f', 'force')], out: { kind: 'mutation' }, target: i => String(i['sourceRepository']),
    },
    { name: 'delete', command: ['label', 'delete'], cls: 'destructive', limitS: 30, repo: true, fields: labelName, required: ['name'], args: [pos('name'), lit('--yes')], out: { kind: 'mutation' }, target: i => String(i['name']) },
  ],
});

// ---------------------------------------------------------------------------
// gh_gist
// ---------------------------------------------------------------------------

const gistId = { id: field.str('Gist ID or URL.') } as const;

const gistOps: OpDef[] = [
  {
    name: 'list', command: ['gist', 'list'], cls: 'none', limitS: 30,
    fields: { public: field.bool('Only public gists.'), secret: field.bool('Only secret gists.'), limit: field.int('Maximum number of gists.') },
    exclusive: [['public', 'secret']], args: [val('-L', 'limit'), on('--public', 'public'), on('--secret', 'secret')],
    out: { kind: 'columns', columns: ['id', 'description', 'files', 'visibility', 'updated'] },
  },
  {
    name: 'view', command: ['gist', 'view'], cls: 'none', limitS: 30,
    fields: { ...gistId, filename: field.str('Show a single file of the gist.'), listFiles: field.bool('List the file names of the gist.'), raw: field.bool('Print raw instead of rendered contents.') },
    required: ['id'], args: [pos('id'), val('-f', 'filename'), on('--files', 'listFiles'), on('-r', 'raw')], out: { kind: 'text' },
  },
  {
    name: 'create', command: ['gist', 'create'], cls: 'common', limitS: 60,
    fields: {
      files: field.strs('Local files to put in the gist.'), content: field.str('Text to put in the gist, read from standard input.'),
      description: field.str('Description of the gist.'), filename: field.str('File name for the text given as content.'), public: field.bool('Make the gist public (default secret).'),
    },
    oneOf: [['files', 'content']], with: { filename: ['content'] },
    args: [spread('files'), litIf(i => typeof i['content'] === 'string', '-'), val('-d', 'description'), val('-f', 'filename'), on('-p', 'public')],
    stdin: i => typeof i['content'] === 'string' ? i['content'] : undefined, out: { kind: 'mutation' }, target: i => String(i['description'] ?? ''),
  },
  {
    name: 'edit', command: ['gist', 'edit'], cls: 'common', limitS: 60,
    fields: { ...gistId, add: field.str('Local file to add to the gist.'), remove: field.str('Name of a file to remove from the gist.'), desc: field.str('New description.') },
    required: ['id'], atLeastOne: [['add', 'remove', 'desc']], args: [pos('id'), val('-a', 'add'), val('-r', 'remove'), val('-d', 'desc')], out: { kind: 'mutation' }, target: i => String(i['id']),
  },
  {
    name: 'rename', command: ['gist', 'rename'], cls: 'destructive', limitS: 60,
    fields: { ...gistId, oldFilename: field.str('Current name of the file.'), newFilename: field.str('New name of the file.') },
    required: ['id', 'oldFilename', 'newFilename'], args: [pos('id'), pos('oldFilename'), pos('newFilename')], out: { kind: 'mutation' }, target: i => String(i['id']),
  },
  {
    name: 'clone', command: ['gist', 'clone'], cls: 'common', limitS: 60,
    fields: { gist: field.str('Gist ID or URL.'), directory: field.str('Directory to clone into.') }, required: ['gist'], args: [pos('gist'), pos('directory')], out: { kind: 'mutation' }, target: i => String(i['gist']),
  },
  { name: 'delete', command: ['gist', 'delete'], cls: 'destructive', limitS: 30, fields: gistId, required: ['id'], args: [pos('id')], out: { kind: 'mutation' }, target: i => String(i['id']) },
];

export const ghGistTool = defineGhFamily({ id: 'gh_gist', dashSafe: true, description: 'Gists: list, view, create (from files or text), edit (add or remove a file, change the description), rename a file, clone, delete.', ops: gistOps });

// ---------------------------------------------------------------------------
// gh_secret and gh_variable
// ---------------------------------------------------------------------------

const SECRET_ITEM = ['name', 'numSelectedRepos', 'selectedReposURL', 'updatedAt', 'visibility'] as const;
const VARIABLE_ITEM = ['name', 'numSelectedRepos', 'selectedReposURL', 'updatedAt', 'value', 'visibility'] as const;

const scope = {
  env: field.str('Deployment environment.'), org: field.str('Organization.'),
} as const;
const secretScope = { app: field.oneOf(APPS, 'Application the secret is for.'), ...scope, user: field.bool('Your user secret.') } as const;

/** repos go with an organization (or user) secret, visibility with an organization one */
const reposAndVisibility = (kind: 'secret' | 'variable') => (i: Record<string, unknown>): string | undefined => {
  if (i['repos'] !== undefined && i['org'] === undefined && !(kind === 'secret' && i['user'] === true)) { return `op set accepts repos only with ${kind === 'secret' ? 'org or user' : 'org'}`; }
  return undefined;
};

export const ghSecretTool = defineGhFamily({
  id: 'gh_secret', dashSafe: true, description: 'Repository, environment, organization and user secrets: list, set (the value is sent on standard input, never in argv) and delete.',
  ops: [
    {
      name: 'list', command: ['secret', 'list'], cls: 'none', limitS: 30, repo: true, fields: secretScope, exclusive: [['env', 'org', 'user']],
      args: [val('-a', 'app'), val('-e', 'env'), val('-o', 'org'), on('-u', 'user')], out: { kind: 'items', jsonFields: SECRET_ITEM },
    },
    {
      name: 'set', command: ['secret', 'set'], cls: 'common', limitS: 30, repo: true,
      fields: {
        name: field.str('Name of the secret.'), envFile: field.str('A dotenv file of secret names and values, read by gh.'), secretValue: field.str('Value of the secret, sent on standard input.'),
        ...secretScope, repos: field.strs('Repositories that can access an organization or user secret.'), visibility: field.oneOf(VISIBILITY, 'Visibility of an organization secret.'), noStore: field.bool('Print the encrypted value instead of storing it.'),
      },
      oneOf: [['name', 'envFile']], exclusive: [['env', 'org', 'user']], with: { secretValue: ['name'], visibility: ['org'] },
      check: i => (i['name'] !== undefined && i['secretValue'] === undefined) ? 'op set needs secretValue with name' : reposAndVisibility('secret')(i),
      args: [pos('name'), val('-f', 'envFile'), val('-a', 'app'), val('-e', 'env'), val('-o', 'org'), on('-u', 'user'), csv('-r', 'repos'), val('-v', 'visibility'), on('--no-store', 'noStore')],
      stdin: i => typeof i['secretValue'] === 'string' ? i['secretValue'] : undefined, secretStdin: true, out: { kind: 'mutation' }, target: i => String(i['name'] ?? i['envFile'] ?? ''),
    },
    {
      name: 'delete', command: ['secret', 'delete'], cls: 'destructive', limitS: 30, repo: true, fields: { name: field.str('Name of the secret.'), ...secretScope },
      required: ['name'], exclusive: [['env', 'org', 'user']], args: [pos('name'), val('-a', 'app'), val('-e', 'env'), val('-o', 'org'), on('-u', 'user')], out: { kind: 'mutation' }, target: i => String(i['name']),
    },
  ],
});

export const ghVariableTool = defineGhFamily({
  id: 'gh_variable', dashSafe: true, description: 'Repository, environment and organization variables: list, set (the value is sent on standard input) and delete.',
  ops: [
    { name: 'list', command: ['variable', 'list'], cls: 'none', limitS: 30, repo: true, fields: scope, exclusive: [['env', 'org']], args: [val('-e', 'env'), val('-o', 'org')], out: { kind: 'items', jsonFields: VARIABLE_ITEM } },
    {
      name: 'set', command: ['variable', 'set'], cls: 'common', limitS: 30, repo: true,
      fields: {
        name: field.str('Name of the variable.'), envFile: field.str('A dotenv file of variable names and values, read by gh.'), value: field.str('Value of the variable, sent on standard input.', true),
        ...scope, repos: field.strs('Repositories that can access an organization variable.'), visibility: field.oneOf(VISIBILITY, 'Visibility of an organization variable.'),
      },
      oneOf: [['name', 'envFile']], exclusive: [['env', 'org']], with: { value: ['name'], visibility: ['org'] },
      check: i => (i['name'] !== undefined && i['value'] === undefined) ? 'op set needs value with name' : reposAndVisibility('variable')(i),
      args: [pos('name'), val('-f', 'envFile'), val('-e', 'env'), val('-o', 'org'), csv('-r', 'repos'), val('-v', 'visibility')],
      stdin: i => typeof i['value'] === 'string' ? i['value'] : undefined, secretStdin: true, out: { kind: 'mutation' }, target: i => String(i['name'] ?? i['envFile'] ?? ''),
    },
    {
      name: 'delete', command: ['variable', 'delete'], cls: 'destructive', limitS: 30, repo: true, fields: { name: field.str('Name of the variable.'), ...scope },
      required: ['name'], exclusive: [['env', 'org']], args: [pos('name'), val('-e', 'env'), val('-o', 'org')], out: { kind: 'mutation' }, target: i => String(i['name']),
    },
  ],
});

// ---------------------------------------------------------------------------
// gh_cache
// ---------------------------------------------------------------------------

export const ghCacheTool = defineGhFamily({
  id: 'gh_cache', dashSafe: true, description: 'Actions caches: list and delete (one by ID or key, or all).',
  ops: [
    {
      name: 'list', command: ['cache', 'list'], cls: 'none', limitS: 30, repo: true,
      fields: { key: field.str('Filter by cache key prefix.'), ref: field.str('Filter by ref (refs/heads/<branch> or refs/pull/<number>/merge).'), sort: field.oneOf(['created_at', 'last_accessed_at', 'size_in_bytes']), order: field.oneOf(ORDER), limit: field.int('Maximum number of caches.') },
      args: [val('-k', 'key'), val('-r', 'ref'), val('-S', 'sort'), val('-O', 'order'), val('-L', 'limit')],
      out: { kind: 'items', jsonFields: ['createdAt', 'id', 'key', 'lastAccessedAt', 'ref', 'sizeInBytes', 'version'] },
    },
    {
      name: 'delete', command: ['cache', 'delete'], cls: 'destructive', limitS: 30, repo: true,
      fields: { id: field.int('Cache ID.'), key: field.str('Cache key.'), all: field.bool('Delete all caches.') }, oneOf: [['id', 'key', 'all']],
      args: [pos('id'), pos('key'), on('--all', 'all')], out: { kind: 'mutation' }, target: i => String(i['id'] ?? i['key'] ?? 'all'),
    },
  ],
});

// ---------------------------------------------------------------------------
// gh_ssh_key and gh_gpg_key
// ---------------------------------------------------------------------------

export const ghSshKeyTool = defineGhFamily({
  id: 'gh_ssh_key', dashSafe: true, description: 'SSH keys of your account: list, add (from a file or as public-key text) and delete.',
  ops: [
    { name: 'list', command: ['ssh-key', 'list'], cls: 'none', limitS: 30, args: [], out: { kind: 'rows' } },
    {
      name: 'add', command: ['ssh-key', 'add'], cls: 'common', limitS: 30,
      fields: { keyFile: field.str('Path of the public key file.'), key: field.str('Public key text, sent on standard input.'), title: field.str('Title of the key.'), type: field.oneOf(['authentication', 'signing']) },
      oneOf: [['keyFile', 'key']], args: [pos('keyFile'), val('-t', 'title'), val('--type', 'type')], stdin: i => typeof i['key'] === 'string' ? i['key'] : undefined, out: { kind: 'mutation' }, target: i => String(i['title'] ?? i['keyFile'] ?? ''),
    },
    { name: 'delete', command: ['ssh-key', 'delete'], cls: 'destructive', limitS: 30, fields: { id: field.str('ID of the key.') }, required: ['id'], args: [pos('id'), lit('--yes')], out: { kind: 'mutation' }, target: i => String(i['id']) },
  ],
});

export const ghGpgKeyTool = defineGhFamily({
  id: 'gh_gpg_key', dashSafe: true, description: 'GPG keys of your account: list, add (from a file or as public-key text) and delete.',
  ops: [
    { name: 'list', command: ['gpg-key', 'list'], cls: 'none', limitS: 30, args: [], out: { kind: 'rows' } },
    {
      name: 'add', command: ['gpg-key', 'add'], cls: 'common', limitS: 30,
      fields: { keyFile: field.str('Path of the public key file.'), key: field.str('Public key text, sent on standard input.'), title: field.str('Title of the key.') },
      oneOf: [['keyFile', 'key']], args: [pos('keyFile'), val('-t', 'title')], stdin: i => typeof i['key'] === 'string' ? i['key'] : undefined, out: { kind: 'mutation' }, target: i => String(i['title'] ?? i['keyFile'] ?? ''),
    },
    { name: 'delete', command: ['gpg-key', 'delete'], cls: 'destructive', limitS: 30, fields: { keyId: field.str('ID of the key.') }, required: ['keyId'], args: [pos('keyId'), lit('--yes')], out: { kind: 'mutation' }, target: i => String(i['keyId']) },
  ],
});
