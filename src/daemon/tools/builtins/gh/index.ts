/**
 * GitHub tools -- registration entry point.
 *
 * Domains (46 tools):
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
}
