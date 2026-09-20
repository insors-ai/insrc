/**
 * Source-scan contract test for the inline `repo.stats` IPC handler (Story
 * add-new-repo-stats-daemon-ipc / S001). The daemon handler map is defined
 * inside main() and is not headlessly bootable, so — the config-catalog-contract
 * idiom — we assert the load-bearing wiring against the source text: the handler
 * is registered, delegates to collectRepoStats, returns {error} (not throw) for
 * an unregistered repoPath, is read-only, and RepoStats is declared.
 *
 * Run: npx tsx --test src/daemon/__tests__/repo-stats-handler-contract.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const INDEX = resolve(HERE, '..', 'index.ts');           // src/daemon/index.ts
const REPO_STATS = resolve(HERE, '..', 'repo-stats.ts'); // src/daemon/repo-stats.ts
const TYPES = resolve(HERE, '..', '..', 'shared', 'types.ts');

const indexSrc = readFileSync(INDEX, 'utf8');
const repoStatsSrc = readFileSync(REPO_STATS, 'utf8');
const typesSrc = readFileSync(TYPES, 'utf8');

/** Slice out the `'repo.stats': async (...) => { ... }` handler body. */
function handlerBody(): string {
	const start = indexSrc.indexOf("'repo.stats':");
	assert.ok(start >= 0, "no 'repo.stats' handler registered in the index.ts handler map");
	// Next handler key starts a new "'<name>':" at the handler-map indentation.
	const rest = indexSrc.slice(start + "'repo.stats':".length);
	const nextKey = rest.search(/\n\t\t'[a-zA-Z.]+':/);
	return nextKey >= 0 ? rest.slice(0, nextKey) : rest;
}

test("index.ts registers a 'repo.stats' handler that delegates to collectRepoStats", () => {
	assert.match(indexSrc, /'repo\.stats':\s*async/, "the handler is registered");
	assert.match(indexSrc, /import\s*\{\s*collectRepoStats\s*\}\s*from\s*'\.\/repo-stats\.js'/, "collectRepoStats is imported");
	const body = handlerBody();
	assert.match(body, /collectRepoStats\(/, "the handler delegates to collectRepoStats");
	assert.match(body, /params\.repoPath|const \{ repoPath \}/, "the handler reads params.repoPath");
});

test("the handler returns { error } (not throw) for an unregistered repoPath and returns the array when omitted", () => {
	const body = handlerBody();
	assert.match(body, /return\s*\{\s*error:|error:\s*`repo\.stats:/, "returns an {error} object, not a throw, for an unregistered repo");
	assert.doesNotMatch(body, /throw\s+new/, "the handler does not throw for the not-registered case");
	assert.match(body, /return all|return\s+all\b/, "returns the full RepoStats[] when repoPath is omitted");
});

test("the repo.stats handler is READ-ONLY (no mutation of store/registry/queue/config)", () => {
	const body = handlerBody();
	for (const forbidden of ['writeFileSync', 'setConfigAtPath', 'reloadChatConfig', '.enqueue(', 'addRepo(', 'removeRepo(', '.put(']) {
		assert.doesNotMatch(body, new RegExp(forbidden.replace(/[.()]/g, '\\$&')), `the handler must not call ${forbidden}`);
	}
});

test("collectRepoStats delegates to the pure buildRepoStats and RepoStats is declared", () => {
	assert.match(repoStatsSrc, /export function buildRepoStats\(/, "buildRepoStats is exported");
	assert.match(repoStatsSrc, /export function collectRepoStats\(/, "collectRepoStats is exported");
	assert.match(repoStatsSrc, /return buildRepoStats\(/, "collectRepoStats delegates all counting to buildRepoStats");
	assert.match(typesSrc, /export interface RepoStats \{/, "src/shared/types.ts declares the RepoStats interface");
});
