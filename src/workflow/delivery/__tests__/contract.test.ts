/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** E1 / S005 — the sc7 types' client mirrors: the VS Code type-only consumer and the JetBrains sample snapshot. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { deriveCurrency } from '../currency.js';
import { deriveGates } from '../gate.js';
import { buildWorkItemGraph } from '../graph.js';
import { assembleSnapshot } from '../snapshot.js';
import { deriveStages } from '../stage.js';
import type { ArtifactRecord, DeliveryMarkdownPort, DeliverySnapshot } from '../types.js';
import { CREATED, amdRecord, buildRecord, crRecord, defRecord, hldRecord, issueRecord, lldRecord, planRecord, recordSet } from './fixtures.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../../..');
const SAMPLE = join(HERE, 'fixtures', 'delivery-snapshot.sample.json');

const EPIC  = 'aaaaaaaaaaaaaaaa';
const ISSUE = 'bbbbbbbbbbbbbbbb';
const APPROVED = { approvedAt: CREATED };

/** The sample's store: a complete story, a pending one, an amendment and a standalone issue. */
const RECORDS: readonly ArtifactRecord[] = [
	defRecord(EPIC, ['s1', 's2'], APPROVED),
	hldRecord(EPIC, APPROVED),
	amdRecord(EPIC, 1, 's3'),
	lldRecord(EPIC, 's1', APPROVED),
	planRecord(EPIC, 's1', ['t1'], APPROVED),
	buildRecord(EPIC, 's1', [{ id: 't1', passed: true }], APPROVED),
	crRecord(EPIC, 's1', 'pass'),
	lldRecord(EPIC, 's2'),
	issueRecord(ISSUE, { slug: 'fix-it' }, { magnitude: 'small' }),
];

/** Every DEF, HLD and LLD has marked markdown under docs/; nothing else does. */
const PORT: DeliveryMarkdownPort = {
	markdownOf: r => (['DEF', 'HLD', 'LLD'].includes(r.kind) ? { mdPath: `/repo/docs/${r.artifactId}.md`, hasMarker: true } : null),
};

/** The snapshot the sample must equal. */
export function sampleSnapshot(): DeliverySnapshot {
	const set = recordSet(RECORDS);
	const graph = buildWorkItemGraph(set);
	return assembleSnapshot(set, graph, deriveStages(graph, set), deriveGates(graph, set), deriveCurrency(graph, set), PORT);
}

test('the VS Code plugin type-checks against the published delivery types', () => {
	try {
		execFileSync('npx', ['tsc', '-p', 'vscode-plugin/tsconfig.delivery-contract.json'], { cwd: REPO_ROOT, encoding: 'utf8', stdio: 'pipe' });
	} catch (err) {
		const e = err as { stdout?: string; stderr?: string };
		assert.fail(`vscode-plugin/src/delivery/delivery-contract.ts does not type-check:\n${e.stdout ?? ''}${e.stderr ?? ''}`);
	}
});

test('the JetBrains sample snapshot is plain JSON and equals what the assembler produces', () => {
	const text = readFileSync(SAMPLE, 'utf8');
	const parsed: unknown = JSON.parse(text);
	const expected = sampleSnapshot();
	assert.deepEqual(parsed, expected, 'regenerate the sample: JSON.stringify(sampleSnapshot(), null, 2) + newline');
	assert.equal(text, `${JSON.stringify(expected, null, 2)}\n`, 'the sample is the canonical two-space rendering');
	// Gson reads by field name: every item kind, a stage, evidence of both openWith values and an amendment are present.
	const s = parsed as DeliverySnapshot;
	assert.deepEqual(new Set(s.items.map(i => i.kind)), new Set(['epic', 'story', 'task', 'issue']));
	assert.ok(s.items.some(i => i.stage !== null));
	assert.deepEqual(new Set(s.items.flatMap(i => i.evidence.map(e => e.openWith))), new Set(['review-view', 'evidence-read']));
	assert.ok(s.items.some(i => i.amendments.length > 0));
});
