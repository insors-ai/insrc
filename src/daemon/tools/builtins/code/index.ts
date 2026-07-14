/**
 * Code-side tool registrations.
 *
 * Tools with the `code_` first-underscore-segment that read from the
 * LMDB code graph + Lance entity_vec table to support code-analyzer
 * skills (plans/analyzers/code-analyzer-skills.md). Distinct from the
 * cross-agent `code_*` tools (`code_locate` / `code_trace` /
 * `code_describe`) which are registered separately via
 * `daemon/cross-agent/code-tools.ts` -- those are the surface
 * sibling analyzers see; these are the substrate code-analyzer
 * skills compose over.
 *
 * The `code` category is already in `ALL_CATEGORIES`
 * (tools/config.ts) so the registry's category gate doesn't
 * blackhole anything registered here.
 */

import { registerCodeClassLocateTool } from './class-locate.js';
import { registerCodeClassFieldsTool } from './class-fields.js';
import { registerCodeClassReferencesTool } from './class-references.js';
import { registerCodeOrmScanTool } from './orm-scan.js';
import { registerCodeMigrationWalkTool } from './migration-walk.js';

export function registerCodeTools(): void {
	registerCodeClassLocateTool();
	registerCodeClassFieldsTool();
	registerCodeClassReferencesTool();
	registerCodeOrmScanTool();
	registerCodeMigrationWalkTool();
}
