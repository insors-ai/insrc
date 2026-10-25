/**
 * The repository families of gh: gh_issue_manage, gh_pr_manage, gh_release_asset, gh_repo_manage, gh_run_manage,
 * gh_workflow_manage and gh_project_manage. Each is one tool with an `op`; the table of ops is the contract
 * (the Story LLD, section 2.8): the fields, the rules between them, the class, the limit and the answer.
 *
 * No op can reach a prompt: an input whose absence makes gh ask a person is required, and a flag that
 * suppresses a prompt (--yes) is passed by the tool itself.
 */

import { Type } from '@sinclair/typebox';
import type { TSchema } from '@sinclair/typebox';
import { defineGhFamily, field, lit, on, onOff, pos, rep, spread, val } from './op-table.js';
import type { OpDef } from './op-table.js';

const List = (fields: readonly string[]): TSchema => Type.Array(Type.Object(Object.fromEntries(fields.map(k => [k, Type.Unknown()]))));

const LOCK_REASONS = ['off_topic', 'resolved', 'spam', 'too_heated'] as const;
const ISSUE_ITEM = ['assignees', 'author', 'labels', 'number', 'state', 'title', 'updatedAt', 'url'] as const;
const PR_ITEM = ['number', 'title', 'state', 'headRefName', 'reviewDecision', 'url'] as const;

const number = { number: field.int('Issue or pull request number.') } as const;

// ---------------------------------------------------------------------------
// gh_issue_manage
// ---------------------------------------------------------------------------

const issueOps: OpDef[] = [
  {
    name: 'status', command: ['issue', 'status'], cls: 'none', limitS: 30, repo: true, args: [],
    out: { kind: 'object', jsonFields: ISSUE_ITEM, shape: { createdBy: List(ISSUE_ITEM), assigned: List(ISSUE_ITEM), mentioned: List(ISSUE_ITEM) } },
  },
  { name: 'delete', command: ['issue', 'delete'], cls: 'destructive', limitS: 30, repo: true, fields: number, required: ['number'], args: [pos('number'), lit('--yes')], out: { kind: 'mutation' }, target: i => `#${String(i['number'])}` },
  {
    name: 'develop', command: ['issue', 'develop'], cls: 'common', limitS: 60, repo: true,
    fields: { ...number, name: field.str('Name of the branch to create.'), branchRepo: field.str('Repository (name or URL) to create the branch in.'), base: field.str('Branch to make the new branch from.'), checkout: field.bool('Check the branch out after creating it.') },
    required: ['number'], args: [pos('number'), val('-n', 'name'), val('--branch-repo', 'branchRepo'), val('-b', 'base'), on('-c', 'checkout')], out: { kind: 'mutation' }, target: i => `#${String(i['number'])}`,
  },
  { name: 'develop-list', command: ['issue', 'develop'], cls: 'none', limitS: 30, repo: true, fields: number, required: ['number'], args: [pos('number'), lit('--list')], out: { kind: 'rows' } },
  {
    name: 'lock', command: ['issue', 'lock'], cls: 'common', limitS: 30, repo: true,
    fields: { ...number, reason: field.oneOf(LOCK_REASONS, 'Why the conversation is locked.') }, required: ['number'], args: [pos('number'), val('-r', 'reason')], out: { kind: 'mutation' }, target: i => `#${String(i['number'])}`,
  },
  ...(['unlock', 'pin', 'unpin'] as const).map((name): OpDef => ({
    name, command: ['issue', name], cls: 'common', limitS: 30, repo: true, fields: number, required: ['number'], args: [pos('number')], out: { kind: 'mutation' }, target: i => `#${String(i['number'])}`,
  })),
  {
    name: 'transfer', command: ['issue', 'transfer'], cls: 'destructive', limitS: 60, repo: true,
    fields: { ...number, destinationRepo: field.str('OWNER/NAME to move the issue to.') }, required: ['number', 'destinationRepo'], args: [pos('number'), pos('destinationRepo')], out: { kind: 'mutation' }, target: i => `#${String(i['number'])}`,
  },
];

export const ghIssueManageTool = defineGhFamily({ id: 'gh_issue_manage', description: 'Issue operations beyond create, edit and close: status, delete, develop (create or list linked branches), lock, unlock, pin, unpin and transfer.', ops: issueOps });

// ---------------------------------------------------------------------------
// gh_pr_manage
// ---------------------------------------------------------------------------

const prTarget = { target: field.str('Pull request number, URL or branch.') } as const;

const prOps: OpDef[] = [
  {
    name: 'status', command: ['pr', 'status'], cls: 'none', limitS: 30, repo: true, fields: { conflictStatus: field.bool('Show the merge conflict status of each pull request.') }, args: [on('-c', 'conflictStatus')],
    out: { kind: 'object', jsonFields: PR_ITEM, shape: { currentBranch: Type.Unknown(), createdBy: List(PR_ITEM), needsReview: List(PR_ITEM) } },
  },
  {
    name: 'checkout', command: ['pr', 'checkout'], cls: 'common', limitS: 60, repo: true,
    fields: { ...prTarget, branch: field.str('Local branch name to use.'), detach: field.bool('Check out with a detached HEAD.'), force: field.bool('Reset the existing local branch to the latest state of the pull request.'), recurseSubmodules: field.bool('Update all submodules after checkout.') },
    required: ['target'], args: [pos('target'), val('-b', 'branch'), on('--detach', 'detach'), on('-f', 'force'), on('--recurse-submodules', 'recurseSubmodules')], out: { kind: 'mutation' }, target: i => String(i['target']),
  },
  {
    name: 'lock', command: ['pr', 'lock'], cls: 'common', limitS: 30, repo: true,
    fields: { ...number, reason: field.oneOf(LOCK_REASONS, 'Why the conversation is locked.') }, required: ['number'], args: [pos('number'), val('-r', 'reason')], out: { kind: 'mutation' }, target: i => `#${String(i['number'])}`,
  },
  { name: 'unlock', command: ['pr', 'unlock'], cls: 'common', limitS: 30, repo: true, fields: number, required: ['number'], args: [pos('number')], out: { kind: 'mutation' }, target: i => `#${String(i['number'])}` },
  {
    name: 'reopen', command: ['pr', 'reopen'], cls: 'common', limitS: 30, repo: true, fields: { ...prTarget, comment: field.str('A comment to add when reopening.') },
    required: ['target'], args: [pos('target'), val('-c', 'comment')], out: { kind: 'mutation' }, target: i => String(i['target']),
  },
];

export const ghPrManageTool = defineGhFamily({ id: 'gh_pr_manage', description: 'Pull request operations beyond create, edit and merge: status, checkout, lock, unlock and reopen.', ops: prOps });

// ---------------------------------------------------------------------------
// gh_release_asset
// ---------------------------------------------------------------------------

const releaseOps: OpDef[] = [
  {
    name: 'download', command: ['release', 'download'], cls: 'common', limitS: 300, repo: true,
    fields: {
      tag: field.str('Release tag; omit for the latest release (then a pattern or an archive is needed).'),
      pattern: field.strs('Download only assets that match a glob pattern.'),
      archive: field.oneOf(['zip', 'tar.gz'], 'Download the source archive in this format.'),
      dir: field.str('Directory to download into.'), output: field.str('File to write a single asset to (never "-").'),
      clobber: field.bool('Overwrite existing files of the same name.'), skipExisting: field.bool('Skip downloading when files of the same name exist.'),
    },
    atLeastOne: [['tag', 'pattern', 'archive']], exclusive: [['clobber', 'skipExisting'], ['output', 'dir']],
    check: i => i['output'] === '-' ? 'op download: output must be a file path, never "-"' : undefined,
    args: [pos('tag'), rep('-p', 'pattern'), val('-A', 'archive'), val('-D', 'dir'), val('-O', 'output'), on('--clobber', 'clobber'), on('--skip-existing', 'skipExisting')],
    out: { kind: 'mutation' }, target: i => String(i['tag'] ?? i['archive'] ?? ''),
  },
  {
    name: 'upload', command: ['release', 'upload'], cls: 'common', limitS: 300, repo: true,
    fields: { tag: field.str('Release tag.'), files: field.strs('Files to upload.'), clobber: field.bool('Overwrite existing assets of the same name.') },
    required: ['tag', 'files'], args: [pos('tag'), spread('files'), on('--clobber', 'clobber')], out: { kind: 'mutation' }, target: i => String(i['tag']),
  },
  {
    name: 'delete-asset', command: ['release', 'delete-asset'], cls: 'destructive', limitS: 30, repo: true,
    fields: { tag: field.str('Release tag.'), asset: field.str('Name of the asset to delete.') },
    required: ['tag', 'asset'], args: [pos('tag'), pos('asset'), lit('--yes')], out: { kind: 'mutation' }, target: i => `${String(i['tag'])}/${String(i['asset'])}`,
  },
];

export const ghReleaseAssetTool = defineGhFamily({ id: 'gh_release_asset', description: 'Release asset operations: download assets or a source archive, upload files, delete an asset.', ops: releaseOps });

// ---------------------------------------------------------------------------
// gh_repo_manage
// ---------------------------------------------------------------------------

const repository = { repository: field.str('Repository as OWNER/NAME.') } as const;

const REPO_EDIT_FLAGS = [
  ['allowForking', '--allow-forking'], ['allowUpdateBranch', '--allow-update-branch'], ['deleteBranchOnMerge', '--delete-branch-on-merge'],
  ['enableAutoMerge', '--enable-auto-merge'], ['enableDiscussions', '--enable-discussions'], ['enableIssues', '--enable-issues'],
  ['enableMergeCommit', '--enable-merge-commit'], ['enableProjects', '--enable-projects'], ['enableRebaseMerge', '--enable-rebase-merge'],
  ['enableSquashMerge', '--enable-squash-merge'], ['enableWiki', '--enable-wiki'], ['template', '--template'],
] as const;

const repoEditFields = {
  ...repository,
  description: field.str('Description of the repository.', true), homepage: field.str('Repository home page URL.', true), defaultBranch: field.str('Default branch name.'),
  ...Object.fromEntries(REPO_EDIT_FLAGS.map(([name]) => [name, field.bool()])),
  addTopic: field.strs('Topics to add.'), removeTopic: field.strs('Topics to remove.'),
  visibility: field.oneOf(['public', 'private', 'internal'], 'Change the visibility of the repository.'),
};

const repoOps: OpDef[] = [
  ...(['archive', 'unarchive'] as const).map((name): OpDef => ({
    name, command: ['repo', name], cls: 'common', limitS: 30, fields: repository, required: ['repository'], args: [pos('repository'), lit('--yes')], out: { kind: 'mutation' }, target: i => String(i['repository']),
  })),
  {
    name: 'edit', command: ['repo', 'edit'], cls: 'common', limitS: 30, fields: repoEditFields, required: ['repository'],
    atLeastOne: [Object.keys(repoEditFields).filter(k => k !== 'repository')],
    args: [pos('repository'), val('-d', 'description'), val('-h', 'homepage'), val('--default-branch', 'defaultBranch'), ...REPO_EDIT_FLAGS.map(([name, flag]) => onOff(flag, name)), rep('--add-topic', 'addTopic'), rep('--remove-topic', 'removeTopic'), val('--visibility', 'visibility')],
    out: { kind: 'mutation' }, target: i => String(i['repository']),
  },
  { name: 'rename', command: ['repo', 'rename'], cls: 'destructive', limitS: 60, repo: true, fields: { newName: field.str('The new name of the repository.') }, required: ['newName'], args: [pos('newName'), lit('--yes')], out: { kind: 'mutation' }, target: i => String(i['newName']) },
  {
    name: 'set-default', command: ['repo', 'set-default'], cls: 'common', limitS: 30,
    fields: { ...repository, view: field.bool('Show the current default repository.'), unset: field.bool('Unset the current default repository.') },
    oneOf: [['repository', 'view', 'unset']], args: [pos('repository'), on('-v', 'view'), on('-u', 'unset')], out: { kind: 'mutation' }, target: i => String(i['repository'] ?? ''),
  },
  {
    name: 'sync', command: ['repo', 'sync'], cls: 'common', limitS: 120,
    fields: { destination: field.str('Destination repository.'), source: field.str('Source repository.'), branch: field.str('Branch to sync.'), force: field.bool('Hard reset the branch of the destination to match the source.') },
    args: [pos('destination'), val('-s', 'source'), val('-b', 'branch'), on('--force', 'force')], out: { kind: 'mutation' }, target: i => String(i['destination'] ?? ''),
  },
  { name: 'deploy-key-list', command: ['repo', 'deploy-key', 'list'], cls: 'none', limitS: 30, repo: true, args: [], out: { kind: 'items', jsonFields: ['createdAt', 'id', 'key', 'readOnly', 'title'] } },
  {
    name: 'deploy-key-add', command: ['repo', 'deploy-key', 'add'], cls: 'common', limitS: 30, repo: true,
    fields: { keyFile: field.str('Path of the public key file.'), title: field.str('Title of the key.'), allowWrite: field.bool('Allow write access for the key.') },
    required: ['keyFile'], args: [pos('keyFile'), val('-t', 'title'), on('-w', 'allowWrite')], out: { kind: 'mutation' }, target: i => String(i['keyFile']),
  },
  { name: 'deploy-key-delete', command: ['repo', 'deploy-key', 'delete'], cls: 'destructive', limitS: 30, repo: true, fields: { keyId: field.str('ID of the key.') }, required: ['keyId'], args: [pos('keyId')], out: { kind: 'mutation' }, target: i => String(i['keyId']) },
];

export const ghRepoManageTool = defineGhFamily({ id: 'gh_repo_manage', description: 'Repository operations beyond create, fork, clone and delete: archive, unarchive, edit, rename, set-default, sync and deploy keys.', ops: repoOps });

// ---------------------------------------------------------------------------
// gh_run_manage and gh_workflow_manage
// ---------------------------------------------------------------------------

const runId = { runId: field.int('Run database ID.') } as const;

export const ghRunManageTool = defineGhFamily({
  id: 'gh_run_manage', description: 'Workflow run operations beyond list, view, rerun and cancel: delete a run, download its artifacts.',
  ops: [
    { name: 'delete', command: ['run', 'delete'], cls: 'destructive', limitS: 30, repo: true, fields: runId, required: ['runId'], args: [pos('runId')], out: { kind: 'mutation' }, target: i => String(i['runId']) },
    {
      name: 'download', command: ['run', 'download'], cls: 'common', limitS: 300, repo: true,
      fields: { ...runId, name: field.strs('Artifact names to download.'), pattern: field.strs('Artifact glob patterns to download.'), dir: field.str('Directory to download into.') },
      required: ['runId'], args: [pos('runId'), rep('-n', 'name'), rep('-p', 'pattern'), val('-D', 'dir')], out: { kind: 'mutation' }, target: i => String(i['runId']),
    },
  ],
});

const workflow = { workflow: field.str('Workflow ID, name or file name.') } as const;

export const ghWorkflowManageTool = defineGhFamily({
  id: 'gh_workflow_manage', description: 'Workflow operations beyond list and run: view a workflow (or its YAML), enable, disable.',
  ops: [
    {
      name: 'view', command: ['workflow', 'view'], cls: 'none', limitS: 30, repo: true,
      fields: { ...workflow, ref: field.str('Branch or tag holding the workflow file.'), yaml: field.bool('Show the workflow YAML.') },
      required: ['workflow'], args: [pos('workflow'), val('-r', 'ref'), on('-y', 'yaml')], out: { kind: 'text' },
    },
    ...(['enable', 'disable'] as const).map((name): OpDef => ({
      name, command: ['workflow', name], cls: 'common', limitS: 30, repo: true, fields: workflow, required: ['workflow'], args: [pos('workflow')], out: { kind: 'mutation' }, target: i => String(i['workflow']),
    })),
  ],
});

// ---------------------------------------------------------------------------
// gh_project_manage
// ---------------------------------------------------------------------------

const projectNumber = { number: field.int('Project number.') } as const;
const owner = { owner: field.str('Login of the owner; "@me" for the current user.') } as const;
const FORMAT_JSON = lit('--format', 'json');
const projectTarget = (i: Record<string, unknown>): string => String(i['number'] ?? i['id'] ?? i['title'] ?? '');

const projectOps: OpDef[] = [
  {
    name: 'copy', command: ['project', 'copy'], cls: 'common', limitS: 60, fields: { ...projectNumber, title: field.str('Title of the new project.'), sourceOwner: field.str('Login of the source owner.'), targetOwner: field.str('Login of the target owner.'), drafts: field.bool('Include draft issues when copying.') },
    required: ['number', 'title'], args: [pos('number'), val('--title', 'title'), val('--source-owner', 'sourceOwner'), val('--target-owner', 'targetOwner'), on('--drafts', 'drafts'), FORMAT_JSON], out: { kind: 'mutation' }, target: projectTarget,
  },
  { name: 'create', command: ['project', 'create'], cls: 'common', limitS: 60, fields: { ...owner, title: field.str('Title of the project.') }, required: ['title'], args: [val('--title', 'title'), val('--owner', 'owner'), FORMAT_JSON], out: { kind: 'mutation' }, target: projectTarget },
  {
    name: 'edit', command: ['project', 'edit'], cls: 'common', limitS: 30,
    fields: { ...projectNumber, ...owner, title: field.str('New title.'), description: field.str('New description.', true), readme: field.str('New readme.', true), visibility: field.oneOf(['PUBLIC', 'PRIVATE'], 'Change the project visibility.') },
    required: ['number'], args: [pos('number'), val('--owner', 'owner'), val('--title', 'title'), val('-d', 'description'), val('--readme', 'readme'), val('--visibility', 'visibility'), FORMAT_JSON], out: { kind: 'mutation' }, target: projectTarget,
  },
  { name: 'close', command: ['project', 'close'], cls: 'destructive', limitS: 30, fields: { ...projectNumber, ...owner, undo: field.bool('Reopen a closed project.') }, required: ['number'], args: [pos('number'), val('--owner', 'owner'), on('--undo', 'undo'), FORMAT_JSON], out: { kind: 'mutation' }, target: projectTarget },
  { name: 'delete', command: ['project', 'delete'], cls: 'destructive', limitS: 30, fields: { ...projectNumber, ...owner }, required: ['number'], args: [pos('number'), val('--owner', 'owner'), FORMAT_JSON], out: { kind: 'mutation' }, target: projectTarget },
  ...(['link', 'unlink'] as const).map((name): OpDef => ({
    name, command: ['project', name], cls: 'common', limitS: 30,
    fields: { ...projectNumber, ...owner, targetRepo: field.str('Repository to (un)link, as OWNER/NAME.'), team: field.str('Team to (un)link.') },
    required: ['number'], oneOf: [['targetRepo', 'team']], args: [pos('number'), val('--owner', 'owner'), val('-R', 'targetRepo'), val('-T', 'team')], out: { kind: 'mutation' }, target: projectTarget,
  })),
  { name: 'mark-template', command: ['project', 'mark-template'], cls: 'common', limitS: 30, fields: { ...projectNumber, ...owner, undo: field.bool('Unmark the project as a template.') }, required: ['number'], args: [pos('number'), val('--owner', 'owner'), on('--undo', 'undo'), FORMAT_JSON], out: { kind: 'mutation' }, target: projectTarget },
  {
    name: 'item-create', command: ['project', 'item-create'], cls: 'common', limitS: 30, fields: { ...projectNumber, ...owner, title: field.str('Title of the draft issue.'), body: field.str('Body of the draft issue.', true) },
    required: ['number', 'title'], args: [pos('number'), val('--owner', 'owner'), val('--title', 'title'), val('--body', 'body'), FORMAT_JSON], out: { kind: 'mutation' }, target: projectTarget,
  },
  {
    name: 'field-create', command: ['project', 'field-create'], cls: 'common', limitS: 30,
    fields: { ...projectNumber, ...owner, name: field.str('Name of the new field.'), dataType: field.oneOf(['TEXT', 'SINGLE_SELECT', 'DATE', 'NUMBER'], 'Data type of the field.'), singleSelectOptions: field.strs('Options of a SINGLE_SELECT field.') },
    required: ['number', 'name', 'dataType'], check: i => i['singleSelectOptions'] !== undefined && i['dataType'] !== 'SINGLE_SELECT' ? 'op field-create accepts singleSelectOptions only with the data type SINGLE_SELECT' : undefined,
    args: [pos('number'), val('--owner', 'owner'), val('--name', 'name'), val('--data-type', 'dataType'), rep('--single-select-options', 'singleSelectOptions'), FORMAT_JSON], out: { kind: 'mutation' }, target: i => String(i['name']),
  },
  { name: 'field-delete', command: ['project', 'field-delete'], cls: 'destructive', limitS: 30, fields: { id: field.str('ID of the field to delete.') }, required: ['id'], args: [val('--id', 'id'), FORMAT_JSON], out: { kind: 'mutation' }, target: projectTarget },
];

export const ghProjectManageTool = defineGhFamily({ id: 'gh_project_manage', description: 'Projects v2 operations beyond list, view and items: copy, create, edit, close, delete, link, unlink, mark-template, item-create, field-create and field-delete.', ops: projectOps });
