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

import type { TypedTool } from '../../call-tool.js';
import { Type } from '@sinclair/typebox';
import { runShell } from '../../shell-helper.js';
import type { ApprovalClass, ToolApprovalGate, ToolInput, ToolResult } from '../../types.js';
import { str, assertSafeArg, fail, failureKind, spawnFail, readBranch, readFailure, readShortSha, rejectInput } from './helpers.js';
import { GitPushDataSchema } from './schemas.js';
import type { GitPushData } from './schemas.js';

export type { GitPushData } from './schemas.js';

const PROTECTED_REFS = /^(main|master|release\/|trunk)/i;

export const gitPushTool = {
  id: 'git_push',
  description: 'Push a branch or tag to a remote. Gates with target preview; refuses force-push to protected refs.',
  inputSchema: Type.Object({
    cwd: Type.Optional(Type.String({ description: 'Repository root.' })),
    remote: Type.Optional(Type.String({ description: 'Remote name. Default: `origin`.' })),
    ref: Type.Optional(Type.String({ description: 'Ref to push. Default: current branch.' })),
    setUpstream: Type.Optional(Type.Boolean({ description: 'Pass -u to set tracking.' })),
    force: Type.Optional(Type.Boolean({ description: 'Use --force-with-lease (safer than raw --force).' })),
    forceRaw: Type.Optional(Type.Boolean({ description: 'Use raw --force. Refused on protected refs unless forceToMain:true.' })),
    forceToMain: Type.Optional(Type.Boolean({ description: 'Allow force push to main / master / release/*. Use with extreme care.' })),
    tags: Type.Optional(Type.Boolean({ description: 'Pass --follow-tags to include annotated tags.' })),
    dryRun: Type.Optional(Type.Boolean({ description: 'Don\'t actually push; just report what would happen.' })),
  }, { additionalProperties: false }),
  outputSchema: GitPushDataSchema,

  // A forced push (any force flag, a '+' refspec) rewrites the remote's history and an empty-source refspec such as ':dev'
  // deletes a remote ref: destructive. A push of a branch or tag name, or of 'src:dst', is ordinary.
  approval(input: ToolInput): ApprovalClass {
    if (input['force'] === true || input['forceRaw'] === true || input['forceToMain'] === true) { return 'destructive'; }
    const ref = input['ref'];
    if (typeof ref === 'string' && (ref.startsWith('+') || ref.startsWith(':'))) { return 'destructive'; }
    return 'common';
  },

  async buildApprovalGate(input: ToolInput): Promise<ToolApprovalGate> {
    const cwd = String(input['cwd'] ?? process.cwd());
    const remote = String(input['remote'] ?? 'origin');
    let ref = str(input, 'ref');
    if (!ref) {
      const brRead = await readBranch(cwd);
      ref = !brRead.ok ? `(unknown: ${failureKind(brRead.failed)})` : brRead.value ?? '(detached HEAD)';
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
    assertSafeArg(remote, 'ref');
    let ref = str(input, 'ref');
    if (ref !== undefined) { assertSafeArg(ref, 'ref'); }
    if (!ref) {
      const brRead = await readBranch(cwd);
      if (!brRead.ok) { return readFailure('git_push', brRead.failed); }
      const br = brRead.value;
      if (!br) {
        return rejectInput('git_push', 'detached HEAD -- supply an explicit ref');
      }
      ref = br;
    }

    const force = input['force'] === true;
    const forceRaw = input['forceRaw'] === true;
    const setUpstream = input['setUpstream'] === true;
    const tags = input['tags'] === true;
    const dryRun = input['dryRun'] === true;
    const forceToMain = input['forceToMain'] === true;
    // The ref a refspec writes or deletes: 'src:dst' acts on dst, ':dst' deletes it, '+' forces it.
    const forcedByRefspec = ref.startsWith('+');
    const spec = ref.replace(/^\+/, '');
    const deletesRef = spec.startsWith(':');
    const target = (spec.includes(':') ? spec.slice(spec.indexOf(':') + 1) : spec).replace(/^refs\/heads\//, '');
    const protectedRef = PROTECTED_REFS.test(ref) || PROTECTED_REFS.test(target);

    if ((force || forceRaw || forcedByRefspec || deletesRef) && protectedRef && !forceToMain) {
      const what = deletesRef ? 'deleting' : 'force push to';
      return rejectInput(
        'git_push',
        `refusing ${what} protected ref \`${ref}\` -- rerun with forceToMain:true to override`,
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
    if (result.code !== 0) { return fail('git_push', result, { network: true, mutating: true }); }

    // The push has happened: the short sha of what was pushed only adds detail, so a read that fails is a warning.
    // A '+' refspec pushes its source; an empty source (':dev') deletes the remote ref and has no sha.
    const source = ref.replace(/^\+/, '').split(':')[0] ?? '';
    const shaRead = source === '' ? undefined : await readShortSha(cwd, source);
    const shortSha = shaRead?.ok ? shaRead.value : '';
    const data: GitPushData = {
      remote,
      ref,
      pushed: !dryRun,
      shortSha,
      forceMode: forceRaw ? 'raw' : force ? 'lease' : 'none',
      ...(shaRead !== undefined && !shaRead.ok ? { warnings: [`git rev-parse --short ${source} ${failureKind(shaRead.failed)}: the short sha is empty`] } : {}),
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
} satisfies TypedTool;
