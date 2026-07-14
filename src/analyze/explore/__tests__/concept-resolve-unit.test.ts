/**
 * plans/exploration-based-context-build.md Phase 1. Unit tests for
 * concept.resolve's tokenisation + scoring internals. These tests
 * do NOT require an LMDB fixture -- they exercise the pure helper
 * functions directly.
 *
 * The critical assertion is Test 3 from the live-test session:
 * "payable extraction module" should score `insors/extraction/payable/`
 * higher than `insors/core/model/invoice/payable.py`. That's the
 * bug F8 fix.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	_scoreCandidateForTest,
	_splitIdentifierForTest,
	_tokeniseForTest,
} from '../concept-resolve.js';

// ---------------------------------------------------------------------------
// tokenise
// ---------------------------------------------------------------------------

test('tokenise drops stopwords + short tokens', () => {
	assert.deepEqual(_tokeniseForTest('what is the classifier module'), ['classifier', 'module']);
});

test('tokenise lowercases + splits on non-alphanumeric', () => {
	assert.deepEqual(_tokeniseForTest('Map the Payable-Extraction Module'), ['map', 'payable', 'extraction', 'module']);
});

test('tokenise handles snake_case + dot-separated', () => {
	assert.deepEqual(
		_tokeniseForTest('extract insors.extraction.payable module'),
		['extract', 'insors', 'extraction', 'payable', 'module'],
	);
});

test('tokenise drops framework-generic jargon', () => {
	// 'framework' + 'system' are dropped as framework jargon
	assert.deepEqual(_tokeniseForTest('the payable framework system'), ['payable']);
});

// ---------------------------------------------------------------------------
// splitIdentifier
// ---------------------------------------------------------------------------

test('splitIdentifier handles snake_case', () => {
	assert.deepEqual(_splitIdentifierForTest('payable_extraction_module'), ['payable', 'extraction', 'module']);
});

test('splitIdentifier handles camelCase', () => {
	assert.deepEqual(_splitIdentifierForTest('PayableExtractionModule'), ['payable', 'extraction', 'module']);
});

test('splitIdentifier handles kebab-case', () => {
	assert.deepEqual(_splitIdentifierForTest('payable-extraction-module'), ['payable', 'extraction', 'module']);
});

test('splitIdentifier splits letter/digit boundary + drops single-char tokens', () => {
	// The implementation forces a letter/digit split THEN drops any
	// token with length < 2. 'v', '2' individually don't survive.
	assert.deepEqual(_splitIdentifierForTest('v2Endpoint'), ['endpoint']);
	// httpV2Router -> http, V, 2, Router -> http, router (single-char dropped)
	assert.deepEqual(_splitIdentifierForTest('httpV2Router'), ['http', 'router']);
});

test('splitIdentifier handles filename with extension', () => {
	assert.deepEqual(_splitIdentifierForTest('payable_matching_rules.py'), ['payable', 'matching', 'rules', 'py']);
});

// ---------------------------------------------------------------------------
// scoreCandidate -- the load-bearing bit for Test 3 fix
// ---------------------------------------------------------------------------

const REPO = '/repo/insors-extraction';

test('directory match beats file match on same token count (Test 3 case)', () => {
	const tokens = _tokeniseForTest('payable extraction module');
	// The core failure mode from live Test 3: LLM went to
	// insors/core/model/invoice/payable.py (1 path token match)
	// instead of insors/extraction/payable/ (2 path token match).
	const dirHit = _scoreCandidateForTest(
		{ kind: 'dir', path: `${REPO}/insors/extraction/payable`, name: 'payable' },
		tokens, REPO, /* structuralBoost */ true,
	);
	const fileHit = _scoreCandidateForTest(
		{ kind: 'file', path: `${REPO}/insors/core/model/invoice/payable.py`, name: 'payable.py' },
		tokens, REPO, true,
	);
	assert.ok(dirHit !== null && fileHit !== null);
	assert.ok(
		dirHit.score > fileHit.score,
		`dir score ${dirHit.score} should beat file score ${fileHit.score}`,
	);
});

test('depth does NOT enter the score (docs shallow, code deep is a bad prior)', () => {
	// Path depth is observed via `diagnostics.pathDepth` but no longer
	// weighted into the score. A design-doc-shaped shallow path and a
	// module-shaped deep path with the same token+density profile MUST
	// score identically -- rewarding shallow paths systematically taxes
	// code retrieval in real codebases where docs cluster near the root.
	// See W_PATH_TOKENS block for the rationale + removed W_DEPTH constant.
	const tokens = _tokeniseForTest('payable module');
	const shallow = _scoreCandidateForTest(
		{ kind: 'dir', path: `${REPO}/payable`, name: 'payable' },
		tokens, REPO, true,
	);
	const deep = _scoreCandidateForTest(
		{ kind: 'dir', path: `${REPO}/a/b/c/d/e/payable`, name: 'payable' },
		tokens, REPO, true,
	);
	assert.ok(shallow !== null && deep !== null);
	assert.equal(
		shallow.score, deep.score,
		`depth should not affect the score any more (shallow=${shallow.score}, deep=${deep.score})`,
	);
	// pathDepth stays observable in diagnostics for callers that want it.
	assert.equal(shallow.diagnostics.pathDepth, 1);
	assert.equal(deep.diagnostics.pathDepth, 6);
});

test('zero token hits returns null (dropped)', () => {
	const tokens = _tokeniseForTest('quantum encryption module');
	const noHit = _scoreCandidateForTest(
		{ kind: 'dir', path: `${REPO}/insors/extraction/payable`, name: 'payable' },
		tokens, REPO, true,
	);
	assert.equal(noHit, null);
});

test('structural boost lifts dir scores over the same non-boosted case', () => {
	// Same tokens, same candidate. Only the boost flag changes.
	const tokens = _tokeniseForTest('payable module');
	const dirCand = { kind: 'dir' as const, path: `${REPO}/insors/payable`, name: 'payable' };
	const withBoost    = _scoreCandidateForTest(dirCand, tokens, REPO, /* structural */ true);
	const withoutBoost = _scoreCandidateForTest(dirCand, tokens, REPO, /* structural */ false);
	assert.ok(withBoost !== null && withoutBoost !== null);
	assert.ok(withBoost.score > withoutBoost.score,
		`with boost ${withBoost.score} should beat without boost ${withoutBoost.score}`);
});

test('score is bounded to [0, 1]', () => {
	const tokens = _tokeniseForTest('payable payable payable payable');
	const hit = _scoreCandidateForTest(
		{ kind: 'dir', path: `${REPO}/payable`, name: 'payable' },
		tokens, REPO, true,
	);
	assert.ok(hit !== null);
	assert.ok(hit.score >= 0 && hit.score <= 1);
});

test('name-token match contributes to score', () => {
	const tokens = _tokeniseForTest('validator');
	const pathOnlyMatch = _scoreCandidateForTest(
		{ kind: 'file', path: `${REPO}/pkg/validator.py`, name: 'other.py' },
		tokens, REPO, false,
	);
	const nameOnlyMatch = _scoreCandidateForTest(
		{ kind: 'file', path: `${REPO}/pkg/other.py`, name: 'validator.py' },
		tokens, REPO, false,
	);
	assert.ok(pathOnlyMatch !== null && nameOnlyMatch !== null);
	// Both should score above 0; both should be non-null.
	assert.ok(pathOnlyMatch.score > 0);
	assert.ok(nameOnlyMatch.score > 0);
});

// ---------------------------------------------------------------------------
// Entity-density signal (Test A on insors-extraction: docs/extraction/payable
// tied insors/extraction/payable on tokens; entity-density is the breaker)
// ---------------------------------------------------------------------------

test('code dir with real entities beats docs dir with zero entities on same tokens', () => {
	const tokens = _tokeniseForTest('payable extraction');
	// docs/extraction/payable/ -- same tokens but ZERO code entities
	const docsHit = _scoreCandidateForTest(
		{ kind: 'dir', path: `${REPO}/docs/extraction/payable`, name: 'payable', entityCount: 0 },
		tokens, REPO, true,
	);
	// insors/extraction/payable/ -- same tokens but MANY code entities
	const codeHit = _scoreCandidateForTest(
		{ kind: 'dir', path: `${REPO}/insors/extraction/payable`, name: 'payable', entityCount: 300 },
		tokens, REPO, true,
	);
	assert.ok(docsHit !== null && codeHit !== null);
	assert.ok(
		codeHit.score > docsHit.score,
		`code dir score ${codeHit.score} should beat docs dir ${docsHit.score}`,
	);
});

test('entity density buckets are monotonic', () => {
	const tokens = _tokeniseForTest('payable');
	const cand = (n: number) => _scoreCandidateForTest(
		{ kind: 'dir', path: `${REPO}/payable`, name: 'payable', entityCount: n },
		tokens, REPO, true,
	);
	const zero  = cand(0);
	const few   = cand(5);
	const many  = cand(20);
	const lots  = cand(100);
	const huge  = cand(500);
	assert.ok(zero !== null && few !== null && many !== null && lots !== null && huge !== null);
	assert.ok(zero.score <= few.score);
	assert.ok(few.score  <= many.score);
	assert.ok(many.score <= lots.score);
	assert.ok(lots.score <= huge.score);
});

// ---------------------------------------------------------------------------
// Prefix matching (classifier -> classification, extract -> extraction, ...)
// ---------------------------------------------------------------------------

test('classifier query matches classification/ via prefix (shared 8 chars)', () => {
	const tokens = _tokeniseForTest('classifier');
	const hit = _scoreCandidateForTest(
		{ kind: 'dir', path: `${REPO}/insors/classification`, name: 'classification', entityCount: 100 },
		tokens, REPO, true,
	);
	assert.ok(hit !== null);
	assert.ok(hit.score > 0, 'classifier should hit classification via prefix');
});

test('extract query matches extraction/ via prefix', () => {
	const tokens = _tokeniseForTest('extract');
	const hit = _scoreCandidateForTest(
		{ kind: 'dir', path: `${REPO}/insors/extraction`, name: 'extraction', entityCount: 500 },
		tokens, REPO, true,
	);
	assert.ok(hit !== null);
	assert.ok(hit.score > 0);
});

test('exact match still beats prefix match at same density', () => {
	const tokens = _tokeniseForTest('classification');
	const exactHit = _scoreCandidateForTest(
		{ kind: 'dir', path: `${REPO}/classification`, name: 'classification', entityCount: 100 },
		tokens, REPO, true,
	);
	const prefixHit = _scoreCandidateForTest(
		{ kind: 'dir', path: `${REPO}/classifier`, name: 'classifier', entityCount: 100 },
		tokens, REPO, true,
	);
	assert.ok(exactHit !== null && prefixHit !== null);
	assert.ok(exactHit.score > prefixHit.score);
});

// ---------------------------------------------------------------------------
// Test-path demotion (Test D on insors-extraction: `document classifier
// module` resolved to a test file even after prefix match landed)
// ---------------------------------------------------------------------------

test('test file with exact matches loses to real module with prefix match', () => {
	const tokens = _tokeniseForTest('document classifier module');
	// Test file with EXACT name matches for `document` + `classifier`.
	// Path is under test/ so gets the demotion.
	const testFile = _scoreCandidateForTest(
		{
			kind: 'file',
			path: `${REPO}/test/extraction/preprocessing/test_document_classifier_integration.py`,
			name: 'test_document_classifier_integration.py',
			entityCount: 11,
		},
		tokens, REPO, true,
	);
	// Real module with prefix match on `classifier`.
	const realModule = _scoreCandidateForTest(
		{
			kind: 'dir',
			path: `${REPO}/insors/classification`,
			name: 'classification',
			entityCount: 100,
		},
		tokens, REPO, true,
	);
	assert.ok(testFile !== null && realModule !== null);
	assert.ok(
		realModule.score > testFile.score,
		`real module ${realModule.score} should beat test file ${testFile.score}`,
	);
});

test('test path regex matches common test directory conventions', () => {
	const tokens = _tokeniseForTest('classifier module');
	const testDir = _scoreCandidateForTest(
		{ kind: 'dir', path: `${REPO}/tests/classifier`, name: 'classifier', entityCount: 5 },
		tokens, REPO, true,
	);
	const realDir = _scoreCandidateForTest(
		{ kind: 'dir', path: `${REPO}/insors/classifier`, name: 'classifier', entityCount: 100 },
		tokens, REPO, true,
	);
	assert.ok(testDir !== null && realDir !== null);
	assert.ok(realDir.score > testDir.score);
});

test('test path penalty fires WITHOUT structuralBoost too (regression: executor-placeholders.test.ts beat executor.ts)', () => {
	// Query does NOT contain a STRUCTURAL_TOKEN ("module" / "package"
	// / ...), so `structuralBoost` is false. Under the old design the
	// TEST_PATH_PENALTY was gated on structuralBoost and never fired,
	// letting test files beat real source. Now the penalty is
	// unconditional -- the real source MUST rank above the test file
	// even without a structural keyword in the query.
	const tokens = _tokeniseForTest('exploration executor placeholder');
	const testFile = _scoreCandidateForTest(
		{
			kind: 'file',
			path: `${REPO}/src/analyze/__tests__/executor-placeholders.test.ts`,
			name: 'executor-placeholders.test.ts',
			entityCount: 2,
		},
		tokens, REPO, /* structuralBoost */ false,
	);
	const source = _scoreCandidateForTest(
		{
			kind: 'file',
			path: `${REPO}/src/analyze/executor.ts`,
			name: 'executor.ts',
			entityCount: 20,
		},
		tokens, REPO, /* structuralBoost */ false,
	);
	assert.ok(testFile !== null && source !== null);
	assert.ok(
		source.score > testFile.score,
		`source ${source.score} should beat test file ${testFile.score} even without structuralBoost`,
	);
});

test('short query token (<7 chars) does NOT prefix-match (no false hit)', () => {
	// 'class' is < 7 chars; must not match `classroom` via prefix
	const tokens = _tokeniseForTest('class');
	const hit = _scoreCandidateForTest(
		{ kind: 'dir', path: `${REPO}/classroom`, name: 'classroom', entityCount: 50 },
		tokens, REPO, false,
	);
	// class -> classroom would only work if we allowed <7 char
	// prefix matches. We don't, so this hit should be a straight
	// exact miss.
	// But wait: `class` is only 5 chars, drops below tokenise's
	// STOPWORD/length filter? Let me check: length >= 2 is the only
	// filter, so 'class' survives. Then it exact-matches nothing in
	// classroom's tokens (`classroom`). Prefix matching bails
	// because len<7. So hit is null (no path token, no name token).
	assert.equal(hit, null);
});
