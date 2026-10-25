/**
 * What the Jira tools cover of the installed acli, and what they leave out. Every leaf command of `acli jira` is one row: served
 * by a tool and op, or excluded for a stated reason. The exclusions are the scope amendment to DEF S006 ac1 (section 's6 scope
 * amendment to ac1' of docs/plans/tool-registry.md), which the user approved with the s6 LLD. The coverage tests check this table
 * against the registered ops, the installed acli and that section.
 */

export interface JiraCoverageRow {
  /** The words after 'acli jira'. */
  readonly command: string;
  readonly owner: 'covered' | 'excluded';
  readonly toolIds?: readonly string[];
  readonly op?: string;
  readonly reason?: string;
}

export const JIRA_COVERAGE: readonly JiraCoverageRow[] = [
  { command: 'workitem archive', owner: 'covered', toolIds: ['jira_workitem'], op: 'archive' },
  { command: 'workitem assign', owner: 'covered', toolIds: ['jira_workitem'], op: 'assign' },
  { command: 'workitem attachment delete', owner: 'covered', toolIds: ['jira_workitem'], op: 'attachment-delete' },
  { command: 'workitem attachment list', owner: 'covered', toolIds: ['jira_workitem'], op: 'attachment-list' },
  { command: 'workitem clone', owner: 'covered', toolIds: ['jira_workitem'], op: 'clone' },
  { command: 'workitem comment create', owner: 'covered', toolIds: ['jira_comment'], op: 'create' },
  { command: 'workitem comment delete', owner: 'covered', toolIds: ['jira_comment'], op: 'delete' },
  { command: 'workitem comment list', owner: 'covered', toolIds: ['jira_comment'], op: 'list' },
  { command: 'workitem comment update', owner: 'covered', toolIds: ['jira_comment'], op: 'update' },
  { command: 'workitem comment visibility', owner: 'covered', toolIds: ['jira_comment'], op: 'visibility' },
  { command: 'workitem create', owner: 'covered', toolIds: ['jira_workitem'], op: 'create' },
  { command: 'workitem delete', owner: 'covered', toolIds: ['jira_workitem'], op: 'delete' },
  { command: 'workitem edit', owner: 'covered', toolIds: ['jira_workitem'], op: 'edit' },
  { command: 'workitem link create', owner: 'covered', toolIds: ['jira_link'], op: 'create' },
  { command: 'workitem link delete', owner: 'covered', toolIds: ['jira_link'], op: 'delete' },
  { command: 'workitem link list', owner: 'covered', toolIds: ['jira_link'], op: 'list' },
  { command: 'workitem link type', owner: 'covered', toolIds: ['jira_link'], op: 'types' },
  { command: 'workitem list-watchers', owner: 'covered', toolIds: ['jira_workitem'], op: 'watcher-list' },
  { command: 'workitem search', owner: 'covered', toolIds: ['jira_workitem'], op: 'search', reason: 'op count runs the same command with --count' },
  { command: 'workitem transition', owner: 'covered', toolIds: ['jira_workitem'], op: 'transition' },
  { command: 'workitem unarchive', owner: 'covered', toolIds: ['jira_workitem'], op: 'unarchive' },
  { command: 'workitem view', owner: 'covered', toolIds: ['jira_workitem'], op: 'view' },
  { command: 'workitem watcher list', owner: 'covered', toolIds: ['jira_workitem'], op: 'watcher-list', reason: 'deprecated alias of list-watchers; the op runs list-watchers' },
  { command: 'workitem watcher remove', owner: 'covered', toolIds: ['jira_workitem'], op: 'watcher-remove' },
  { command: 'project archive', owner: 'covered', toolIds: ['jira_project'], op: 'archive' },
  { command: 'project create', owner: 'covered', toolIds: ['jira_project'], op: 'create' },
  { command: 'project delete', owner: 'covered', toolIds: ['jira_project'], op: 'delete' },
  { command: 'project list', owner: 'covered', toolIds: ['jira_project'], op: 'list' },
  { command: 'project restore', owner: 'covered', toolIds: ['jira_project'], op: 'restore' },
  { command: 'project update', owner: 'covered', toolIds: ['jira_project'], op: 'update' },
  { command: 'project view', owner: 'covered', toolIds: ['jira_project'], op: 'view' },
  { command: 'auth status', owner: 'covered', toolIds: ['jira_auth'], op: 'status' },
  { command: 'workitem create-bulk', owner: 'excluded', reason: 'reads a local file and creates an unbounded number of work items' },
  { command: 'auth login', owner: 'excluded', reason: 'handles credentials; the daemon never touches a credential' },
  { command: 'auth logout', owner: 'excluded', reason: 'changes the session' },
  { command: 'auth switch', owner: 'excluded', reason: 'changes the session' },
  { command: 'board create', owner: 'excluded', reason: 'outside the domains of ac1 (boards)' },
  { command: 'board delete', owner: 'excluded', reason: 'outside the domains of ac1 (boards)' },
  { command: 'board get', owner: 'excluded', reason: 'outside the domains of ac1 (boards)' },
  { command: 'board list-projects', owner: 'excluded', reason: 'outside the domains of ac1 (boards)' },
  { command: 'board list-sprints', owner: 'excluded', reason: 'outside the domains of ac1 (boards)' },
  { command: 'board search', owner: 'excluded', reason: 'outside the domains of ac1 (boards)' },
  { command: 'board view', owner: 'excluded', reason: 'outside the domains of ac1 (boards)' },
  { command: 'dashboard search', owner: 'excluded', reason: 'outside the domains of ac1 (dashboards)' },
  { command: 'field cancel-delete', owner: 'excluded', reason: 'outside the domains of ac1 (fields)' },
  { command: 'field create', owner: 'excluded', reason: 'outside the domains of ac1 (fields)' },
  { command: 'field delete', owner: 'excluded', reason: 'outside the domains of ac1 (fields)' },
  { command: 'field restore', owner: 'excluded', reason: 'outside the domains of ac1 (fields)' },
  { command: 'field update', owner: 'excluded', reason: 'outside the domains of ac1 (fields)' },
  { command: 'filter add-favourite', owner: 'excluded', reason: 'outside the domains of ac1 (filters)' },
  { command: 'filter change-owner', owner: 'excluded', reason: 'outside the domains of ac1 (filters)' },
  { command: 'filter get', owner: 'excluded', reason: 'outside the domains of ac1 (filters)' },
  { command: 'filter get-columns', owner: 'excluded', reason: 'outside the domains of ac1 (filters)' },
  { command: 'filter list', owner: 'excluded', reason: 'outside the domains of ac1 (filters)' },
  { command: 'filter list-columns', owner: 'excluded', reason: 'outside the domains of ac1 (filters)' },
  { command: 'filter reset-columns', owner: 'excluded', reason: 'outside the domains of ac1 (filters)' },
  { command: 'filter search', owner: 'excluded', reason: 'outside the domains of ac1 (filters)' },
  { command: 'filter update', owner: 'excluded', reason: 'outside the domains of ac1 (filters)' },
  { command: 'filter view', owner: 'excluded', reason: 'outside the domains of ac1 (filters)' },
  { command: 'sprint create', owner: 'excluded', reason: 'outside the domains of ac1 (sprints)' },
  { command: 'sprint delete', owner: 'excluded', reason: 'outside the domains of ac1 (sprints)' },
  { command: 'sprint list-workitems', owner: 'excluded', reason: 'outside the domains of ac1 (sprints)' },
  { command: 'sprint update', owner: 'excluded', reason: 'outside the domains of ac1 (sprints)' },
  { command: 'sprint view', owner: 'excluded', reason: 'outside the domains of ac1 (sprints)' },
];

/**
 * The exclusions of the amendment, as the section lists them: a command, a flag form of two commands, or a whole domain
 * ('board' is every command under 'acli jira board').
 */
export const EXCLUDED_BY_AMENDMENT: readonly string[] = [
  'workitem create-bulk',
  'project create --from-json',
  'project update --from-json',
  '--generate-json',
  'auth login',
  'auth logout',
  'auth switch',
  'board',
  'sprint',
  'dashboard',
  'field',
  'filter',
];

export interface JiraUnsupported { readonly operation: string; readonly reason: string }

/** Operations a user may expect that acli does not offer: they are absent from the tools, not approximated. */
export const JIRA_UNSUPPORTED: readonly JiraUnsupported[] = [
  { operation: 'transition a work item by transition id', reason: 'acli transitions by status name only (workitem transition --status); it exposes no transition id' },
  { operation: 'list the transitions a work item can take', reason: 'acli has no command for it; workitem view prints transitions as null' },
];
