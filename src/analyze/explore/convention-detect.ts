/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * convention.detect exploration runner.
 *
 * plans/exploration-based-context-build.md Phase 4. Given a
 * directory path, compute the naming schema + base-class idioms
 * the module leans on so the synthesizer can surface conventions
 * before the planner emits new-work tasks.
 *
 * The output is a structural signal, not a prescription: it says
 * "functions here read as snake_case", not "you must use snake_case".
 * The synthesizer's `## Conventions` sub-section presents the
 * breakdown so the reader can decide.
 *
 * Deterministic. Walks entity graph rows under `path` + INHERITS
 * edges for base-class idioms. No LLM. Runs in <200ms for the
 * modules we've measured.
 */

import { basename, extname } from 'node:path';

import { getDb } from '../../db/client.js';
import {
	entityIdsByU64s,
	entityU64ForId,
	getEntitiesByIds,
	listEntitiesForRepo,
} from '../../db/entities.js';
import { inNeighbors, outNeighbors } from '../../db/graph/edges.js';
import { getLogger } from '../../shared/logger.js';
import type { Entity } from '../../shared/types.js';

import type {
	ConventionBaseClassIdiom,
	ConventionDetectOutput,
	ConventionNamingSchema,
	Exploration,
	ExplorationRunnerContext,
	NamingCase,
	TestFileConvention,
} from './types.js';

const log = getLogger('analyze:explore:convention-detect');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** How many representative subclasses to include per base-class idiom. */
const MAX_REPR_SUBCLASSES = 5;

/** Cap on base-class idioms surfaced. */
const MAX_BASE_CLASS_IDIOMS = 8;

/** Threshold at which one bucket dominates over the others -- if
 *  the top bucket accounts for ≥60% of the sample and beats the
 *  runner-up by ≥2x, we report the top bucket; else `mixed`. */
const DOMINANCE_MIN_SHARE   = 0.6;
const DOMINANCE_MIN_RATIO   = 2;

// ---------------------------------------------------------------------------
// Params
// ---------------------------------------------------------------------------

interface ConventionDetectParams {
	readonly path: string;
}

function parseParams(exp: Exploration): ConventionDetectParams {
	const p = exp.params as Record<string, unknown>;
	const path = typeof p['path'] === 'string' ? (p['path'] as string).trim() : '';
	if (path.length === 0) {
		throw new Error('convention.detect: params.path is required (non-empty absolute directory path)');
	}
	return { path };
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export async function runConventionDetect(
	exp: Exploration,
	ctx: ExplorationRunnerContext,
): Promise<ConventionDetectOutput> {
	const params = parseParams(exp);
	const db = await getDb();

	const all = await listEntitiesForRepo(db, ctx.repoPath);
	const under = all.filter(e =>
		e.artifact !== true
		// Drop stale entities under gitignored paths (out/, build/,
		// dist/, ...). Otherwise the naming-convention sample is
		// biased by compiled-output style (kebab-case files, minified
		// symbols) that doesn't reflect authored source.
		&& ctx.ignoreFilter.isIncluded(e.file)
		&& (e.file === params.path || e.file.startsWith(params.path.endsWith('/') ? params.path : params.path + '/')),
	);

	if (under.length === 0) {
		log.info(
			{ runId: ctx.runId, path: params.path },
			'convention.detect: no entities under path',
		);
		return {
			type:              'convention.detect',
			path:              params.path,
			namingSchema:      emptyNamingSchema(),
			baseClassIdioms:   [],
			privatePrefixCount: 0,
			dunderMethodCount:  0,
			totalEntities:     0,
			notFoundNote:      `No indexed entities under path "${params.path}".`,
		};
	}

	// (1) Naming schema
	const namingSchema = computeNamingSchema(under);

	// (2) Base-class idioms via INHERITS edges
	const baseClassIdioms = await computeBaseClassIdioms(under, db, params.path);

	// (3) Private + dunder counts
	let privatePrefixCount = 0;
	let dunderMethodCount  = 0;
	for (const e of under) {
		if (e.kind !== 'function' && e.kind !== 'method') continue;
		if (isDunder(e.name)) dunderMethodCount++;
		else if (e.name.startsWith('_')) privatePrefixCount++;
	}

	log.info(
		{
			runId:        ctx.runId,
			path:         params.path,
			totalEntities: under.length,
			functions:    namingSchema.functions,
			classes:      namingSchema.classes,
			testFiles:    namingSchema.testFiles,
			idioms:       baseClassIdioms.length,
		},
		'convention.detect: complete',
	);

	return {
		type:              'convention.detect',
		path:              params.path,
		namingSchema,
		baseClassIdioms,
		privatePrefixCount,
		dunderMethodCount,
		totalEntities:     under.length,
		notFoundNote:      '',
	};
}

// ---------------------------------------------------------------------------
// Naming schema
// ---------------------------------------------------------------------------

/**
 * Classify a single identifier into one of the naming buckets.
 * `unknown` covers single-char, all-digits, or ambiguous ids.
 */
export function classifyName(name: string): NamingCase {
	if (name.length < 2) return 'unknown';
	// Strip a single leading `_` (private convention) for
	// classification so `_helper_fn` still reads as snake_case.
	let s = name;
	if (s.startsWith('_') && !s.startsWith('__')) s = s.slice(1);
	// Dunder magic methods (Python) don't inform the schema either
	// way -- classify as unknown so they don't bias the sample.
	if (s.startsWith('__') && s.endsWith('__')) return 'unknown';

	if (s.includes('-')) return 'kebab-case';

	const hasUnderscore = s.includes('_');
	const hasUpper = /[A-Z]/.test(s);
	const startsUpper = /^[A-Z]/.test(s);
	if (hasUnderscore && !hasUpper) return 'snake_case';
	if (hasUnderscore && hasUpper) return 'mixed';
	if (!hasUnderscore && startsUpper) return 'PascalCase';
	if (!hasUnderscore && hasUpper && !startsUpper) return 'camelCase';
	if (!hasUnderscore && !hasUpper) return 'snake_case';  // all-lowercase counts as snake_case
	return 'unknown';
}

function computeNamingSchema(entities: readonly Entity[]): ConventionNamingSchema {
	const fnBreak = emptyBreakdown();
	const clsBreak = emptyBreakdown();
	const fileBreak = emptyBreakdown();
	const testFileSeen: Record<TestFileConvention, number> = {
		'test_*': 0, '*_test': 0, '*.spec': 0, '*.test': 0,
		'inline': 0, 'none': 0, 'mixed': 0,
	};

	const seenFiles = new Set<string>();
	let fnCount = 0, clsCount = 0, fileCount = 0;
	let anyTest = false;

	for (const e of entities) {
		if (e.kind === 'function' || e.kind === 'method') {
			fnCount++;
			bump(fnBreak, classifyName(e.name));
		} else if (e.kind === 'class' || e.kind === 'interface') {
			clsCount++;
			bump(clsBreak, classifyName(e.name));
		}
		if (!seenFiles.has(e.file)) {
			seenFiles.add(e.file);
			fileCount++;
			const bn = basename(e.file, extname(e.file));
			bump(fileBreak, classifyName(bn));
			const tc = classifyTestFile(e.file);
			if (tc !== 'none') {
				anyTest = true;
				testFileSeen[tc] = (testFileSeen[tc] ?? 0) + 1;
			}
		}
	}

	return {
		functions:          dominant(fnBreak),
		functionsBreakdown: fnBreak,
		classes:            dominant(clsBreak),
		classesBreakdown:   clsBreak,
		files:              dominant(fileBreak),
		filesBreakdown:     fileBreak,
		testFiles:          anyTest ? dominantTestFile(testFileSeen) : 'none',
		sampleSizes: {
			functions: fnCount,
			classes:   clsCount,
			files:     fileCount,
		},
	};
}

function emptyBreakdown(): Record<string, number> {
	return {
		snake_case: 0,
		camelCase:  0,
		PascalCase: 0,
		'kebab-case': 0,
		mixed:      0,
		unknown:    0,
	};
}

function emptyNamingSchema(): ConventionNamingSchema {
	return {
		functions:          'unknown',
		functionsBreakdown: emptyBreakdown(),
		classes:            'unknown',
		classesBreakdown:   emptyBreakdown(),
		files:              'unknown',
		filesBreakdown:     emptyBreakdown(),
		testFiles:          'none',
		sampleSizes: { functions: 0, classes: 0, files: 0 },
	};
}

/**
 * Return the dominant bucket (>=60% share AND >=2x runner-up) or
 * `mixed` when no single bucket dominates. `unknown` never wins
 * because it's noise, not signal.
 */
function dominant(breakdown: Record<string, number>): NamingCase {
	const total = Object.values(breakdown).reduce((a, b) => a + b, 0)
		- (breakdown['unknown'] ?? 0);
	if (total === 0) return 'unknown';
	const entries = Object.entries(breakdown)
		.filter(([k]) => k !== 'unknown' && k !== 'mixed')
		.sort((a, b) => b[1] - a[1]);
	const [topKey, topCount] = entries[0]!;
	const runnerCount = entries[1]?.[1] ?? 0;
	if (topCount / total >= DOMINANCE_MIN_SHARE
		&& (runnerCount === 0 || topCount / runnerCount >= DOMINANCE_MIN_RATIO)) {
		return topKey as NamingCase;
	}
	return 'mixed';
}

/**
 * Classify a file's naming convention against known test-file
 * shapes. Returns `none` when the file's basename does not read as
 * a test file at all.
 */
function classifyTestFile(file: string): TestFileConvention {
	const bn = basename(file);
	const stem = basename(file, extname(file));
	if (bn.endsWith('.spec.ts') || bn.endsWith('.spec.js') || bn.endsWith('.spec.tsx') || bn.endsWith('.spec.jsx')) return '*.spec';
	if (bn.endsWith('.test.ts') || bn.endsWith('.test.js') || bn.endsWith('.test.tsx') || bn.endsWith('.test.jsx')) return '*.test';
	if (stem.startsWith('test_')) return 'test_*';
	if (stem.endsWith('_test'))   return '*_test';
	// Files inside a canonical test directory whose basename doesn't
	// match a convention -- treat as inline test.
	if (/(^|\/)(tests?|__tests__|test|spec|specs)\//i.test(file)) return 'inline';
	return 'none';
}

function dominantTestFile(counts: Record<TestFileConvention, number>): TestFileConvention {
	const entries = Object.entries(counts)
		.filter(([k]) => k !== 'none' && k !== 'mixed')
		.sort((a, b) => b[1] - a[1]);
	const total = entries.reduce((a, [, c]) => a + c, 0);
	if (total === 0) return 'none';
	const [topKey, topCount] = entries[0]!;
	const runner = entries[1]?.[1] ?? 0;
	if (topCount / total >= DOMINANCE_MIN_SHARE
		&& (runner === 0 || topCount / runner >= DOMINANCE_MIN_RATIO)) {
		return topKey as TestFileConvention;
	}
	return 'mixed';
}

// ---------------------------------------------------------------------------
// Base-class idioms via INHERITS edges (in-degree perspective)
// ---------------------------------------------------------------------------

async function computeBaseClassIdioms(
	under: readonly Entity[],
	db:    Awaited<ReturnType<typeof getDb>>,
	path:  string,
): Promise<readonly ConventionBaseClassIdiom[]> {
	// Only classes / interfaces / types can serve as bases. Walk each
	// entity's INHERITS-out edges; aggregate to the base + its
	// in-module subclasses.
	const classesInModule = under.filter(e =>
		e.kind === 'class' || e.kind === 'interface' || e.kind === 'type',
	);
	if (classesInModule.length === 0) return [];

	const inModuleIds = new Set(classesInModule.map(e => e.id));

	// Map baseName -> { baseEntityId?, subs: Entity[] }
	const idiomMap = new Map<string, { baseEntityId?: string; subs: Entity[] }>();

	for (const sub of classesInModule) {
		const u64 = await entityU64ForId(sub.id);
		if (u64 === undefined) continue;
		const inheritsOut = await outNeighbors(u64, { kindFilter: ['INHERITS'] });
		if (inheritsOut.length === 0) continue;
		const idMap = await entityIdsByU64s(inheritsOut);
		const baseIds = Array.from(idMap.values());
		const baseEnts = baseIds.length > 0 ? await getEntitiesByIds(db, baseIds) : [];
		for (const base of baseEnts) {
			// Skip when the base itself lives inside the same module --
			// this is intra-module refinement, not an "idiom to notice."
			// Idioms are cross-module bases the module leans on.
			if (base.file.startsWith(path.endsWith('/') ? path : path + '/')
				|| base.file === path) {
				continue;
			}
			// Skip when the base is an artefact.
			if (base.artifact === true) continue;
			const key = base.name;
			const slot = idiomMap.get(key);
			if (slot === undefined) {
				idiomMap.set(key, { baseEntityId: base.id, subs: [sub] });
			} else {
				slot.subs.push(sub);
			}
		}
	}

	// Also walk INHERITS-in for each in-module class to catch
	// "abstract base in this module has many external subclasses" --
	// but those are cross-module TOO, so we'd have to broaden the
	// scan. Keep it to the direct-out view for V1.
	void inNeighbors; void inModuleIds;

	const idioms = Array.from(idiomMap.entries())
		.map(([baseName, slot]): ConventionBaseClassIdiom => {
			const reprs = slot.subs
				.slice(0, MAX_REPR_SUBCLASSES)
				.map(e => e.name);
			return {
				baseName,
				...(slot.baseEntityId !== undefined ? { baseEntityId: slot.baseEntityId } : {}),
				subclassCount:             slot.subs.length,
				representativeSubclasses:  reprs,
			};
		})
		.sort((a, b) => b.subclassCount - a.subclassCount)
		.slice(0, MAX_BASE_CLASS_IDIOMS);

	return idioms;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isDunder(name: string): boolean {
	return name.length >= 4 && name.startsWith('__') && name.endsWith('__');
}

function bump(rec: Record<string, number>, key: string): void {
	rec[key] = (rec[key] ?? 0) + 1;
}

// ---------------------------------------------------------------------------
// Test-only exports (mirrors concept-resolve pattern)
// ---------------------------------------------------------------------------

export const _classifyNameForTest      = classifyName;
export const _classifyTestFileForTest  = classifyTestFile;
export const _dominantForTest          = dominant;
