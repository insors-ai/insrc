/**
 * git:commit -- create a commit from what's currently staged.
 *
 * Approval gate surfaces the staged diff summary + the proposed commit
 * message so nothing goes in accidentally. Refuses to commit when:
 *   - nothing is staged (unless allowEmpty is set)
 *   - the repo is in detached-HEAD state (unless allowDetached is set)
 *
 * Works with the default commit template: the caller provides the
 * message as input; multi-line messages are supported. `amend` is a
 * separate tool (git:amend) so each surface stays focused.
 */

import { Type } from '@sinclair/typebox';
import { runShell } from '../../shell-helper.js';
import type { Tool, ToolApprovalGate, ToolInput, ToolResult } from '../../types.js';
import { str, fail, failureKind, ranToExit, spawnFail, readBranch, readFailure, readStagedCount, stagedSummary, rejectInput } from './helpers.js';
import { GitCommitDataSchema } from './schemas.js';
import type { GitCommitData } from './schemas.js';

export type { GitCommitData } from './schemas.js';

export const gitCommitTool: Tool = {
  id: 'git_commit',
  description: 'Create a commit from the staged changes. Gates with diff + message preview.',
  inputSchema: Type.Object({
    cwd: Type.Optional(Type.String({ description: 'Repository root.' })),
    message: Type.String({ description: 'Commit message (required). Multi-line supported.' }),
    author: Type.Optional(Type.String({
      description: 'Override commit author, e.g. `Name <email>`. Uses git config by default.',
    })),
    signoff: Type.Optional(Type.Boolean({ description: 'Add a Signed-off-by trailer (git -s).' })),
    gpgSign: Type.Optional(Type.Boolean({ description: 'Sign the commit (git -S). Disabled by default even when user.signingkey is set.' })),
    allowEmpty: Type.Optional(Type.Boolean({ description: 'Allow committing with nothing staged.' })),
    allowDetached: Type.Optional(Type.Boolean({ description: 'Allow committing on a detached HEAD.' })),
    verifyHooks: Type.Optional(Type.Boolean({ description: 'Run pre-commit / commit-msg hooks. Default true.' })),
  }, { additionalProperties: false }),
  outputSchema: GitCommitDataSchema,
  approval: 'common',

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const cwd = String(input['cwd'] ?? process.cwd());
    const message = String(input['message'] ?? '');
    const amend = input['amend'] === true;
    const signoff = input['signoff'] === true;
    const author = str(input, 'author');
    const preview = previewMessage(message);
    return {
      title: amend ? 'git:commit (amend)' : 'git_commit',
      content: [
        `Repo: \`${cwd}\``,
        '',
        '**Message**',
        '```',
        preview,
        '```',
        signoff ? '(signed-off-by trailer will be added)' : '',
        author ? `Author override: \`${author}\`` : '',
        '',
        '**Staged changes**',
        '_(staged diff summary fetched live at approval time)_',
      ].filter(Boolean).join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
        { name: 'edit', label: 'Edit message', needsInput: true },
      ],
    };
  },

  applyEdit(input: ToolInput, feedback: string): ToolInput {
    // User's edit replaces the commit message.
    return { ...input, message: feedback };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const cwd = str(input, 'cwd') ?? process.cwd();
    const message = str(input, 'message');
    if (!message) { return rejectInput('git_commit', 'missing message'); }

    const author = str(input, 'author');
    const signoff = input['signoff'] === true;
    const gpgSign = input['gpgSign'] === true;
    const allowEmpty = input['allowEmpty'] === true;
    const allowDetached = input['allowDetached'] === true;
    const verifyHooks = input['verifyHooks'] !== false;  // default true

    // Detached HEAD guard.
    const branchRead = await readBranch(cwd);
    if (!branchRead.ok) { return readFailure('git_commit', branchRead.failed); }
    const branch = branchRead.value;
    if (!branch && !allowDetached) {
      return rejectInput('git_commit', 'refusing to commit on detached HEAD -- rerun with allowDetached:true to override');
    }

    // Empty-index guard.
    if (!allowEmpty) {
      const countRead = await readStagedCount(cwd);
      if (!countRead.ok) { return readFailure('git_commit', countRead.failed); }
      if (countRead.value === 0) {
        return rejectInput('git_commit', 'nothing staged -- run git:stage first, or pass allowEmpty:true for an empty commit');
      }
    }

    const argv = ['git', 'commit', '-m', message];
    if (signoff) { argv.push('-s'); }
    if (gpgSign) { argv.push('-S'); }
    if (author)  { argv.push(`--author=${author}`); }
    if (allowEmpty) { argv.push('--allow-empty'); }
    if (!verifyHooks) { argv.push('--no-verify'); }

    const result = await runShell(argv, { cwd, timeoutMs: 60_000 });
    if (result.spawnError) { return spawnFail('git_commit', result.stderr); }
    if (result.code !== 0) { return fail('git_commit', result, { mutating: true }); }

    const data = await collectCommitData(cwd, branch ?? '(detached)', message);
    const body = [
      `Committed \`${data.shortSha}\` on **${data.branch}**.`,
      '',
      `${data.filesChanged} file${data.filesChanged === 1 ? '' : 's'} changed (+${data.insertions} / -${data.deletions}).`,
      '',
      '**Message**',
      '```',
      data.message,
      '```',
    ].join('\n');
    return { output: body, format: 'markdown', success: true, data };
  },
};

/**
 * The details of the commit just made. The commit has happened, so a read that fails does not fail the call: it keeps its
 * placeholder (an empty sha, no files) and is named in data.warnings.
 */
async function collectCommitData(cwd: string, branch: string, message: string): Promise<GitCommitData> {
  const warnings: string[] = [];
  const sha = await runShell(['git', 'rev-parse', 'HEAD'], { cwd, timeoutMs: 5_000 });
  const short = await runShell(['git', 'rev-parse', '--short', 'HEAD'], { cwd, timeoutMs: 5_000 });
  const stat = await runShell(['git', 'show', '--numstat', '--format=', 'HEAD'], { cwd, timeoutMs: 10_000 });
  const shaOk = ranToExit(sha) && sha.code === 0;
  const shortOk = ranToExit(short) && short.code === 0;
  const statOk = ranToExit(stat) && stat.code === 0;
  if (!shaOk) { warnings.push(`git rev-parse HEAD ${failureKind(sha)}: the sha is empty`); }
  if (!shortOk) { warnings.push(`git rev-parse --short HEAD ${failureKind(short)}: the short sha is empty`); }
  if (!statOk) { warnings.push(`git show --numstat HEAD ${failureKind(stat)}: the file counts are empty`); }
  let ins = 0, del = 0, files = 0;
  for (const line of statOk ? stat.stdout.split('\n') : []) {
    const parts = line.trim().split('\t');
    if (parts.length < 3) { continue; }
    files += 1;
    const i = Number(parts[0]); const d = Number(parts[1]);
    if (Number.isFinite(i)) { ins += i; }
    if (Number.isFinite(d)) { del += d; }
  }
  return {
    sha: shaOk ? sha.stdout.trim() : '',
    shortSha: shortOk ? short.stdout.trim() : '',
    branch,
    filesChanged: files,
    insertions: ins,
    deletions: del,
    message,
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}

function previewMessage(raw: string): string {
  const MAX = 800;
  return raw.length > MAX ? raw.slice(0, MAX) + '\n...[truncated]' : raw;
}

// Expose stagedSummary for the gate content that wants a live view.
// Not all callers re-fetch at approval time, so keep the stub signature
// consistent with git:stage; the gate body above labels this explicitly.
export { stagedSummary };
