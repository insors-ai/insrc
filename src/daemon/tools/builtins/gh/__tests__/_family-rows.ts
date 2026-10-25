/** The table of ops with the argv each builds, shared by the family tests. */

import type { ApprovalClass } from '../../../types.js';
import { ghAuthTool, ghCodespaceTool, ghConfigTool, ghExtensionTool, ghOrgTool, ghRulesetTool, ghSearchTool, ghStatusTool } from '../account.js';
import { ghIssueManageTool, ghPrManageTool, ghProjectManageTool, ghReleaseAssetTool, ghRepoManageTool, ghRunManageTool, ghWorkflowManageTool } from '../manage.js';
import type { GhFamilyTool } from '../op-table.js';
import { ghCacheTool, ghGistTool, ghGpgKeyTool, ghLabelTool, ghSecretTool, ghSshKeyTool, ghVariableTool } from '../resources.js';

export const PROJECT_JSON = '{"url":"https://github.com/orgs/o/projects/2","number":2}';
const ISSUE_ITEM = 'assignees,author,labels,number,state,title,updatedAt,url';
const PR_ITEM = 'number,title,state,headRefName,reviewDecision,url';

/** tool, input, the gh argv the table gives, what gh prints, the class of the call and its limit in seconds */
export type Row = [GhFamilyTool, Record<string, unknown>, string, string, ApprovalClass, number];

export const ROWS: Row[] = [
	// gh_issue_manage
	[ghIssueManageTool, { op: 'status' }, `issue status --json ${ISSUE_ITEM}`, '{"createdBy":[],"assigned":[],"mentioned":[]}', 'none', 30],
	[ghIssueManageTool, { op: 'delete', number: 3, repo: 'o/r' }, 'issue delete 3 --yes -R o/r', '', 'destructive', 30],
	[ghIssueManageTool, { op: 'develop', number: 3, name: 'b', branchRepo: 'o/x', base: 'main', checkout: true }, 'issue develop 3 -n b --branch-repo o/x -b main -c', 'b\n', 'common', 60],
	[ghIssueManageTool, { op: 'develop-list', number: 3 }, 'issue develop 3 --list', 'br\thttps://github.com/o/r/tree/br\n', 'none', 30],
	[ghIssueManageTool, { op: 'lock', number: 3, reason: 'spam' }, 'issue lock 3 -r spam', '', 'common', 30],
	[ghIssueManageTool, { op: 'unlock', number: 3 }, 'issue unlock 3', '', 'common', 30],
	[ghIssueManageTool, { op: 'pin', number: 3 }, 'issue pin 3', '', 'common', 30],
	[ghIssueManageTool, { op: 'unpin', number: 3 }, 'issue unpin 3', '', 'common', 30],
	[ghIssueManageTool, { op: 'transfer', number: 3, destinationRepo: 'o/x' }, 'issue transfer 3 o/x', 'https://github.com/o/x/issues/1\n', 'destructive', 60],
	// gh_pr_manage
	[ghPrManageTool, { op: 'status', conflictStatus: true }, `pr status -c --json ${PR_ITEM}`, '{"currentBranch":null,"createdBy":[],"needsReview":[]}', 'none', 30],
	[ghPrManageTool, { op: 'checkout', target: '12', branch: 'b', detach: true, recurseSubmodules: true }, 'pr checkout 12 -b b --detach --recurse-submodules', '', 'common', 60],
	[ghPrManageTool, { op: 'checkout', target: '12', force: true }, 'pr checkout 12 -f', '', 'destructive', 60],
	[ghPrManageTool, { op: 'lock', number: 3, reason: 'resolved' }, 'pr lock 3 -r resolved', '', 'common', 30],
	[ghPrManageTool, { op: 'unlock', number: 3 }, 'pr unlock 3', '', 'common', 30],
	[ghPrManageTool, { op: 'reopen', target: '12', comment: 'again' }, 'pr reopen 12 -c again', '', 'common', 30],
	// gh_release_asset
	[ghReleaseAssetTool, { op: 'download', tag: 'v1', pattern: ['*.zip', '*.tgz'], dir: 'd' }, 'release download v1 -p *.zip -p *.tgz -D d', '', 'common', 300],
	[ghReleaseAssetTool, { op: 'download', archive: 'zip', clobber: true, repo: 'o/r' }, 'release download -A zip --clobber -R o/r', '', 'destructive', 300],
	[ghReleaseAssetTool, { op: 'download', tag: 'v1', output: 'out.bin', skipExisting: true }, 'release download v1 -O out.bin --skip-existing', '', 'common', 300],
	[ghReleaseAssetTool, { op: 'upload', tag: 'v1', files: ['a.zip', 'b.zip'] }, 'release upload v1 a.zip b.zip', '', 'common', 300],
	[ghReleaseAssetTool, { op: 'upload', tag: 'v1', files: ['a.zip'], clobber: true }, 'release upload v1 a.zip --clobber', '', 'destructive', 300],
	[ghReleaseAssetTool, { op: 'delete-asset', tag: 'v1', asset: 'a.zip' }, 'release delete-asset v1 a.zip --yes', '', 'destructive', 30],
	// gh_repo_manage
	[ghRepoManageTool, { op: 'archive', repository: 'o/r' }, 'repo archive o/r --yes', '', 'common', 30],
	[ghRepoManageTool, { op: 'unarchive', repository: 'o/r' }, 'repo unarchive o/r --yes', '', 'common', 30],
	[ghRepoManageTool, { op: 'edit', repository: 'o/r', description: 'd', enableIssues: false, enableWiki: true, addTopic: ['a', 'b'], removeTopic: ['c'] }, 'repo edit o/r -d d --enable-issues=false --enable-wiki --add-topic a --add-topic b --remove-topic c', '', 'common', 30],
	[ghRepoManageTool, { op: 'edit', repository: 'o/r', visibility: 'private' }, 'repo edit o/r --visibility private', '', 'destructive', 30],
	[ghRepoManageTool, { op: 'rename', newName: 'n', repo: 'o/r' }, 'repo rename n --yes -R o/r', '', 'destructive', 60],
	[ghRepoManageTool, { op: 'set-default', repository: 'o/r' }, 'repo set-default o/r', '', 'common', 30],
	[ghRepoManageTool, { op: 'set-default', view: true }, 'repo set-default -v', 'o/r\n', 'common', 30],
	[ghRepoManageTool, { op: 'set-default', unset: true }, 'repo set-default -u', '', 'common', 30],
	[ghRepoManageTool, { op: 'sync', destination: 'o/r', source: 'o/u', branch: 'main' }, 'repo sync o/r -s o/u -b main', '', 'common', 120],
	[ghRepoManageTool, { op: 'sync', destination: 'o/r', force: true }, 'repo sync o/r --force', '', 'destructive', 120],
	[ghRepoManageTool, { op: 'deploy-key-list', repo: 'o/r' }, 'repo deploy-key list --json createdAt,id,key,readOnly,title -R o/r', '[{"createdAt":"c","id":1,"key":"k","readOnly":true,"title":"t"}]', 'none', 30],
	[ghRepoManageTool, { op: 'deploy-key-add', keyFile: 'k.pub', title: 't', allowWrite: true }, 'repo deploy-key add k.pub -t t -w', '', 'common', 30],
	[ghRepoManageTool, { op: 'deploy-key-delete', keyId: '5' }, 'repo deploy-key delete 5', '', 'destructive', 30],
	// gh_run_manage and gh_workflow_manage
	[ghRunManageTool, { op: 'delete', runId: 9 }, 'run delete 9', '', 'destructive', 30],
	[ghRunManageTool, { op: 'download', runId: 9, name: ['a'], pattern: ['p'], dir: 'd' }, 'run download 9 -n a -p p -D d', '', 'common', 300],
	[ghWorkflowManageTool, { op: 'view', workflow: 'ci.yml', ref: 'main', yaml: true }, 'workflow view ci.yml -r main -y', 'name: ci\n', 'none', 30],
	[ghWorkflowManageTool, { op: 'enable', workflow: 'ci.yml' }, 'workflow enable ci.yml', '', 'common', 30],
	[ghWorkflowManageTool, { op: 'disable', workflow: 'ci.yml' }, 'workflow disable ci.yml', '', 'common', 30],
	// gh_project_manage: --format json on the ops that accept it, none on link and unlink
	[ghProjectManageTool, { op: 'copy', number: 2, title: 'T', sourceOwner: 'a', targetOwner: 'b', drafts: true }, 'project copy 2 --title T --source-owner a --target-owner b --drafts --format json', PROJECT_JSON, 'common', 60],
	[ghProjectManageTool, { op: 'create', title: 'T', owner: 'o' }, 'project create --title T --owner o --format json', PROJECT_JSON, 'common', 60],
	[ghProjectManageTool, { op: 'edit', number: 2, title: 'T' }, 'project edit 2 --title T --format json', PROJECT_JSON, 'common', 30],
	[ghProjectManageTool, { op: 'edit', number: 2, visibility: 'PUBLIC' }, 'project edit 2 --visibility PUBLIC --format json', PROJECT_JSON, 'destructive', 30],
	[ghProjectManageTool, { op: 'close', number: 2, undo: true }, 'project close 2 --undo --format json', PROJECT_JSON, 'destructive', 30],
	[ghProjectManageTool, { op: 'delete', number: 2 }, 'project delete 2 --format json', PROJECT_JSON, 'destructive', 30],
	[ghProjectManageTool, { op: 'link', number: 2, owner: 'o', targetRepo: 'o/r' }, 'project link 2 --owner o -R o/r', '', 'common', 30],
	[ghProjectManageTool, { op: 'unlink', number: 2, team: 't' }, 'project unlink 2 -T t', '', 'common', 30],
	[ghProjectManageTool, { op: 'mark-template', number: 2, undo: true }, 'project mark-template 2 --undo --format json', PROJECT_JSON, 'common', 30],
	[ghProjectManageTool, { op: 'item-create', number: 2, title: 'T', body: 'B' }, 'project item-create 2 --title T --body B --format json', '{"id":"i"}', 'common', 30],
	[ghProjectManageTool, { op: 'field-create', number: 2, name: 'S', dataType: 'SINGLE_SELECT', singleSelectOptions: ['a', 'b'] }, 'project field-create 2 --name S --data-type SINGLE_SELECT --single-select-options a --single-select-options b --format json', '{"id":"f"}', 'common', 30],
	[ghProjectManageTool, { op: 'field-delete', id: 'F' }, 'project field-delete --id F --format json', '{"id":"F"}', 'destructive', 30],
];


const GIST_LIST = 'abc123\tmy notes\t2 files\tsecret\t2026-01-02T00:00:00Z\n';
const SSH_ROWS = 'laptop\tssh-ed25519 AAAA\t2026-01-01T00:00:00Z\t123\tauthentication\n';

export const ROWS2: Row[] = [
	// gh_label
	[ghLabelTool, { op: 'list', search: 'bug', sort: 'name', order: 'desc', limit: 5 }, 'label list -S bug --sort name --order desc -L 5 --json color,createdAt,description,id,isDefault,name,updatedAt,url', '[]', 'none', 30],
	[ghLabelTool, { op: 'create', name: 'bug', color: 'ff0000', description: 'd' }, 'label create bug -c ff0000 -d d', '', 'common', 30],
	[ghLabelTool, { op: 'create', name: 'bug', force: true }, 'label create bug -f', '', 'destructive', 30],
	[ghLabelTool, { op: 'edit', name: 'bug', color: '00ff00' }, 'label edit bug -c 00ff00', '', 'common', 30],
	[ghLabelTool, { op: 'edit', name: 'bug', newName: 'defect' }, 'label edit bug -n defect', '', 'destructive', 30],
	[ghLabelTool, { op: 'clone', sourceRepository: 'o/src' }, 'label clone o/src', '', 'common', 30],
	[ghLabelTool, { op: 'clone', sourceRepository: 'o/src', force: true }, 'label clone o/src -f', '', 'destructive', 30],
	[ghLabelTool, { op: 'delete', name: 'bug' }, 'label delete bug --yes', '', 'destructive', 30],
	// gh_gist
	[ghGistTool, { op: 'list', secret: true, limit: 3 }, 'gist list -L 3 --secret', GIST_LIST, 'none', 30],
	[ghGistTool, { op: 'view', id: 'abc', filename: 'a.txt', raw: true }, 'gist view abc -f a.txt -r', 'text\n', 'none', 30],
	[ghGistTool, { op: 'view', id: 'abc', listFiles: true }, 'gist view abc --files', 'a.txt\n', 'none', 30],
	[ghGistTool, { op: 'create', files: ['a.txt', 'b.txt'], description: 'd', public: true }, 'gist create a.txt b.txt -d d -p', 'https://gist.github.com/abc\n', 'common', 60],
	[ghGistTool, { op: 'create', content: 'hello', filename: 'h.txt' }, 'gist create - -f h.txt', 'https://gist.github.com/abc\n', 'common', 60],
	[ghGistTool, { op: 'edit', id: 'abc', add: 'new.txt', remove: 'old.txt', desc: 'd' }, 'gist edit abc -a new.txt -r old.txt -d d', '', 'common', 60],
	[ghGistTool, { op: 'rename', id: 'abc', oldFilename: 'a.txt', newFilename: 'b.txt' }, 'gist rename abc a.txt b.txt', '', 'destructive', 60],
	[ghGistTool, { op: 'clone', gist: 'abc', directory: 'dir' }, 'gist clone abc dir', '', 'common', 60],
	[ghGistTool, { op: 'delete', id: 'abc' }, 'gist delete abc', '', 'destructive', 30],
	// gh_secret and gh_variable: the value is not in argv
	[ghSecretTool, { op: 'list', app: 'actions', org: 'acme' }, 'secret list -a actions -o acme --json name,numSelectedRepos,selectedReposURL,updatedAt,visibility', '[]', 'none', 30],
	[ghSecretTool, { op: 'set', name: 'TOKEN', secretValue: 's3cret', app: 'dependabot', repo: 'o/r' }, 'secret set TOKEN -a dependabot -R o/r', '', 'common', 30],
	[ghSecretTool, { op: 'set', name: 'TOKEN', secretValue: 's3cret', org: 'acme', repos: ['a', 'b'], visibility: 'selected' }, 'secret set TOKEN -o acme -r a,b -v selected', '', 'destructive', 30],
	[ghSecretTool, { op: 'set', envFile: '.env' }, 'secret set -f .env', '', 'common', 30],
	[ghSecretTool, { op: 'delete', name: 'TOKEN', user: true }, 'secret delete TOKEN -u', '', 'destructive', 30],
	[ghVariableTool, { op: 'list', env: 'prod' }, 'variable list -e prod --json name,numSelectedRepos,selectedReposURL,updatedAt,value,visibility', '[]', 'none', 30],
	[ghVariableTool, { op: 'set', name: 'REGION', value: 'eu-1', env: 'prod' }, 'variable set REGION -e prod', '', 'common', 30],
	[ghVariableTool, { op: 'set', name: 'REGION', value: 'eu-1', org: 'acme', visibility: 'all' }, 'variable set REGION -o acme -v all', '', 'destructive', 30],
	[ghVariableTool, { op: 'set', envFile: 'vars.env' }, 'variable set -f vars.env', '', 'common', 30],
	[ghVariableTool, { op: 'delete', name: 'REGION', org: 'acme' }, 'variable delete REGION -o acme', '', 'destructive', 30],
	// gh_cache
	[ghCacheTool, { op: 'list', key: 'npm-', ref: 'refs/heads/main', sort: 'size_in_bytes', order: 'asc', limit: 2 }, 'cache list -k npm- -r refs/heads/main -S size_in_bytes -O asc -L 2 --json createdAt,id,key,lastAccessedAt,ref,sizeInBytes,version', '[]', 'none', 30],
	[ghCacheTool, { op: 'delete', id: 12 }, 'cache delete 12', '', 'destructive', 30],
	[ghCacheTool, { op: 'delete', key: 'npm-abc' }, 'cache delete npm-abc', '', 'destructive', 30],
	[ghCacheTool, { op: 'delete', all: true }, 'cache delete --all', '', 'destructive', 30],
	// gh_ssh_key and gh_gpg_key
	[ghSshKeyTool, { op: 'list' }, 'ssh-key list', SSH_ROWS, 'none', 30],
	[ghSshKeyTool, { op: 'add', keyFile: 'id.pub', title: 'laptop', type: 'signing' }, 'ssh-key add id.pub -t laptop --type signing', '', 'common', 30],
	[ghSshKeyTool, { op: 'add', key: 'ssh-ed25519 AAAA laptop' }, 'ssh-key add', '', 'common', 30],
	[ghSshKeyTool, { op: 'delete', id: '7' }, 'ssh-key delete 7 --yes', '', 'destructive', 30],
	[ghGpgKeyTool, { op: 'list' }, 'gpg-key list', 'AB12\tuser@example.com\t2026-01-01\n', 'none', 30],
	[ghGpgKeyTool, { op: 'add', keyFile: 'k.asc', title: 't' }, 'gpg-key add k.asc -t t', '', 'common', 30],
	[ghGpgKeyTool, { op: 'add', key: '-----BEGIN PGP PUBLIC KEY BLOCK-----' }, 'gpg-key add', '', 'common', 30],
	[ghGpgKeyTool, { op: 'delete', keyId: 'AB12' }, 'gpg-key delete AB12 --yes', '', 'destructive', 30],
];


const AUTH_TEXT = 'github.com\n  \u2713 Logged in to github.com account octocat (keyring)\n  - Active account: true\n';
const RULESETS = 'ID  NAME\n123 main protection\n456 release rules\n';
const CODESPACE_VIEW_FIELDS = 'billableOwner,createdAt,devcontainerPath,displayName,environmentId,gitStatus,idleTimeoutMinutes,lastUsedAt,location,machineDisplayName,machineName,name,owner,prebuild,recentFolders,repository,retentionExpiresAt,retentionPeriodDays,state,vscsTarget';
const CODESPACE_VIEW_JSON = JSON.stringify(Object.fromEntries(CODESPACE_VIEW_FIELDS.split(',').map(k => [k, null])));

/** tool, input, argv, gh's output, class, limit, and for a text conversion the model's answer */
export type Row3 = [GhFamilyTool, Record<string, unknown>, string, string, ApprovalClass, number, unknown?];

export const ROWS3: Row3[] = [
	[ghSearchTool, { op: 'code', query: 'TODO', extension: 'ts', match: ['file'], owner: ['o'], repo: ['o/r'], limit: 5 }, 'search code --extension ts -L 5 --match file --owner o -R o/r --json path,repository,sha,textMatches,url -- TODO', '[]', 'none', 60],
	[ghSearchTool, { op: 'commits', query: 'fix', author: 'a', merge: true, sort: 'author-date', order: 'asc', visibility: ['public', 'internal'] }, 'search commits --author a --merge --order asc --sort author-date --visibility public --visibility internal --json author,commit,committer,id,parents,repository,sha,url -- fix', '[]', 'none', 60],
	[ghSearchTool, { op: 'issues', query: 'x', state: 'open', includePrs: true, sort: 'reactions-+1' }, 'search issues --state open --include-prs --sort reactions-+1 --json assignees,author,authorAssociation,body,closedAt,commentsCount,createdAt,id,isLocked,isPullRequest,labels,number,repository,state,title,updatedAt,url -- x', '[]', 'none', 60],
	[ghSearchTool, { op: 'prs', query: 'x', base: 'main', head: 'f', checks: 'success', review: 'approved', draft: false, merged: true, reviewedBy: 'u' }, 'search prs -B main --checks success --draft=false -H f --merged --review approved --reviewed-by u --json assignees,author,authorAssociation,body,closedAt,commentsCount,createdAt,id,isLocked,isPullRequest,labels,number,repository,state,title,updatedAt,url,isDraft -- x', '[]', 'none', 60],
	[ghSearchTool, { op: 'repos', query: 'cli', language: 'go', includeForks: 'only', topic: ['a'], license: ['mit'], sort: 'stars' }, 'search repos --include-forks only --language go --license mit --sort stars --topic a', '[]', 'none', 60],
	[ghRulesetTool, { op: 'view', rulesetId: '123', org: 'acme' }, 'ruleset view 123 -o acme', 'rules\n', 'none', 30],
	[ghRulesetTool, { op: 'check', branch: 'main', repo: 'o/r' }, 'ruleset check main -R o/r', 'ok\n', 'none', 30],
	[ghOrgTool, { op: 'list', limit: 3 }, 'org list -L 3', 'acme\nwidgets\n', 'none', 30],
	[ghAuthTool, { op: 'switch', hostname: 'github.com', user: 'octocat' }, 'auth switch -h github.com -u octocat', '', 'common', 30],
	[ghAuthTool, { op: 'logout', hostname: 'github.com', user: 'octocat' }, 'auth logout -h github.com -u octocat', '', 'destructive', 30],
	[ghStatusTool, { op: 'status', exclude: ['o/a', 'o/b'], org: 'acme' }, 'status -e o/a,o/b -o acme', 'Assigned Issues\n', 'none', 60],
	[ghCodespaceTool, { op: 'list', limit: 2, repo: 'o/r' }, 'codespace list -L 2 -R o/r --json createdAt,displayName,gitStatus,lastUsedAt,machineName,name,owner,repository,state,vscsTarget', '[]', 'none', 30],
	[ghCodespaceTool, { op: 'view', codespace: 'cs1' }, `codespace view -c cs1 --json ${CODESPACE_VIEW_FIELDS}`, CODESPACE_VIEW_JSON, 'none', 30],
	[ghCodespaceTool, { op: 'logs', codespace: 'cs1' }, 'codespace logs -c cs1', 'log text\n', 'none', 60],
	[ghCodespaceTool, { op: 'ports', codespace: 'cs1' }, 'codespace ports -c cs1 --json browseUrl,label,sourcePort,visibility', '[]', 'none', 30],
	[ghCodespaceTool, { op: 'create', repo: 'o/r', branch: 'main', machine: 'basicLinux32gb', displayName: 'dev', idleTimeout: '30m', retentionPeriod: '72h', location: 'EastUs', devcontainerPath: '.devcontainer/a.json', status: true }, 'codespace create --default-permissions -R o/r -b main -m basicLinux32gb -d dev --idle-timeout 30m --retention-period 72h -l EastUs --devcontainer-path .devcontainer/a.json -s', 'cs-new\n', 'common', 600],
	[ghCodespaceTool, { op: 'edit', codespace: 'cs1', displayName: 'n', machine: 'm' }, 'codespace edit -c cs1 -d n -m m', '', 'common', 30],
	[ghCodespaceTool, { op: 'stop', codespace: 'cs1', org: 'acme', user: 'u' }, 'codespace stop -c cs1 -o acme -u u', '', 'common', 60],
	[ghCodespaceTool, { op: 'rebuild', codespace: 'cs1', full: true }, 'codespace rebuild -c cs1 --full', '', 'common', 600],
	[ghCodespaceTool, { op: 'delete', codespace: 'cs1', force: true }, 'codespace delete -c cs1 -f', '', 'destructive', 60],
	[ghCodespaceTool, { op: 'cp', codespace: 'cs1', sources: ['a.txt', 'dir'], dest: 'remote:/tmp/', recursive: true, profile: 'p' }, 'codespace cp -c cs1 -r -p p a.txt dir remote:/tmp/', '', 'common', 300],
	[ghCodespaceTool, { op: 'ports-visibility', codespace: 'cs1', ports: ['8080:public', '3000:org'] }, 'codespace ports visibility 8080:public 3000:org -c cs1', '', 'destructive', 30],
	[ghConfigTool, { op: 'get', key: 'git_protocol', host: 'github.com' }, 'config get git_protocol -h github.com', 'ssh\n', 'none', 30],
	[ghConfigTool, { op: 'list' }, 'config list', 'git_protocol=ssh\neditor=\n', 'none', 30],
	[ghExtensionTool, { op: 'list' }, 'extension list', 'gh copilot\tgithub/gh-copilot\tv1\n', 'none', 30],
	[ghExtensionTool, { op: 'search', query: 'copilot', owner: ['github'], license: ['mit'], sort: 'stars', order: 'desc', limit: 3 }, 'extension search --license mit -L 3 --order desc --owner github --sort stars --json createdAt', '[]', 'none', 60],
	[ghAuthTool, { op: 'status', hostname: 'github.com' }, 'auth status -h github.com', AUTH_TEXT, 'none', 30, { hosts: [{ host: 'github.com', login: 'octocat', active: true, state: 'logged-in' }] }],
	[ghRulesetTool, { op: 'list', org: 'acme', parents: false, limit: 5 }, 'ruleset list -o acme --parents=false -L 5 -R', RULESETS, 'none', 30, { items: [{ id: '123', name: 'main protection' }, { id: '456', name: 'release rules' }] }],
];

