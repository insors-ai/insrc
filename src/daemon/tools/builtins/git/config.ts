/**
 * git_config -- read one config value (read-only, no approval).
 *
 * `git config --get <key>`: exit 0 prints the value; exit 1 with nothing printed means the key is not set, which is
 * an answer (found false), not a failure.
 */

import type { TypedTool } from '../../call-tool.js';
import { Type } from '@sinclair/typebox';
import { runShell } from '../../shell-helper.js';
import type { ToolDeps, ToolInput, ToolResult } from '../../types.js';
import { fail, ranToExit, spawnFail, str } from './helpers.js';
import { GitConfigDataSchema } from './schemas.js';
import type { GitConfigData } from './schemas.js';
import { CONFIG_KEY } from './safe-args.js';

export const gitConfigTool = {
  id: 'git_config',
  description: 'Read one git config value (git config --get). A key that is not set is an answer (found false), not a failure.',
  inputSchema: Type.Object({
    cwd: Type.Optional(Type.String({ description: 'Repository root. Defaults to process cwd.' })),
    key: Type.String({ pattern: CONFIG_KEY, description: 'A dotted config key, e.g. user.email.' }),
  }, { additionalProperties: false }),
  outputSchema: GitConfigDataSchema,

  async execute(input: ToolInput, deps?: ToolDeps): Promise<ToolResult> {
    const cwd = str(input, 'cwd') ?? process.cwd();
    const key = String(input['key']);
    const r = await runShell(['git', 'config', '--get', key], { cwd, timeoutMs: 5_000, signal: deps?.signal });
    if (r.spawnError) { return spawnFail('git_config', r.stderr); }
    if (ranToExit(r) && r.code === 0) {
      const data: GitConfigData = { found: true, value: r.stdout.replace(/\r?\n$/, '') };
      return { output: data.value ?? '', format: 'text', success: true, data };
    }
    if (ranToExit(r) && r.code === 1 && r.stdout === '') {
      const data: GitConfigData = { found: false };
      return { output: `${key} is not set`, format: 'text', success: true, data };
    }
    return fail('git_config', r);
  },
} satisfies TypedTool;
