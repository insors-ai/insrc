/**
 * code_orm_scan -- scan a repo for ORM-defined models
 * (code-analyzer-skills.md Phase 0.4).
 *
 * The largest of the Phase 0 tools. v1 ships Prisma + TypeORM
 * (the two ORMs the data-analyzer §3.3 wrapper most commonly
 * encounters in TypeScript stacks). Adding more dialects is a
 * per-file plug-in: implement `orm/<dialect>.ts` exporting
 * `detectX(repoPath)` + `scanX(repoPath)` and register the pair
 * in DIALECT_REGISTRY below.
 *
 * Dispatch:
 *   - `orm: 'auto'`     -> run `detectX` for every dialect; scan
 *                          every detected dialect; merge `models`
 *   - `orm: '<name>'`   -> scan that dialect only (skip detection)
 *
 * Read-only; no approval gate. Tool id's first underscore-segment
 * is `code` -- already in `ALL_CATEGORIES` (tools/config.ts:88).
 */

import { getLogger } from '../../../../shared/logger.js';
import { registerTool } from '../../registry.js';
import type { Tool, ToolDeps, ToolInput, ToolResult } from '../../types.js';
import type { OrmDialect, OrmModel } from './orm/types.js';
import { detectPrisma,  scanPrisma  } from './orm/prisma.js';
import { detectTypeORM, scanTypeORM } from './orm/typeorm.js';

const log = getLogger('code-orm-scan');

interface DialectHandler {
	readonly id:     OrmDialect;
	readonly detect: (repoPath: string) => Promise<boolean>;
	readonly scan:   (repoPath: string) => Promise<OrmModel[]>;
}

// Registry of supported ORMs. Order is the auto-mode iteration
// order; user-facing output preserves it so callers see a stable
// dialect list.
const DIALECT_REGISTRY: readonly DialectHandler[] = [
	{ id: 'prisma',  detect: detectPrisma,  scan: scanPrisma  },
	{ id: 'typeorm', detect: detectTypeORM, scan: scanTypeORM },
];

const SUPPORTED_INPUT_VALUES: readonly string[] = [...DIALECT_REGISTRY.map(d => d.id), 'auto'];

interface OrmScanOutput {
	readonly detected: { readonly orms: readonly OrmDialect[] };
	readonly models:   readonly OrmModel[];
}

const codeOrmScanTool: Tool = {
	id: 'code_orm_scan',
	description:
		'Scan a repo for ORM-defined models. Input: `{ orm: "prisma" | "typeorm" | "auto", ' +
		'repoPath? }`. Output: `{ detected: { orms: [...] }, models: [{ name, table?, columns, ' +
		'relations, path, line, dialect }] }`. Auto mode probes every supported dialect by repo ' +
		'fingerprint (Prisma: prisma/schema.prisma; TypeORM: any TS class with @Entity in body). ' +
		'Read-only; no approval gate.',
	inputSchema: {
		type: 'object',
		properties: {
			orm: {
				type: 'string',
				description: 'ORM dialect to scan, or "auto" to detect every supported one.',
				enum: SUPPORTED_INPUT_VALUES as readonly string[],
			},
			repoPath: {
				type: 'string',
				description: 'Repo root absolute path. Required (the workspace cannot be inferred at the tool layer).',
			},
		},
		required: ['orm', 'repoPath'],
		additionalProperties: false,
	},
	requiresApproval: false,

	async execute(input: ToolInput, _deps: ToolDeps): Promise<ToolResult> {
		const orm      = typeof input['orm']      === 'string' ? input['orm']      : '';
		const repoPath = typeof input['repoPath'] === 'string' ? input['repoPath'] : '';

		if (repoPath.length === 0)            return fail('repoPath is required');
		if (orm.length === 0)                 return fail('orm is required');
		if (!SUPPORTED_INPUT_VALUES.includes(orm)) {
			return fail(`unknown orm '${orm}'; supported: ${SUPPORTED_INPUT_VALUES.join(', ')}`);
		}

		const handlers = orm === 'auto'
			? DIALECT_REGISTRY
			: DIALECT_REGISTRY.filter(d => d.id === orm);

		const detected: OrmDialect[] = [];
		const models:   OrmModel[]   = [];

		for (const h of handlers) {
			let isPresent: boolean;
			if (orm === 'auto') {
				try {
					isPresent = await h.detect(repoPath);
				} catch (err) {
					log.warn({ dialect: h.id, err: errMessage(err) }, 'detect failed');
					continue;
				}
				if (!isPresent) continue;
			}
			detected.push(h.id);

			try {
				const dialectModels = await h.scan(repoPath);
				models.push(...dialectModels);
			} catch (err) {
				log.warn({ dialect: h.id, err: errMessage(err) }, 'scan failed; skipping');
			}
		}

		const output: OrmScanOutput = {
			detected: { orms: detected },
			models,
		};

		log.info(
			{ orm, repoPath, detected: detected.length, models: models.length },
			'code_orm_scan',
		);
		return ok(output);
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
		output: `[code_orm_scan] ${msg}`,
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

export function registerCodeOrmScanTool(): void {
	registerTool(codeOrmScanTool);
}

// ---------------------------------------------------------------------------
// Test exports
// ---------------------------------------------------------------------------

export const _codeOrmScanToolForTest      = codeOrmScanTool;
export const _DIALECT_REGISTRY_FOR_TEST   = DIALECT_REGISTRY;
