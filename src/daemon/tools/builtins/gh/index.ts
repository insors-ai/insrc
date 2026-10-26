/**
 * GitHub tools -- registration entry point.
 *
 * Domains (46 tools, plus the op-based families in manage.ts):
 *   issue   list / view / create / comment / edit / close / reopen / link      (8)
 *   pr      list / view / diff / checks / files / create / edit / comment /
 *           review / merge / close / ready                                     (12)
 *   project list / view / item-list / item-add / item-update /
 *           item-archive / item-delete / field-list                            (8)
 *   run     list / view / rerun / cancel                                       (4)
 *   workflow list / run                                                        (2)
 *   release list / view / create / edit / publish / delete                     (6)
 *   repo    view / list / create / fork / delete / clone                       (6)
 */

import { registerTool } from '../../registry.js';
import {
  ghIssueListTool, ghIssueViewTool, ghIssueCreateTool, ghIssueCommentTool,
  ghIssueEditTool, ghIssueCloseTool, ghIssueReopenTool, ghIssueLinkTool,
} from './issue.js';
import {
  ghPrListTool, ghPrViewTool, ghPrDiffTool, ghPrChecksTool, ghPrFilesTool,
  ghPrCreateTool, ghPrEditTool, ghPrCommentTool, ghPrReviewTool,
  ghPrMergeTool, ghPrCloseTool, ghPrReadyTool,
} from './pr.js';
import {
  ghProjectListTool, ghProjectViewTool, ghProjectItemListTool,
  ghProjectItemAddTool, ghProjectItemUpdateTool, ghProjectItemArchiveTool,
  ghProjectItemDeleteTool, ghProjectFieldListTool,
} from './project.js';
import {
  ghRunListTool, ghRunViewTool, ghRunRerunTool, ghRunCancelTool,
  ghWorkflowListTool, ghWorkflowRunTool,
} from './actions.js';
import {
  ghReleaseListTool, ghReleaseViewTool, ghReleaseCreateTool,
  ghReleaseEditTool, ghReleasePublishTool, ghReleaseDeleteTool,
} from './release.js';
import {
  ghRepoViewTool, ghRepoListTool, ghRepoCreateTool,
  ghRepoForkTool, ghRepoDeleteTool, ghRepoCloneTool,
} from './repo.js';

import {
  ghIssueManageTool, ghPrManageTool, ghProjectManageTool, ghReleaseAssetTool, ghRepoManageTool, ghRunManageTool, ghWorkflowManageTool,
} from './manage.js';
import { ghAuthTool, ghCodespaceTool, ghConfigTool, ghExtensionTool, ghOrgTool, ghRulesetTool, ghSearchTool, ghStatusTool } from './account.js';
import { ghCacheTool, ghGistTool, ghGpgKeyTool, ghLabelTool, ghSecretTool, ghSshKeyTool, ghVariableTool } from './resources.js';
import { ghTrackerTool } from './tracker.js';

export function registerGhTools(): void {
  // Issues
  registerTool(ghIssueListTool);
  registerTool(ghIssueViewTool);
  registerTool(ghIssueCreateTool);
  registerTool(ghIssueCommentTool);
  registerTool(ghIssueEditTool);
  registerTool(ghIssueCloseTool);
  registerTool(ghIssueReopenTool);
  registerTool(ghIssueLinkTool);

  // PRs
  registerTool(ghPrListTool);
  registerTool(ghPrViewTool);
  registerTool(ghPrDiffTool);
  registerTool(ghPrChecksTool);
  registerTool(ghPrFilesTool);
  registerTool(ghPrCreateTool);
  registerTool(ghPrEditTool);
  registerTool(ghPrCommentTool);
  registerTool(ghPrReviewTool);
  registerTool(ghPrMergeTool);
  registerTool(ghPrCloseTool);
  registerTool(ghPrReadyTool);

  // Projects v2
  registerTool(ghProjectListTool);
  registerTool(ghProjectViewTool);
  registerTool(ghProjectItemListTool);
  registerTool(ghProjectItemAddTool);
  registerTool(ghProjectItemUpdateTool);
  registerTool(ghProjectItemArchiveTool);
  registerTool(ghProjectItemDeleteTool);
  registerTool(ghProjectFieldListTool);

  // Runs + workflows
  registerTool(ghRunListTool);
  registerTool(ghRunViewTool);
  registerTool(ghRunRerunTool);
  registerTool(ghRunCancelTool);
  registerTool(ghWorkflowListTool);
  registerTool(ghWorkflowRunTool);

  // Releases
  registerTool(ghReleaseListTool);
  registerTool(ghReleaseViewTool);
  registerTool(ghReleaseCreateTool);
  registerTool(ghReleaseEditTool);
  registerTool(ghReleasePublishTool);
  registerTool(ghReleaseDeleteTool);

  // Repos
  registerTool(ghRepoViewTool);
  registerTool(ghRepoListTool);
  registerTool(ghRepoCreateTool);
  registerTool(ghRepoForkTool);
  registerTool(ghRepoDeleteTool);
  registerTool(ghRepoCloneTool);

  // Families (op-based)
  registerTool(ghIssueManageTool);
  registerTool(ghPrManageTool);
  registerTool(ghReleaseAssetTool);
  registerTool(ghRepoManageTool);
  registerTool(ghRunManageTool);
  registerTool(ghWorkflowManageTool);
  registerTool(ghProjectManageTool);
  registerTool(ghLabelTool);
  registerTool(ghGistTool);
  registerTool(ghSecretTool);
  registerTool(ghVariableTool);
  registerTool(ghCacheTool);
  registerTool(ghSshKeyTool);
  registerTool(ghGpgKeyTool);
  registerTool(ghSearchTool);
  registerTool(ghRulesetTool);
  registerTool(ghOrgTool);
  registerTool(ghAuthTool);
  registerTool(ghStatusTool);
  registerTool(ghCodespaceTool);
  registerTool(ghConfigTool);
  registerTool(ghExtensionTool);

  // Tracker: the fixed-endpoint gh api operations of the workflow tracker (Story s7)
  registerTool(ghTrackerTool);
}
