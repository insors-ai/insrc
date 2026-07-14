/**
 * git:push -- push the current branch (or a named ref) to a remote.
 *
 * Guards:
 *   - refuses `--force` to main / master unless forceToMain:true is
 *     explicitly set (matches the project standing rule)
 *   - prefers `--force-with-lease` when the caller asks for force,
 *     unless forceRaw:true is set (lease is safer)
 *   - warns in the gate content when pushing to a protected-branch
 *     name (main / master / release/*)
 */

import { runShell } from '../../shell-helper.js';
import type { Tool, ToolApprovalGate, ToolInput, ToolResult } from '../../types.js';
import { str, fail, spawnFail, currentBranch, revParse } from './helpers.js';

export interface GitPushData {
  remote: string;
  ref: string;
  pushed: boolean;
  shortSha: string;
  forceMode?: 'none' | 'lease' | 'raw';
}

const PROTECTED_REFS = /^(main|master|release\/|trunk)/i;

export const gitPushTool: Tool = {
  id: 'git_push',
  description: 'Push a branch or tag to a remote. Gates with target preview; refuses force-push to protected refs.',
  inputSchema: {
    type: 'object',
    properties: {
      cwd: { type: 'string', description: 'Repository root.' },
      remote: { type: 'string', description: 'Remote name. Default: `origin`.' },
      ref: { type: 'string', description: 'Ref to push. Default: current branch.' },
      setUpstream: { type: 'boolean', description: 'Pass -u to set tracking.' },
      force: { type: 'boolean', description: 'Use --force-with-lease (safer than raw --force).' },
      forceRaw: { type: 'boolean', description: 'Use raw --force. Refused on protected refs unless forceToMain:true.' },
      forceToMain: { type: 'boolean', description: 'Allow force push to main / master / release/*. Use with extreme care.' },
      tags: { type: 'boolean', description: 'Pass --follow-tags to include annotated tags.' },
      dryRun: { type: 'boolean', description: 'Don\'t actually push; just report what would happen.' },
    },
    additionalProperties: false,
  },
  requiresApproval: true,

  async buildApprovalGate(input: ToolInput): Promise<ToolApprovalGate> {
    const cwd = String(input['cwd'] ?? process.cwd());
    const remote = String(input['remote'] ?? 'origin');
    let ref = str(input, 'ref');
    if (!ref) {
      const br = await currentBranch(cwd);
      ref = br ?? '(detached HEAD)';
    }
    const force = input['force'] === true;
    const forceRaw = input['forceRaw'] === true;
    const forceMode = forceRaw ? 'raw --force' : force ? '--force-with-lease' : 'none';
    const dry = input['dryRun'] === true;
    const protectedRef = PROTECTED_REFS.test(ref);

    const lines: string[] = [];
    lines.push(`Repo: \`${cwd}\``);
    lines.push(`Push \`${ref}\` -> \`${remote}\``);
    if (dry) { lines.push('Dry run -- no refs will be updated.'); }
    lines.push(`Force mode: **${forceMode}**`);
    if (protectedRef && (force || forceRaw)) {
      lines.push(`\n⚠️ \`${ref}\` looks like a protected branch. forceToMain:${input['forceToMain'] === true} is required to proceed.`);
    }

    return {
      title: protectedRef && (force || forceRaw) ? 'git:push (PROTECTED REF)' : 'git_push',
      content: lines.join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const cwd = str(input, 'cwd') ?? process.cwd();
    const remote = str(input, 'remote') ?? 'origin';
    let ref = str(input, 'ref');
    if (!ref) {
      const br = await currentBranch(cwd);
      if (!br) {
        return fail('git_push', 'detached HEAD -- supply an explicit ref', '', 1);
      }
      ref = br;
    }

    const force = input['force'] === true;
    const forceRaw = input['forceRaw'] === true;
    const setUpstream = input['setUpstream'] === true;
    const tags = input['tags'] === true;
    const dryRun = input['dryRun'] === true;
    const protectedRef = PROTECTED_REFS.test(ref);
    const forceToMain = input['forceToMain'] === true;

    if ((force || forceRaw) && protectedRef && !forceToMain) {
      return fail(
        'git_push',
        `refusing force push to protected ref \`${ref}\` -- rerun with forceToMain:true to override`,
        '', 1,
      );
    }

    const argv = ['git', 'push'];
    if (setUpstream) { argv.push('-u'); }
    if (dryRun)      { argv.push('--dry-run'); }
    if (tags)        { argv.push('--follow-tags'); }
    if (forceRaw)    { argv.push('--force'); }
    else if (force)  { argv.push('--force-with-lease'); }
    argv.push(remote, ref);

    const result = await runShell(argv, { cwd, timeoutMs: 120_000 });
    if (result.spawnError) { return spawnFail('git_push', result.stderr); }
    if (result.code !== 0) { return fail('git_push', result.stderr, result.stdout, result.code); }

    const shortSha = await revParse(cwd, ref);
    const data: GitPushData = {
      remote,
      ref,
      pushed: !dryRun,
      shortSha,
      forceMode: forceRaw ? 'raw' : force ? 'lease' : 'none',
    };
    const body = [
      dryRun ? `Dry-run OK -- would push \`${ref}\` -> \`${remote}\`.` : `Pushed \`${ref}\` -> \`${remote}\` at \`${shortSha}\`.`,
      '',
      '```',
      result.stdout.trim() || result.stderr.trim(),
      '```',
    ].join('\n');
    return { output: body, format: 'markdown', success: true, data };
  },
};
