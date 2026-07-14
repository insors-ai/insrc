/**
 * Unified tools module -- barrel export.
 */

export type {
  Tool, ToolDeps, ToolInput, ToolResult, ToolFormat, ToolApprovalGate,
} from './types.js';
export {
  registerTool, getTool, listTools,
} from './registry.js';
export { executeTool } from './executor.js';
