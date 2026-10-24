/**
 * Git tools -- registration entry point.
 *
 * Each tool lives in its own file. This module imports them and hands
 * them to registerTool() so daemon/index.ts only has to call
 * registerGitTools() once at startup.
 */

import { registerTool as register } from '../../registry.js';
import { withFailureNet } from './helpers.js';
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
  register(withFailureNet(gitStatusTool));
  register(withFailureNet(gitLogTool));
  register(withFailureNet(gitDiffTool));
  register(withFailureNet(gitShowTool));
  register(withFailureNet(gitBlameTool));
  register(withFailureNet(gitBranchTool));
  register(withFailureNet(gitStageTool));
  register(withFailureNet(gitCommitTool));
  register(withFailureNet(gitAmendTool));
  register(withFailureNet(gitPushTool));
  register(withFailureNet(gitPullTool));
  register(withFailureNet(gitFetchTool));
  register(withFailureNet(gitCheckoutTool));
  register(withFailureNet(gitMergeTool));
  register(withFailureNet(gitRebaseTool));
  register(withFailureNet(gitStashTool));
  register(withFailureNet(gitResetTool));
  register(withFailureNet(gitRevertTool));
  register(withFailureNet(gitCherryPickTool));
  register(withFailureNet(gitTagTool));
  register(withFailureNet(gitRemoteTool));
  register(withFailureNet(gitWorktreeTool));
}
