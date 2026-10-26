/**
 * Git tools -- registration entry point.
 *
 * Each tool lives in its own file. This module imports them and hands
 * them to registerTool() so daemon/index.ts only has to call
 * registerGitTools() once at startup.
 */

import { registerTool as register } from '../../registry.js';
import { gitToolDefinitions } from './definitions.js';
import { withFailureNet } from './helpers.js';

export { gitToolDefinitions } from './definitions.js';

export function registerGitTools(): void {
  for (const tool of gitToolDefinitions) { register(withFailureNet(tool)); }
}
