/** Jira tools -- registration entry point: five tools, 32 ops (jira_workitem 15, jira_comment 5, jira_link 4, jira_project 7, jira_auth 1). */

import { registerTool } from '../../registry.js';
import { jiraAuthTool } from './auth.js';
import { jiraCommentTool } from './comment.js';
import { jiraLinkTool } from './link.js';
import { jiraProjectTool } from './project.js';
import { jiraWorkitemTool } from './workitem.js';

export function registerJiraTools(): void {
  registerTool(jiraWorkitemTool);
  registerTool(jiraCommentTool);
  registerTool(jiraLinkTool);
  registerTool(jiraProjectTool);
  registerTool(jiraAuthTool);
}
