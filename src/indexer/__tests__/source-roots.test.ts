/**
 * Tests for source-roots.ts -- per-language source-root detection.
 * See plans/cross-file-references.md §2.
 */

import { describe, it, before, after } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { detectSourceRoots } from '../source-roots.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mkRepo(prefix: string): string {
	return mkdtempSync(join(tmpdir(), `insrc-srcroots-${prefix}-`));
}

function writeFile(repo: string, relPath: string, content = ''): void {
	const abs = join(repo, relPath);
	mkdirSync(join(abs, '..'), { recursive: true });
	writeFileSync(abs, content, 'utf8');
}

function ensureDir(repo: string, relPath: string): void {
	mkdirSync(join(repo, relPath), { recursive: true });
}

// ---------------------------------------------------------------------------
// Java -- Maven multi-module
// ---------------------------------------------------------------------------

describe('detectSourceRoots -- Java/Maven', () => {
	let repo: string;

	before(() => {
		repo = mkRepo('mvn');
		writeFile(repo, 'pom.xml', `
			<project>
				<modules>
					<module>core</module>
					<module>web</module>
				</modules>
			</project>
		`);
		writeFile(repo, 'core/pom.xml', `
			<project>
				<build>
					<sourceDirectory>src/main/java</sourceDirectory>
				</build>
			</project>
		`);
		ensureDir(repo, 'core/src/main/java');
		writeFile(repo, 'web/pom.xml', `<project></project>`);
		ensureDir(repo, 'web/src/main/java');
	});

	after(() => {
		try { rmSync(repo, { recursive: true, force: true }); } catch { /* ignore */ }
	});

	it('walks <modules> recursively + picks up each child source dir', () => {
		const roots = detectSourceRoots(repo);
		assert.equal(roots.java.length >= 2, true,
			`expected at least 2 java roots, got ${roots.java.length}: ${roots.java.join(', ')}`);
		assert.ok(roots.java.some(r => r.endsWith('core/src/main/java')),
			`expected core/src/main/java in: ${roots.java.join(', ')}`);
		assert.ok(roots.java.some(r => r.endsWith('web/src/main/java')),
			`expected web/src/main/java in: ${roots.java.join(', ')}`);
	});

	it('honours custom <sourceDirectory> when set', () => {
		const repo2 = mkRepo('mvn-custom');
		try {
			writeFile(repo2, 'pom.xml', `
				<project>
					<build>
						<sourceDirectory>my/custom/java</sourceDirectory>
					</build>
				</project>
			`);
			ensureDir(repo2, 'my/custom/java');
			const roots = detectSourceRoots(repo2);
			assert.ok(roots.java.some(r => r.endsWith('my/custom/java')),
				`expected my/custom/java in: ${roots.java.join(', ')}`);
		} finally {
			try { rmSync(repo2, { recursive: true, force: true }); } catch { /* ignore */ }
		}
	});
});

// ---------------------------------------------------------------------------
// Java -- Gradle Kotlin DSL with custom sourceSets
// ---------------------------------------------------------------------------

describe('detectSourceRoots -- Java/Gradle', () => {
	let repo: string;

	before(() => {
		repo = mkRepo('gradle');
		writeFile(repo, 'build.gradle.kts', `
			plugins { java }
			sourceSets {
				main {
					java {
						srcDirs("src/main/java", "src/generated/java")
					}
				}
			}
		`);
		ensureDir(repo, 'src/main/java');
		ensureDir(repo, 'src/generated/java');
	});

	after(() => {
		try { rmSync(repo, { recursive: true, force: true }); } catch { /* ignore */ }
	});

	it('picks up custom srcDirs from a Kotlin DSL build script', () => {
		const roots = detectSourceRoots(repo);
		assert.ok(roots.java.some(r => r.endsWith('src/main/java')));
		assert.ok(roots.java.some(r => r.endsWith('src/generated/java')),
			`expected src/generated/java; got: ${roots.java.join(', ')}`);
	});
});

// ---------------------------------------------------------------------------
// Scala -- SBT cross-build dirs
// ---------------------------------------------------------------------------

describe('detectSourceRoots -- Scala/SBT cross-build', () => {
	let repo: string;

	before(() => {
		repo = mkRepo('sbt-cross');
		writeFile(repo, 'build.sbt', `name := "demo"\nscalaVersion := "3.3.0"\n`);
		ensureDir(repo, 'src/main/scala');
		ensureDir(repo, 'src/main/scala-2.13');
		ensureDir(repo, 'src/main/scala-3');
	});

	after(() => {
		try { rmSync(repo, { recursive: true, force: true }); } catch { /* ignore */ }
	});

	it('includes scala-2.13 and scala-3 cross-build dirs alongside the base', () => {
		const roots = detectSourceRoots(repo);
		assert.ok(roots.scala.some(r => r.endsWith('src/main/scala')));
		assert.ok(roots.scala.some(r => r.endsWith('src/main/scala-2.13')),
			`expected scala-2.13; got: ${roots.scala.join(', ')}`);
		assert.ok(roots.scala.some(r => r.endsWith('src/main/scala-3')),
			`expected scala-3; got: ${roots.scala.join(', ')}`);
	});
});

// ---------------------------------------------------------------------------
// Python -- flat package + nested package
// ---------------------------------------------------------------------------

describe('detectSourceRoots -- Python flat + nested', () => {
	let repo: string;

	before(() => {
		repo = mkRepo('py-flat');
		writeFile(repo, 'mypkg/__init__.py');
		writeFile(repo, 'mypkg/sub/__init__.py');
	});

	after(() => {
		try { rmSync(repo, { recursive: true, force: true }); } catch { /* ignore */ }
	});

	it('reports the parent of the shallowest __init__.py as a source root', () => {
		const roots = detectSourceRoots(repo);
		// Parent of mypkg/__init__.py is repoRoot itself.
		assert.ok(roots.python.includes(repo),
			`expected repo root in: ${roots.python.join(', ')}`);
	});
});

describe('detectSourceRoots -- Python with src/ layout', () => {
	let repo: string;

	before(() => {
		repo = mkRepo('py-src');
		writeFile(repo, 'src/mypkg/__init__.py');
	});

	after(() => {
		try { rmSync(repo, { recursive: true, force: true }); } catch { /* ignore */ }
	});

	it('reports src/ as a source root for src-layout projects', () => {
		const roots = detectSourceRoots(repo);
		assert.ok(roots.python.some(r => r.endsWith('/src')),
			`expected <repo>/src in: ${roots.python.join(', ')}`);
	});
});

// ---------------------------------------------------------------------------
// Go -- go.mod module declaration
// ---------------------------------------------------------------------------

describe('detectSourceRoots -- Go', () => {
	let repo: string;

	before(() => {
		repo = mkRepo('go');
		writeFile(repo, 'go.mod', `module github.com/foo/bar\n\ngo 1.22\n`);
	});

	after(() => {
		try { rmSync(repo, { recursive: true, force: true }); } catch { /* ignore */ }
	});

	it('captures repoRoot + modulePath from go.mod', () => {
		const roots = detectSourceRoots(repo);
		assert.notEqual(roots.go, null);
		assert.equal(roots.go!.repoRoot, repo);
		assert.equal(roots.go!.modulePath, 'github.com/foo/bar');
	});

	it('returns null when no go.mod exists', () => {
		const empty = mkRepo('go-empty');
		try {
			const roots = detectSourceRoots(empty);
			assert.equal(roots.go, null);
		} finally {
			try { rmSync(empty, { recursive: true, force: true }); } catch { /* ignore */ }
		}
	});
});

// ---------------------------------------------------------------------------
// TypeScript -- baseUrl + paths
// ---------------------------------------------------------------------------

describe('detectSourceRoots -- TypeScript tsconfig', () => {
	let repo: string;

	before(() => {
		repo = mkRepo('tsc');
		writeFile(repo, 'tsconfig.json', JSON.stringify({
			compilerOptions: {
				baseUrl: './src',
				paths: { '@/*': ['./*'], 'lib/*': ['./lib/*'] },
			},
		}));
	});

	after(() => {
		try { rmSync(repo, { recursive: true, force: true }); } catch { /* ignore */ }
	});

	it('captures baseUrl and paths', () => {
		const roots = detectSourceRoots(repo);
		assert.notEqual(roots.typescript, null);
		assert.ok(roots.typescript!.baseUrl.endsWith('/src'),
			`expected baseUrl ending in /src; got: ${roots.typescript!.baseUrl}`);
		assert.deepEqual(roots.typescript!.paths.get('@/*'), ['./*']);
		assert.deepEqual(roots.typescript!.paths.get('lib/*'), ['./lib/*']);
	});

	it('handles JSON-with-comments tsconfig', () => {
		const repo2 = mkRepo('tsc-comments');
		try {
			writeFile(repo2, 'tsconfig.json', `// vibes
				{
					/* block comment */
					"compilerOptions": {
						"baseUrl": ".", // trailing comment
						"paths": { "@/*": ["./src/*"] }
					}
				}`);
			const roots = detectSourceRoots(repo2);
			assert.notEqual(roots.typescript, null);
			assert.deepEqual(roots.typescript!.paths.get('@/*'), ['./src/*']);
		} finally {
			try { rmSync(repo2, { recursive: true, force: true }); } catch { /* ignore */ }
		}
	});
});

// ---------------------------------------------------------------------------
// JavaScript -- jsconfig + fallback
// ---------------------------------------------------------------------------

describe('detectSourceRoots -- JavaScript jsconfig', () => {
	it('reads jsconfig.json when present', () => {
		const repo = mkRepo('jsconfig');
		try {
			writeFile(repo, 'jsconfig.json', JSON.stringify({
				compilerOptions: { baseUrl: '.', paths: { '#/*': ['./src/*'] } },
			}));
			const roots = detectSourceRoots(repo);
			assert.notEqual(roots.javascript, null);
			assert.deepEqual(roots.javascript!.paths.get('#/*'), ['./src/*']);
		} finally {
			try { rmSync(repo, { recursive: true, force: true }); } catch { /* ignore */ }
		}
	});

	it('falls back to tsconfig when no jsconfig exists', () => {
		const repo = mkRepo('js-fallback');
		try {
			writeFile(repo, 'tsconfig.json', JSON.stringify({
				compilerOptions: { baseUrl: './src' },
			}));
			const roots = detectSourceRoots(repo);
			assert.notEqual(roots.javascript, null);
			assert.ok(roots.javascript!.baseUrl.endsWith('/src'));
		} finally {
			try { rmSync(repo, { recursive: true, force: true }); } catch { /* ignore */ }
		}
	});
});

// ---------------------------------------------------------------------------
// No-manifest fallbacks
// ---------------------------------------------------------------------------

describe('detectSourceRoots -- no-manifest conventions', () => {
	let repo: string;

	before(() => {
		repo = mkRepo('conv');
		ensureDir(repo, 'src/main/java');
		ensureDir(repo, 'src/main/scala');
	});

	after(() => {
		try { rmSync(repo, { recursive: true, force: true }); } catch { /* ignore */ }
	});

	it('still finds src/main/java + src/main/scala without any manifest', () => {
		const roots = detectSourceRoots(repo);
		assert.ok(roots.java.some(r => r.endsWith('src/main/java')));
		assert.ok(roots.scala.some(r => r.endsWith('src/main/scala')));
	});

	it('Go / TS / JS slots are null when no go.mod / tsconfig / jsconfig exists', () => {
		const empty = mkRepo('empty');
		try {
			const roots = detectSourceRoots(empty);
			assert.equal(roots.go, null);
			assert.equal(roots.typescript, null);
			assert.equal(roots.javascript, null);
		} finally {
			try { rmSync(empty, { recursive: true, force: true }); } catch { /* ignore */ }
		}
	});
});
