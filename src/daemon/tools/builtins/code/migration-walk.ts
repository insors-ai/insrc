/**
 * code_migration_walk -- enumerate a repo's migrations + parse the
 * DDL into typed operations (code-analyzer-skills.md Phase 0.5).
 *
 * v1 ships Prisma migrate + Rails (the two stacks the data-analyzer
 * §3.5 wrapper most often encounters in the team's actual repos).
 * Adding more tools is a per-file plug-in: implement
 * `migration/<tool>.ts` exporting `detectX(repoPath)` + `scanX(repoPath)`
 * and register the pair in the registry below.
 *
 * Dispatch:
 *   - `tool: 'auto'`         -> run `detectX` for every supported
 *                               tool, scan the first detected hit
 *                               (migrations are uniquely owned by one
 *                               tool per repo; merging would yield
 *                               nonsense)
 *   - `tool: '<name>'`       -> scan that tool only (no detection)
 *
 * Output discriminator: `{ detected: false }` when no migrations
 * directory is present (auto mode found nothing), or
 * `{ detected: true, tool, migrations }` when the walk produced
 * results. Keeps the data-analyzer §3.5 wrapper's typed-refusal
 * surface clean.
 */

import { getLogger } from '../../../../shared/logger.js';
import { registerTool } from '../../registry.js';
import type { Tool, ToolDeps, ToolInput, ToolResult } from '../../types.js';
import type { Migration, MigrationTool } from './migration/types.js';
import { detectPrismaMigrate, scanPrismaMigrate } from './migration/prisma-migrate.js';
import { detectRails, scanRails } from './migration/rails.js';

const log = getLogger('code-migration-walk');

interface ToolHandler {
	readonly id:     MigrationTool;
	readonly detect: (repoPath: string) => Promise<boolean>;
	readonly scan:   (repoPath: string) => Promise<Migration[]>;
}

// Registry order = auto-mode probe order. The first detected tool
// wins; migrations are uniquely owned by one tool per repo.
const TOOL_REGISTRY: readonly ToolHandler[] = [
	{ id: 'prisma-migrate', detect: detectPrismaMigrate, scan: scanPrismaMigrate },
	{ id: 'rails',          detect: detectRails,         scan: scanRails         },
];

const SUPPORTED_INPUT_VALUES: readonly string[] = [...TOOL_REGISTRY.map(t => t.id), 'auto'];

interface MigrationWalkOutput {
	readonly detected:   boolean;
	readonly tool?:      MigrationTool;
	readonly migrations: readonly Migration[];
}

const codeMigrationWalkTool: Tool = {
	id: 'code_migration_walk',
	description:
		'Walk a repo\'s migrations directory and parse the DDL into typed operations. Input: ' +
		'`{ tool: "prisma-migrate" | "rails" | "auto", repoPath }`. Output: `{ detected, ' +
		'tool?, migrations: [{ id, label, path, operations: [{ kind, table?, column?, type?, ' +
		'nullable?, default?, raw? }] }] }`. Auto mode probes by directory fingerprint; the ' +
		'first detected tool wins. Read-only; no approval gate.',
	inputSchema: {
		type: 'object',
		properties: {
			tool: {
				type: 'string',
				description: 'Migration tool to scan, or "auto" to detect by directory fingerprint.',
				enum: SUPPORTED_INPUT_VALUES as readonly string[],
			},
			repoPath: {
				type: 'string',
				description: 'Repo root absolute path. Required.',
			},
		},
		required: ['tool', 'repoPath'],
		additionalProperties: false,
	},
	requiresApproval: false,

	async execute(input: ToolInput, _deps: ToolDeps): Promise<ToolResult> {
		const tool     = typeof input['tool']     === 'string' ? input['tool']     : '';
		const repoPath = typeof input['repoPath'] === 'string' ? input['repoPath'] : '';

		if (repoPath.length === 0) return fail('repoPath is required');
		if (tool.length === 0)     return fail('tool is required');
		if (!SUPPORTED_INPUT_VALUES.includes(tool)) {
			return fail(`unknown tool '${tool}'; supported: ${SUPPORTED_INPUT_VALUES.join(', ')}`);
		}

		// Pick the handler set.
		let chosen: ToolHandler | undefined;
		if (tool === 'auto') {
			for (const h of TOOL_REGISTRY) {
				try {
					if (await h.detect(repoPath)) { chosen = h; break; }
				} catch (err) {
					log.warn({ tool: h.id, err: errMessage(err) }, 'detect failed; continuing');
				}
			}
		} else {
			chosen = TOOL_REGISTRY.find(h => h.id === tool);
		}

		if (chosen === undefined) {
			const out: MigrationWalkOutput = { detected: false, migrations: [] };
			log.info({ tool, repoPath }, 'code_migration_walk: no migrations detected');
			return ok(out);
		}

		let migrations: Migration[];
		try {
			migrations = await chosen.scan(repoPath);
		} catch (err) {
			return fail(`scan failed for ${chosen.id}: ${errMessage(err)}`);
		}

		const out: MigrationWalkOutput = {
			detected:   true,
			tool:       chosen.id,
			migrations,
		};
		log.info(
			{ tool: chosen.id, repoPath, count: migrations.length },
			'code_migration_walk',
		);
		return ok(out);
	},
};

// ---------------------------------------------------------------------------
// Result helpers
// ---------------------------------------------------------------------------

function ok(data: unknown): ToolResult {
	return {
		output: '```json\n' + safeJson(data) + '\n```',
		format: 'markdown',
		success: true,
		data,
	};
}

function fail(msg: string): ToolResult {
	return {
		output: `[code_migration_walk] ${msg}`,
		format: 'text',
		success: false,
		error: msg,
	};
}

function safeJson(v: unknown): string {
	try {
		const j = JSON.stringify(v, null, 2);
		return j.length <= 16_384 ? j : j.slice(0, 16_384) + '\n... <truncated>';
	} catch {
		return '<unserializable>';
	}
}

function errMessage(e: unknown): string {
	if (e instanceof Error) return e.message;
	if (typeof e === 'string') return e;
	return String(e);
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerCodeMigrationWalkTool(): void {
	registerTool(codeMigrationWalkTool);
}

// ---------------------------------------------------------------------------
// Test exports
// ---------------------------------------------------------------------------

export const _codeMigrationWalkToolForTest = codeMigrationWalkTool;
export const _TOOL_REGISTRY_FOR_TEST       = TOOL_REGISTRY;
