/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * test.locate exploration runner.
 *
 * plans/exploration-based-context-build.md Phase 4. Given a subject
 * (module name, class name, or function name), enumerate the test
 * entities + files that plausibly cover it.
 *
 * Two signal paths, taken TOGETHER for recall:
 *   1. Name-driven: any entity in the repo whose name contains a
 *      distinctive fragment of the subject AND whose file lives in
 *      a canonical test directory (or matches a test-file naming
 *      convention).
 *   2. File-driven: any test file whose stem echoes the subject
 *      (e.g. `test_payable_matcher.py` for `payable_matcher`).
 *
 * Deterministic + repo-scoped. No LLM.
 */

import { basename, extname } from 'node:path';

import { getDb } from '../../db/client.js';
import { listEntitiesForRepo } from '../../db/entities.js';
import { getLogger } from '../../shared/logger.js';
import type { Entity, EntityKind } from '../../shared/types.js';

import type {
	Exploration,
	ExplorationRunnerContext,
	TestLocateHit,
	TestLocateOutput,
} from './types.js';

const log = getLogger('analyze:explore:test-locate');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DEFAULT_TOP_K = 20;
const MAX_TOP_K     = 100;

const TEST_PATH_RX = /(^|\/)(tests?|__tests__|test|spec|specs)\/|(^|\/)(test_|spec_)/i;
const TEST_STEM_RX = /^(test_|spec_)|(_test|_spec)$/i;

const TESTABLE_KINDS: readonly EntityKind[] = ['function', 'method', 'class'];

// ---------------------------------------------------------------------------
// Params
// ---------------------------------------------------------------------------

interface TestLocateParams {
	readonly subject: string;
	readonly topK?:   number;
}

function parseParams(exp: Exploration): TestLocateParams {
	const p = exp.params as Record<string, unknown>;
	const subject = typeof p['subject'] === 'string' ? (p['subject'] as string).trim() : '';
	if (subject.length === 0) {
		throw new Error('test.locate: params.subject is required (non-empty string)');
	}
	const topK = typeof p['topK'] === 'number' && p['topK']! > 0
		? Math.min(MAX_TOP_K, Math.floor(p['topK'] as number))
		: DEFAULT_TOP_K;
	return { subject, topK };
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export async function runTestLocate(
	exp: Exploration,
	ctx: ExplorationRunnerContext,
): Promise<TestLocateOutput> {
	const params = parseParams(exp);
	const db = await getDb();

	// Split subject into distinctive fragments. Drop 2-char and
	// generic fragments so a subject like "the matching module" doesn't
	// pull `the`, `module` (already noise for test-file matching).
	const fragments = tokenise(params.subject);
	if (fragments.length === 0) {
		return {
			type:         'test.locate',
			subject:      params.subject,
			hits:         [],
			notFoundNote: `Subject "${params.subject}" contained no distinctive fragments to match against test entities.`,
		};
	}

	const all = await listEntitiesForRepo(db, ctx.repoPath);

	const hitsByFile = new Map<string, TestLocateHit>();
	const entityHits: TestLocateHit[] = [];

	for (const e of all) {
		if (e.artifact === true) continue;
		// Drop stale entities under gitignored paths so a compiled
		// twin doesn't double-count as a matching test.
		if (!ctx.ignoreFilter.isIncluded(e.file)) continue;
		const inTestPath = TEST_PATH_RX.test(e.file);
		const stemIsTest = TEST_STEM_RX.test(basename(e.file, extname(e.file)));

		// Path filter: entity file MUST live in a test path (dir or
		// stem-shaped). Otherwise this is production code, not a test.
		if (!inTestPath && !stemIsTest) continue;

		// Path-level hit (file shape names the subject)
		const stem = basename(e.file, extname(e.file)).toLowerCase();
		const fileMatches = fragments.some(f => stem.includes(f));

		// Entity-level hit (test function / class names the subject)
		const nameMatches = TESTABLE_KINDS.includes(e.kind)
			&& fragments.some(f => e.name.toLowerCase().includes(f));

		if (nameMatches) {
			entityHits.push({
				entityId:  e.id,
				name:      e.name,
				kind:      e.kind as TestLocateHit['kind'],
				file:      e.file,
				startLine: e.startLine,
			});
		}
		if (fileMatches && !hitsByFile.has(e.file)) {
			hitsByFile.set(e.file, {
				name: basename(e.file),
				kind: 'file',
				file: e.file,
			});
		}
	}

	// Combine: entity hits first (they're more specific), then
	// file-level hits, deduped by (file, entityId).
	const combined: TestLocateHit[] = [];
	const seen = new Set<string>();
	for (const list of [entityHits, Array.from(hitsByFile.values())]) {
		for (const h of list) {
			const key = `${h.file}::${h.entityId ?? h.name}`;
			if (seen.has(key)) continue;
			seen.add(key);
			combined.push(h);
			if (combined.length >= (params.topK ?? DEFAULT_TOP_K)) break;
		}
		if (combined.length >= (params.topK ?? DEFAULT_TOP_K)) break;
	}

	log.info(
		{
			runId:      ctx.runId,
			subject:    params.subject,
			fragments,
			returned:   combined.length,
			entityHits: entityHits.length,
			fileHits:   hitsByFile.size,
		},
		'test.locate: complete',
	);

	return {
		type:         'test.locate',
		subject:      params.subject,
		hits:         combined,
		notFoundNote: combined.length === 0
			? `No test entities or files under "${ctx.repoPath}" matched fragments [${fragments.join(', ')}] of "${params.subject}".`
			: '',
	};
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STOP = new Set([
	'the', 'and', 'for', 'with', 'this', 'that', 'from', 'into', 'onto',
	'module', 'class', 'function', 'method', 'system', 'framework',
	'code', 'test', 'spec', 'file', 'files',
]);

/**
 * Split the subject into distinctive lowercase fragments >= 3 chars.
 * Splits on non-alphanumerics AND on camelCase boundaries so
 * `PayableExtractionAgent` -> [payable, extraction, agent].
 */
function tokenise(subject: string): string[] {
	const raw = subject
		.replace(/([a-z0-9])([A-Z])/g, '$1_$2')  // camelCase splitter
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter(t => t.length >= 3 && !STOP.has(t));
	return Array.from(new Set(raw));
}

// ---------------------------------------------------------------------------
// Test-only exports
// ---------------------------------------------------------------------------

export const _tokeniseSubjectForTest = tokenise;
