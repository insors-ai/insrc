/**
 * git:amend -- amend the most recent commit.
 *
 * Two common flavors:
 *   amend:'message'    -- keep the tree, rewrite only the message
 *                         (uses --amend --only --no-edit or -m <new>)
 *   amend:'staged'     -- fold currently staged changes into HEAD
 *                         with optional message rewrite
 *
 * Gate content warns when the commit has already been pushed (by
 * comparing HEAD with the upstream tip) so the caller knows a force-
 * push will be needed.
 */

import { runShell } from '../../shell-helper.js';
import type { Tool, ToolApprovalGate, ToolInput, ToolResult } from '../../types.js';
import { str, fail, failureKind, ranToExit, readFailure, spawnFail, currentBranch, revParse, rejectInput } from './helpers.js';
import type { ShellResult } from '../../shell-helper.js';

export type GitAmendMode = 'message' | 'staged';

export interface GitAmendData {
  sha: string;
  shortSha: string;
  branch: string;
  mode: GitAmendMode;
  message: string;
  /** True when HEAD was already pushed to the tracked upstream before the amend. */
  requiresForcePush: boolean;
}

export const gitAmendTool: Tool = {
  id: 'git_amend',
  description: 'Amend the most recent commit. mode=message rewrites only the text; mode=staged folds staged changes in.',
  inputSchema: {
    type: 'object',
    properties: {
      cwd: { type: 'string', description: 'Repository root.' },
      mode: { type: 'string', enum: ['message', 'staged'], description: 'message = rewrite message only; staged = fold staged changes in.' },
      message: { type: 'string', description: 'New message. Optional for mode=staged (keeps existing message if omitted).' },
      signoff: { type: 'boolean', description: 'Add Signed-off-by trailer.' },
      verifyHooks: { type: 'boolean', description: 'Run commit hooks (default true).' },
    },
    required: ['mode'],
    additionalProperties: false,
  },
  approval: 'common',

  async buildApprovalGate(input: ToolInput): Promise<ToolApprovalGate> {
    const cwd = String(input['cwd'] ?? process.cwd());
    const mode = String(input['mode'] ?? 'message');
    const message = str(input, 'message');
    const pushed = await wasPushed(cwd);
    const pushedWarning = pushed.ok && pushed.value;
    const pushedUnknown = pushed.ok ? '' : `\n⚠️ **Could not tell whether HEAD was already pushed (${failureKind(pushed.failed)}).**`;

    return {
      title: 'git_amend',
      content: [
        `Repo: \`${cwd}\``,
        `Mode: **${mode}**${mode === 'message' ? ' (rewrite message only)' : ' (fold staged changes + optional message rewrite)'}`,
        message ? `\n**New message**\n\`\`\`\n${message}\n\`\`\`` : '',
        pushedWarning ? '\n⚠️ **HEAD is already at/behind the tracked upstream -- amending will require `git push --force-with-lease` afterward.**' : '',
        pushedUnknown,
      ].filter(Boolean).join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
        { name: 'edit', label: 'Edit message', needsInput: true },
      ],
    };
  },

  applyEdit(input: ToolInput, feedback: string): ToolInput {
    return { ...input, message: feedback };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const cwd = str(input, 'cwd') ?? process.cwd();
    const mode = (str(input, 'mode') ?? 'message') as GitAmendMode;
    const message = str(input, 'message');
    const signoff = input['signoff'] === true;
    const verifyHooks = input['verifyHooks'] !== false;

    if (mode !== 'staged' && !message) { return rejectInput('git_amend', 'mode=message requires a message'); }

    const branch = await currentBranch(cwd) ?? '(detached)';
    // Amending a pushed commit is the risk this read guards, so a read that did not run is not an answer.
    const pushed = await wasPushed(cwd);
    if (!pushed.ok) { return readFailure('git_amend', pushed.failed); }
    const requiresForcePush = pushed.value;

    const argv = ['git', 'commit', '--amend'];
    if (mode === 'staged') {
      // Fold staged into HEAD. Keep message unless the caller supplied a new one.
      if (message) { argv.push('-m', message); }
      else { argv.push('--no-edit'); }
    } else {
      // message-only: --only --no-edit tree-wise, but rewrite message.
      argv.push('-m', message ?? '', '--only');
    }
    if (signoff) { argv.push('-s'); }
    if (!verifyHooks) { argv.push('--no-verify'); }

    const result = await runShell(argv, { cwd, timeoutMs: 60_000 });
    if (result.spawnError) { return spawnFail('git_amend', result.stderr); }
    if (result.code !== 0) { return fail('git_amend', result, { mutating: true }); }

    const short = await revParse(cwd, 'HEAD');
    const long = await runShell(['git', 'rev-parse', 'HEAD'], { cwd, timeoutMs: 5_000 });
    const sha = long.code === 0 ? long.stdout.trim() : '';

    // Fetch the actual (possibly rewritten) message to echo back.
    const msgRes = await runShell(['git', 'log', '-1', '--pretty=%B', 'HEAD'], { cwd, timeoutMs: 5_000 });
    const finalMessage = msgRes.code === 0 ? msgRes.stdout.trimEnd() : message ?? '';

    const data: GitAmendData = { sha, shortSha: short, branch, mode, message: finalMessage, requiresForcePush };

    const lines: string[] = [
      `Amended HEAD -> \`${short}\` on **${branch}**.`,
      '',
      '**Message now reads**',
      '```',
      finalMessage,
      '```',
    ];
    if (requiresForcePush) {
      lines.push('', '⚠️ `git push --force-with-lease` required to update the remote.');
    }
    return { output: lines.join('\n'), format: 'markdown', success: true, data };
  },
};

/**
 * True when HEAD matches (or is an ancestor of) the upstream branch --
 * i.e. this commit has already been published.
 */
type PushedRead = { ok: true; value: boolean } | { ok: false; failed: ShellResult };

/**
 * A missing HEAD, a missing upstream (git's exit 128) and 'not an ancestor' (exit 1) are the answer false;
 * a read that did not run to an exit (not spawned, timed out, cut) is not an answer.
 */
async function wasPushed(cwd: string): Promise<PushedRead> {
  const head = await runShell(['git', 'rev-parse', 'HEAD'], { cwd, timeoutMs: 5_000 });
  if (!ranToExit(head)) { return { ok: false, failed: head }; }
  if (head.code !== 0) { return { ok: true, value: false }; }
  const upstream = await runShell(['git', 'rev-parse', '@{upstream}'], { cwd, timeoutMs: 5_000 });
  if (!ranToExit(upstream)) { return { ok: false, failed: upstream }; }
  if (upstream.code !== 0) { return { ok: true, value: false }; }
  const merge = await runShell(['git', 'merge-base', '--is-ancestor', head.stdout.trim(), upstream.stdout.trim()], { cwd, timeoutMs: 5_000 });
  if (!ranToExit(merge)) { return { ok: false, failed: merge }; }
  return { ok: true, value: merge.code === 0 };  // 0 = HEAD is an ancestor of upstream, i.e. already pushed
}
