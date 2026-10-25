/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { LLMProvider } from '../../../shared/types.js';
import { adherenceSpec } from '../../code-review/dimensions/adherence.js';
import { functionalCoverageSpec } from '../../code-review/dimensions/functional-coverage.js';
import type { CodeReviewGrounding, CodeReviewSubject, DimensionResult } from '../../code-review/types.js';
import { codeReviewSnapshot, modelDimensionAdapter } from '../code-review.js';
import { createReviewJob } from '../job.js';
import { runReviewJob } from '../driver.js';
import { enveloped } from './enveloped.js';

for (const dimension of ['adherence', 'functional-coverage'] as const) {
	const makeSpec = dimension === 'adherence' ? adherenceSpec : functionalCoverageSpec;
	test(`${dimension} requires source inspection and preserves proven breaches while lowering unverified observations`, () => {
		const s = subject('/repo');
		const spec = makeSpec(s);
		assert.equal(spec.sourceInspection, true);
		const prompt = spec.prompt({ symbols: [] }, 'full', undefined).map(m => m.content).join('\n');
		assert.match(prompt, /Inspect the actual source/);
		assert.match(prompt, /read-only commands such as rg, sed or git show/);
		assert.match(prompt, /Absent summaries or notes never prove missing implementation/);
		assert.doesNotMatch(prompt, /Reason only over|no note shows/);
		const findings = [
			{ severity: 'HIGH', confidence: 'breach', location: 'entry.ts:2', message: 'Source proves omitted safeguard.', expectationRef: 'FR1' },
			{ severity: 'MED', confidence: 'breach', location: 'entry.ts:3', message: 'Source proves partial safeguard.', expectationRef: 'FR1' },
			{ severity: 'HIGH', confidence: 'observation', location: 'entry.ts:1', message: 'Could not verify: unreadable helper.', expectationRef: 'FR1' },
			{ severity: 'HIGH', location: 'entry.ts:1', message: 'Legacy confidence absent.', expectationRef: 'FR1' },
			{ severity: 'HIGH', confidence: 'breach', location: 'outside.ts:2', message: 'Outside subject.', expectationRef: 'FR1' },
		];
		// Direct mapping also handles legacy records conservatively, though new model output requires confidence.
		const result = spec.toResult({ findings } as never, { symbols: [] }, 'full');
		assert.deepEqual(result.findings.map(f => [f.severity, f.confidence]), [['HIGH', 'breach'], ['MED', 'breach'], ['LOW', 'observation'], ['LOW', 'observation']]);
		const schema = spec.schema as { properties: { findings: { items: { required: string[] } } } };
		assert.ok(schema.properties.findings.items.required.includes('confidence'));
	});
	for (const divided of [false, true]) for (const behavior of ['implemented', 'omitted', 'unreadable'] as const) {
		test(`${dimension} ${divided ? 'divided' : 'single'} source evidence: ${behavior}`, async () => {
			const repo = mkdtempSync(join(tmpdir(), 'insrc-source-evidence-'));
			try {
				writeFileSync(join(repo, 'entry.ts'), "import { protect } from './helper.js';\nexport function push() { return protect(); }\n");
				if (behavior !== 'unreadable') writeFileSync(join(repo, 'helper.ts'), behavior === 'implemented' ? 'export function protect() { return "protected"; }\n' : 'export function protect() { return "unchecked"; }\n');
				const before = readFileSync(join(repo, 'entry.ts'), 'utf8');
				const s = subject(repo);
				// No summary reveals the implementation; padding forces several chunks on the divided path.
				const g: CodeReviewGrounding = { symbols: Array.from({ length: divided ? 5 : 1 }, (_, i) => ({ entityId: `e${i}`, name: `push${i}`, file: 'entry.ts', kind: 'function', signature: `push${i}() ${' '.repeat(divided ? 7_000 : 0)}`, callers: [], callees: [], testsReaching: [] })) };
				const snapshot = codeReviewSnapshot(s, g);
				const adapter = modelDimensionAdapter(makeSpec(s), s, snapshot, divided ? 20_000 : 100_000);
				let reads = 0, chunks = 0, noNotes = false;
				const provider = {
					completeStructured: async () => { throw new Error('source inspection must use a session'); },
					runReviewSession: async (prompt: string, schema: object, opts: { cwd: string }) => {
						assert.equal(opts.cwd, repo);
						assert.match(prompt, /Inspect the actual source/);
						if (prompt.includes('This review is DIVIDED:')) { chunks++; return enveloped(schema, { notes: [] }); }
						noNotes ||= prompt.includes('No chunk of the divided review showed evidence');
						// This deterministic provider actually reads the fixture source; it does not pretend to test LLM reasoning.
						readFileSync(join(opts.cwd, 'entry.ts'), 'utf8'); reads++;
						let source: string;
						try { source = readFileSync(join(opts.cwd, 'helper.ts'), 'utf8'); }
						catch { return enveloped(schema, { findings: [{ severity: 'HIGH', confidence: 'observation', location: 'entry.ts:2', message: 'Could not verify: helper.ts could not be read.', expectationRef: 'FR1' }] }); }
						return enveloped(schema, { findings: source.includes('"protected"') ? [] : [{ severity: 'HIGH', confidence: 'breach', location: 'entry.ts:2', message: 'entry.ts:2 calls helper.ts:1, which returns unchecked without protection.', expectationRef: 'FR1' }] });
					},
				} as unknown as LLMProvider;
				const result = await runReviewJob(createReviewJob(adapter, 'daemon', snapshot, divided ? 20_000 : 100_000), adapter, provider) as DimensionResult;
				assert.ok(reads > 0);
				assert.equal(chunks > 0, divided);
				if (divided) assert.ok(noNotes, 'gather rechecks source even with no chunk notes');
				assert.deepEqual(result.findings.map(f => [f.severity, f.confidence]), behavior === 'implemented' ? [] : behavior === 'omitted' ? [['HIGH', 'breach']] : [['LOW', 'observation']]);
				assert.equal(readFileSync(join(repo, 'entry.ts'), 'utf8'), before);
			} finally { rmSync(repo, { recursive: true, force: true }); }
		});
	}
}

function subject(repoPath: string): CodeReviewSubject {
	return { repoPath, epicHash: 'e', storyId: 's1', changedFiles: ['entry.ts', 'helper.ts'], approvedLld: { body: { contractDetails: { api: [{ name: 'push', signature: 'push(): string' }] }, functionalDefinition: { requirements: [{ id: 'FR1', statement: 'Protect the remote.', scope: 'doc' }] } } } as unknown as CodeReviewSubject['approvedLld'], approvedPlan: null, buildRecord: null };
}
