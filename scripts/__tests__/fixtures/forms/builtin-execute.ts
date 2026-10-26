import { gitDiffTool } from '../../../../src/daemon/tools/builtins/git/diff.js';
export async function run(): Promise<unknown> { return gitDiffTool.execute({ cwd: '/r' }, {} as never); }
