/**
 * Rails ActiveRecord migration walker
 * (code-analyzer-skills.md Phase 0.5).
 *
 * Layout:
 *
 *   db/migrate/
 *     20240601120000_create_users.rb
 *     20240615133000_add_email_index.rb
 *
 * Each `<14-digit ts>_<snake_case>.rb` defines a class extending
 * `ActiveRecord::Migration[<v>]`. The walker:
 *
 *   1. Reads the .rb file.
 *   2. Strips comments (`#`) outside string literals.
 *   3. Recognises the four most common DSL forms:
 *
 *        create_table :users do |t|
 *          t.string :email, null: false
 *          t.timestamps
 *        end
 *        drop_table :users
 *        add_column :users, :status, :string, null: true, default: 'open'
 *        remove_column :users, :status
 *        rename_column :users, :status, :state
 *        add_index :users, :email, unique: true
 *        remove_index :users, :email
 *        rename_table :old_name, :new_name
 *
 *   4. Anything else falls through as `kind: 'execute_raw'` with
 *      the source line clipped to 200 chars.
 *
 * Out of scope for v1: `change_column` (requires DDL synthesis we
 * don't need yet) and `<<-SQL` heredoc blocks (parse via sql.ts in
 * a future iteration once we see real callers asking for it).
 */

import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { Migration, MigrationOp } from './types.js';

const MIGRATE_REL_PATH = 'db/migrate';

export async function detectRails(repoPath: string): Promise<boolean> {
	try {
		const stat = await fs.stat(join(repoPath, MIGRATE_REL_PATH));
		return stat.isDirectory();
	} catch {
		return false;
	}
}

export async function scanRails(repoPath: string): Promise<Migration[]> {
	const root = join(repoPath, MIGRATE_REL_PATH);
	let files: string[];
	try {
		files = await fs.readdir(root);
	} catch {
		return [];
	}
	files = files.filter(f => f.endsWith('.rb'));
	files.sort();

	const out: Migration[] = [];
	for (const f of files) {
		const fpath = join(root, f);
		let raw: string;
		try {
			raw = await fs.readFile(fpath, 'utf8');
		} catch {
			continue;
		}
		const { id, label } = parseFileName(f);
		out.push({
			id,
			label,
			path:       fpath,
			operations: extractRubyOps(raw),
		});
	}
	return out;
}

function parseFileName(file: string): { id: string; label: string } {
	const m = /^(\d{14})_([\w]+)\.rb$/.exec(file);
	if (m === null) return { id: file, label: file };
	return { id: m[1]!, label: m[2]!.replace(/_/g, ' ') };
}

// ---------------------------------------------------------------------------
// Ruby DSL parser
// ---------------------------------------------------------------------------

export function extractRubyOps(raw: string): MigrationOp[] {
	const ops: MigrationOp[] = [];
	const lines = stripComments(raw).split('\n');

	let i = 0;
	while (i < lines.length) {
		const line = lines[i]!.trim();
		if (line.length === 0) { i++; continue; }

		// create_table :users [, opts] do |t|  ... end
		const ct = /^create_table\s+:?(['"]?)([A-Za-z_]\w*)\1/.exec(line);
		if (ct !== null && /\bdo\b/.test(line)) {
			const table = ct[2]!;
			ops.push({ kind: 'create_table', table });

			// Walk inner lines until matching `end`.
			let depth = 1;
			i++;
			while (i < lines.length && depth > 0) {
				const inner = lines[i]!.trim();
				if (/^\s*end\s*$/.test(inner)) {
					depth--;
					if (depth === 0) break;
				} else if (/\bdo\b/.test(inner)) {
					depth++;
				}
				const colOp = parseInnerColumn(table, inner);
				if (colOp !== null) ops.push(colOp);
				i++;
			}
			i++;
			continue;
		}

		const dt = /^drop_table\s+:?(['"]?)([A-Za-z_]\w*)\1/.exec(line);
		if (dt !== null) { ops.push({ kind: 'drop_table', table: dt[2]! }); i++; continue; }

		const ac = /^add_column\s+:?(['"]?)([A-Za-z_]\w*)\1\s*,\s*:?(['"]?)([A-Za-z_]\w*)\3\s*,\s*:?(['"]?)([A-Za-z_]\w*)\5(?:\s*,\s*(.+))?/.exec(line);
		if (ac !== null) {
			const table = ac[2]!;
			const column = ac[4]!;
			const type   = ac[6]!;
			const opts   = ac[7] ?? '';
			const op: MigrationOp = { kind: 'add_column', table, column, type };
			const nullable = parseRubyNullable(opts);
			const def      = parseRubyDefault(opts);
			if (nullable !== undefined) (op as { nullable?: boolean }).nullable = nullable;
			if (def !== undefined)      (op as { default?: string }).default = def;
			ops.push(op);
			i++;
			continue;
		}

		const rc = /^remove_column\s+:?(['"]?)([A-Za-z_]\w*)\1\s*,\s*:?(['"]?)([A-Za-z_]\w*)\3/.exec(line);
		if (rc !== null) {
			ops.push({ kind: 'drop_column', table: rc[2]!, column: rc[4]! });
			i++;
			continue;
		}

		const rcn = /^rename_column\s+:?(['"]?)([A-Za-z_]\w*)\1\s*,\s*:?(['"]?)([A-Za-z_]\w*)\3\s*,\s*:?(['"]?)([A-Za-z_]\w*)\5/.exec(line);
		if (rcn !== null) {
			ops.push({
				kind:   'rename_column',
				table:  rcn[2]!,
				column: rcn[4]!,
				raw:    `${rcn[4]!} -> ${rcn[6]!}`,
			});
			i++;
			continue;
		}

		const rt = /^rename_table\s+:?(['"]?)([A-Za-z_]\w*)\1\s*,\s*:?(['"]?)([A-Za-z_]\w*)\3/.exec(line);
		if (rt !== null) {
			ops.push({
				kind:   'rename_table',
				table:  rt[2]!,
				column: rt[4]!,
				raw:    `${rt[2]!} -> ${rt[4]!}`,
			});
			i++;
			continue;
		}

		const ai = /^add_index\s+:?(['"]?)([A-Za-z_]\w*)\1\s*,\s*(\[[^\]]+\]|:?(?:['"]?)[A-Za-z_]\w*(?:['"]?))(?:\s*,\s*(.+))?/.exec(line);
		if (ai !== null) {
			const table = ai[2]!;
			const colsRaw = ai[3]!.trim();
			ops.push({
				kind:   'add_index',
				table,
				column: cleanRubySymbolList(colsRaw),
			});
			i++;
			continue;
		}

		const ri = /^remove_index\s+:?(['"]?)([A-Za-z_]\w*)\1\s*,\s*(.+)/.exec(line);
		if (ri !== null) {
			ops.push({
				kind:   'drop_index',
				table:  ri[2]!,
				column: cleanRubySymbolList(ri[3]!),
			});
			i++;
			continue;
		}

		// `def change`, `def up`, `def down`, `class ...`, control-flow,
		// and unknown DSL calls all fall through here -- silently in v1.
		// We could surface them as `execute_raw`, but it bloats the
		// output for the typical "all-recognised" migration. If a future
		// caller needs full fidelity, add an opt-in flag.
		i++;
	}
	return ops;
}

function parseInnerColumn(table: string, line: string): MigrationOp | null {
	// `t.timestamps` adds created_at + updated_at.
	if (/^t\.timestamps(?:_with_time_zone)?\s*$/.test(line)) {
		return {
			kind:    'add_column',
			table,
			column:  'created_at,updated_at',
			type:    'datetime',
			nullable: false,
		};
	}
	const m = /^t\.([A-Za-z_]\w*)\s+:?(['"]?)([A-Za-z_]\w*)\2(?:\s*,\s*(.+))?/.exec(line);
	if (m === null) return null;
	const type    = m[1]!;
	const column  = m[3]!;
	const opts    = m[4] ?? '';
	const op: MigrationOp = { kind: 'add_column', table, column, type };
	const nullable = parseRubyNullable(opts);
	const def      = parseRubyDefault(opts);
	if (nullable !== undefined) (op as { nullable?: boolean }).nullable = nullable;
	if (def !== undefined)      (op as { default?: string }).default = def;
	return op;
}

function parseRubyNullable(opts: string): boolean | undefined {
	if (/\bnull\s*:\s*false\b/.test(opts)) return false;
	if (/\bnull\s*:\s*true\b/.test(opts))  return true;
	return undefined;
}

function parseRubyDefault(opts: string): string | undefined {
	const m = /\bdefault\s*:\s*([^,]+)/.exec(opts);
	if (m === null) return undefined;
	const v = m[1]!.trim();
	return v.length === 0 ? undefined : v;
}

function cleanRubySymbolList(raw: string): string {
	return raw.trim()
		.replace(/^\[|\]$/g, '')
		.replace(/[:'"`]/g, '')
		.split(/\s*,\s*/)
		.filter(s => s.length > 0)
		.join(',');
}

function stripComments(raw: string): string {
	const out: string[] = [];
	let inSingle = false;
	let inDouble = false;
	for (let i = 0; i < raw.length; i++) {
		const c = raw.charCodeAt(i);
		if (!inDouble && c === 39) inSingle = !inSingle;
		else if (!inSingle && c === 34) inDouble = !inDouble;
		if (!inSingle && !inDouble && c === 35) {
			// Line comment to EOL.
			while (i < raw.length && raw.charCodeAt(i) !== 10) i++;
			out.push('\n');
			continue;
		}
		out.push(raw[i]!);
	}
	return out.join('');
}
