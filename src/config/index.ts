/**
 * Config management module — barrel exports.
 */

// Store
export { ConfigStore } from './store.js';

// Search
export { searchConfig, resolveTemplate } from './search.js';

// Frontmatter
export { parseConfigFrontmatter, stripFrontmatter } from './frontmatter.js';
export type { ConfigFrontmatter } from './frontmatter.js';

// Paths
export {
  globalConfigDirs,
  projectConfigDirs,
  projectConfigBase,
  inferNamespaceFromPath,
  classifyConfigPath,
  configEntryId,
  formatScope,
  parseScope,
} from './paths.js';

// Loader
export { loadProjectConfig, resolveConfig, deepMerge } from './loader.js';

// Feedback
export { recordFeedback, classifyFeedbackScope } from './feedback.js';

// Templates
export { bootstrapTemplates } from './templates.js';
