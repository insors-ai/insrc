/**
 * Prisma migrate walker (code-analyzer-skills.md Phase 0.5).
 *
 * Layout:
 *
 *   prisma/migrations/
 *     20240601120000_add_users/
 *       migration.sql
 *     20240615133000_add_index/
 *       migration.sql
 *
 * Each `<timestamp>_<name>/migration.sql` is plain DDL. The walker
 * collects them in lex-order (timestamps sort chronologically),
 * extracts SQL operations via the shared sql.ts parser, and yields
 * one Migration per file.
 */

import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { extractDdlOps } from './sql.js';
import type { Migration } from './types.js';

const MIGRATIONS_REL_PATH = 'prisma/migrations';

export async function detectPrismaMigrate(repoPath: string): Promise<boolean> {
	try {
		const stat = await fs.stat(join(repoPath, MIGRATIONS_REL_PATH));
		return stat.isDirectory();
	} catch {
		return false;
	}
}

export async function scanPrismaMigrate(repoPath: string): Promise<Migration[]> {
	const root = join(repoPath, MIGRATIONS_REL_PATH);
	let entries: string[];
	try {
		entries = await fs.readdir(root);
	} catch {
		return [];
	}
	entries.sort();

	const out: Migration[] = [];
	for (const dir of entries) {
		const sqlPath = join(root, dir, 'migration.sql');
		let raw: string;
		try {
			raw = await fs.readFile(sqlPath, 'utf8');
		} catch {
			continue;
		}
		const { id, label } = parseDirName(dir);
		out.push({
			id,
			label,
			path: sqlPath,
			operations: extractDdlOps(raw),
		});
	}
	return out;
}

function parseDirName(dir: string): { id: string; label: string } {
	// Prisma's convention: `<14-digit ts>_<snake_case_label>`.
	const m = /^(\d{14})_(.+)$/.exec(dir);
	if (m === null) return { id: dir, label: dir };
	return { id: m[1]!, label: m[2]!.replace(/_/g, ' ') };
}
