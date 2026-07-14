/**
 * File I/O tools -- registration entry point.
 */

import { registerTool } from '../../registry.js';
import { fileReadTool } from './read.js';
import { fileWriteTool } from './write.js';
import { fileEditTool } from './edit.js';
import { fileMultiEditTool } from './multi-edit.js';
import { fileDeleteTool } from './delete.js';
import { fileMoveTool } from './move.js';
import { fileCopyTool } from './copy.js';
import { fileMkdirTool } from './mkdir.js';
import { fileStatTool } from './stat.js';

export function registerFileTools(): void {
  registerTool(fileReadTool);
  registerTool(fileWriteTool);
  registerTool(fileEditTool);
  registerTool(fileMultiEditTool);
  registerTool(fileDeleteTool);
  registerTool(fileMoveTool);
  registerTool(fileCopyTool);
  registerTool(fileMkdirTool);
  registerTool(fileStatTool);
}
