/**
 * Shape-inference helpers shared across families.
 *
 * Originally lived in `kv-common.ts`. Lifted here in phase 7 because
 * RDBMS JSON-column inspection + file-format shape sampling now reuse
 * the same recursive walk.
 *
 * `inferShape` produces a flat `ShapeReport` -- one entry per dot-path
 * observed across the input batch, with type union + nullability +
 * frequency. Arrays collapse element-level paths onto `[]` to avoid
 * path explosion on variable-length arrays.
 */

import type { ShapeReport } from '../../../shared/db-driver.js';

interface FieldAcc {
	types: Set<string>;
	nullCount: number;
	totalCount: number;
}

export function inferShape(values: readonly unknown[]): ShapeReport {
	const acc = new Map<string, FieldAcc>();

	for (const v of values) {
		walk(v, '', acc);
	}

	const fields = Array.from(acc.entries()).map(([path, a]) => ({
		path,
		types: Array.from(a.types).sort(),
		nullable: a.nullCount > 0,
		frequency: a.totalCount / values.length,
	}));
	fields.sort((a, b) => a.path.localeCompare(b.path));

	return { sampleSize: values.length, fields };
}

function walk(node: unknown, path: string, acc: Map<string, FieldAcc>): void {
	if (path !== '') { bump(acc, path, typeName(node), node === null); }

	if (node === null || typeof node !== 'object') { return; }

	if (Array.isArray(node)) {
		const childPath = path === '' ? '[]' : `${path}.[]`;
		for (const item of node) { walk(item, childPath, acc); }
		return;
	}

	for (const [k, v] of Object.entries(node)) {
		walk(v, path === '' ? k : `${path}.${k}`, acc);
	}
}

function bump(
	acc: Map<string, FieldAcc>,
	path: string,
	type: string,
	isNull: boolean,
): void {
	let a = acc.get(path);
	if (a === undefined) {
		a = { types: new Set(), nullCount: 0, totalCount: 0 };
		acc.set(path, a);
	}
	a.types.add(type);
	if (isNull) { a.nullCount++; }
	a.totalCount++;
}

function typeName(value: unknown): string {
	if (value === null) { return 'null'; }
	if (Array.isArray(value)) { return 'array'; }
	if (value instanceof Uint8Array) { return 'binary'; }
	return typeof value;
}
