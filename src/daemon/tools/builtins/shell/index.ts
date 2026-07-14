/**
 * Shell tools -- registration entry point.
 */

import { registerTool } from '../../registry.js';
import { shellExecTool } from './exec.js';
import { shellExecDetachedTool } from './exec-detached.js';
import { shellExecPipelineTool } from './exec-pipeline.js';
import { shellCwdTool } from './cwd.js';

export function registerShellTools(): void {
  registerTool(shellExecTool);
  registerTool(shellExecDetachedTool);
  registerTool(shellExecPipelineTool);
  registerTool(shellCwdTool);
}
