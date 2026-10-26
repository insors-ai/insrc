/**
 * The git tool definitions, in one list.
 *
 * Every definition is an inferred object checked with `satisfies TypedTool`, so callTool keeps its concrete input and
 * result types. registerGitTools registers each entry as register(withFailureNet(tool)) in this order; the exported
 * definitions (gitDiffTool and the rest) stay the objects callTool is given.
 *
 * `satisfies readonly TypedTool[]` checks the elements that are IN the list; it cannot notice a definition that was
 * left out. That is checked by the inventory test (typed-git-tools.test.ts), which compares the list with every
 * tool the git files export.
 */

import type { TypedTool } from '../../call-tool.js';
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
import { gitForEachRefTool } from './for-each-ref.js';
import { gitCatFileTool } from './cat-file.js';
import { gitLsTreeTool } from './ls-tree.js';
import { gitLsFilesTool } from './ls-files.js';
import { gitRevListTool } from './rev-list.js';
import { gitRevParseTool } from './rev-parse.js';
import { gitFetchRefsTool } from './fetch-refs.js';
import { gitPathHistoryTool } from './path-history.js';
import { gitHashObjectTool } from './hash-object.js';
import { gitMergeBaseTool } from './merge-base.js';
import { gitShowRefTool } from './show-ref.js';
import { gitSymbolicRefTool } from './symbolic-ref.js';

export const gitToolDefinitions = [
  gitStatusTool,
  gitLogTool,
  gitDiffTool,
  gitShowTool,
  gitBlameTool,
  gitBranchTool,
  gitStageTool,
  gitCommitTool,
  gitAmendTool,
  gitPushTool,
  gitPullTool,
  gitFetchTool,
  gitCheckoutTool,
  gitMergeTool,
  gitRebaseTool,
  gitStashTool,
  gitResetTool,
  gitRevertTool,
  gitCherryPickTool,
  gitTagTool,
  gitRemoteTool,
  gitWorktreeTool,
  gitForEachRefTool,
  gitCatFileTool,
  gitLsTreeTool,
  gitLsFilesTool,
  gitRevListTool,
  gitRevParseTool,
  gitFetchRefsTool,
  gitPathHistoryTool,
  gitHashObjectTool,
  gitMergeBaseTool,
  gitShowRefTool,
  gitSymbolicRefTool,
] as const satisfies readonly TypedTool[];
