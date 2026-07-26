/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Acceptance-criteria back-flow audit (t1).
 *
 * The standalone LLD ships a test-strategy `acceptanceMapping` organized around
 * criterionId values ac1..ac9. This story has no separate epic/define Story
 * artifact (it is standalone), so the nine criteria are back-flowed WITH TEXT
 * into the LLD body's `acceptanceCriteria`, each cross-referenced to the plan
 * task(s) that discharge it. This test audits that traceability: every mapping
 * id resolves to a criterion with non-empty text, every dischargedBy id is a
 * real plan task, and every plan task (except t1 — the anchoring task itself,
 * which touches no production code) is referenced by at least one criterion.
 *
 * Run: npx tsx --test src/config/__tests__/acceptance-mapping-audit.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..');
const LLD = join(REPO, '.insrc', 'artifacts', 'LLD-d01caa994c304bcb-S001.json');
const PLAN = join(REPO, '.insrc', 'artifacts', 'PLAN-d01caa994c304bcb-S001.json');

interface Criterion { id: string; criterion: string; dischargedBy: string[] }

function lldBody(): {
	acceptanceCriteria: Criterion[];
	testStrategy: { acceptanceMapping: Array<{ criterionId: string }> };
} {
	return (JSON.parse(readFileSync(LLD, 'utf-8')) as { body: unknown }).body as never;
}

function planTaskIds(): Set<string> {
	const plan = JSON.parse(readFileSync(PLAN, 'utf-8')) as { body: { tasks: Array<{ id: string }> } };
	return new Set(plan.body.tasks.map(t => t.id));
}

test('ac1..ac9 each resolve to an acceptanceCriteria entry with non-empty criterion text', () => {
	const { acceptanceCriteria } = lldBody();
	const byId = new Map(acceptanceCriteria.map(c => [c.id, c]));
	for (const id of ['ac1', 'ac2', 'ac3', 'ac4', 'ac5', 'ac6', 'ac7', 'ac8', 'ac9']) {
		const c = byId.get(id);
		assert.ok(c, `missing criterion ${id}`);
		assert.ok(c!.criterion.trim().length > 0, `${id} has empty text`);
	}
});

test('every acceptanceMapping criterionId resolves to a back-flowed criterion — no unanchored id', () => {
	const body = lldBody();
	const ids = new Set(body.acceptanceCriteria.map(c => c.id));
	for (const m of body.testStrategy.acceptanceMapping) {
		assert.ok(ids.has(m.criterionId), `unanchored criterionId ${m.criterionId}`);
	}
});

test('every dischargedBy id is a real plan task, and every plan task (except t1) is referenced by ≥1 criterion', () => {
	const { acceptanceCriteria } = lldBody();
	const tasks = planTaskIds();
	const referenced = new Set<string>();
	for (const c of acceptanceCriteria) {
		for (const t of c.dischargedBy) {
			assert.ok(tasks.has(t), `criterion ${c.id} references non-existent task ${t}`);
			referenced.add(t);
		}
	}
	// t1 is the back-flow task itself (documents the criteria; no production code) → self-referential, excluded.
	for (const t of tasks) {
		if (t === 't1') continue;
		assert.ok(referenced.has(t), `plan task ${t} is referenced by no criterion`);
	}
});
