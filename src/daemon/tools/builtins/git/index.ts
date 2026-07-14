/**
 * Git tools -- registration entry point.
 *
 * Each tool lives in its own file. This module imports them and hands
 * them to registerTool() so daemon/index.ts only has to call
 * registerGitTools() once at startup.
 */

import { registerTool } from '../../registry.js';
import { gitStatusTool } from './status.js';
import { gitLogTool } from './log.js';
import { gitDiffTool } from './diff.js';
import { gitShowTool } from './show.js';
import { gitBlameTool } from './blame.js';
import { gitBranchTool } from './branch.js';
import { gitStageTool } from './stage.js';
import { gitCommitTool } from './commit.js';
import { gitAmendTool } from './amend.js';
import { gitPushTool } from './push.js';
import { gitPullTool } from './pull.js';
import { gitFetchTool } from './fetch.js';
import { gitCheckoutTool } from './checkout.js';
import { gitMergeTool } from './merge.js';
import { gitRebaseTool } from './rebase.js';
import { gitStashTool } from './stash.js';
import { gitResetTool } from './reset.js';
import { gitRevertTool } from './revert.js';
import { gitCherryPickTool } from './cherry-pick.js';
import { gitTagTool } from './tag.js';
import { gitRemoteTool } from './remote.js';
import { gitWorktreeTool } from './worktree.js';

export function registerGitTools(): void {
  registerTool(gitStatusTool);
  registerTool(gitLogTool);
  registerTool(gitDiffTool);
  registerTool(gitShowTool);
  registerTool(gitBlameTool);
  registerTool(gitBranchTool);
  registerTool(gitStageTool);
  registerTool(gitCommitTool);
  registerTool(gitAmendTool);
  registerTool(gitPushTool);
  registerTool(gitPullTool);
  registerTool(gitFetchTool);
  registerTool(gitCheckoutTool);
  registerTool(gitMergeTool);
  registerTool(gitRebaseTool);
  registerTool(gitStashTool);
  registerTool(gitResetTool);
  registerTool(gitRevertTool);
  registerTool(gitCherryPickTool);
  registerTool(gitTagTool);
  registerTool(gitRemoteTool);
  registerTool(gitWorktreeTool);
}
