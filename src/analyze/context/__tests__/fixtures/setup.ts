/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Shared fixture builder for the analyze-shaper live tests.
 *
 * Builds every fixture the per-shaper live tests assert against:
 *   - tiny-multi-lang-repo: a 3-file TS/Py/Go repo (~80 LOC total)
 *   - seeded.sqlite:        3-table RDBMS with FK relations
 *   - seeded-csv-dir:       hive-partitioned CSV tree (region=us/eu,
 *                           date=*, schema divergence on one file)
 *   - seeded-manifests:     k8s + tf + GHA, multi-IaC-family
 *   - empty-repo:           git-init dir with only README
 *   - unindexed-repo:       git-init dir with source but NOT registered
 *
 * The "monorepo" fixture is the project's own `src/insrc` -- no
 * setup needed; live tests reference it via PATHS / absolute paths.
 *
 * All fixtures live under a single tmp root. Tests pass the tmp
 * root + a per-fixture name to `pathOf(root, 'tiny-multi-lang-repo')`
 * to address a fixture; `teardown(root)` removes the entire tree.
 *
 * Setup is deterministic + idempotent: re-running the builder on a
 * still-populated tmp root rebuilds in place.
 *
 * Run via test setup, not as a script:
 *   import { setupFixtures, teardownFixtures } from './fixtures/setup.js';
 */

import { execFileSync } from 'node:child_process';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface FixtureSet {
	/** Root tmp dir under which every fixture sits. */
	readonly root:                string;
	readonly tinyMultiLangRepo:   string;
	readonly seededSqlite:        string;
	readonly seededCsvDir:        string;
	readonly seededManifests:     string;
	readonly emptyRepo:           string;
	readonly unindexedRepo:       string;
}

/** Build every fixture under a freshly-allocated tmp root. */
export function setupFixtures(): FixtureSet {
	const root = mkdtempSync(join(tmpdir(), 'analyze-fixtures-'));
	return setupFixturesAt(root);
}

/** Build (or re-build) every fixture under a caller-supplied root. */
export function setupFixturesAt(root: string): FixtureSet {
	mkdirSync(root, { recursive: true });

	const tiny      = buildTinyMultiLangRepo(join(root, 'tiny-multi-lang-repo'));
	const sqlite    = buildSeededSqlite(join(root, 'seeded.sqlite'));
	const csvDir    = buildSeededCsvDir(join(root, 'seeded-csv-dir'));
	const manifests = buildSeededManifests(join(root, 'seeded-manifests'));
	const empty     = buildEmptyRepo(join(root, 'empty-repo'));
	const unindexed = buildUnindexedRepo(join(root, 'unindexed-repo'));

	return {
		root,
		tinyMultiLangRepo: tiny,
		seededSqlite:      sqlite,
		seededCsvDir:      csvDir,
		seededManifests:   manifests,
		emptyRepo:         empty,
		unindexedRepo:     unindexed,
	};
}

export function teardownFixtures(fixtures: FixtureSet): void {
	rmSync(fixtures.root, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// tiny-multi-lang-repo -- TS + Py + Go, ~80 LOC total
// ---------------------------------------------------------------------------

function buildTinyMultiLangRepo(dir: string): string {
	mkdirSync(dir, { recursive: true });

	// TypeScript: one exported function + one CLI command +
	// one HTTP route registration.
	writeFileSync(
		join(dir, 'index.ts'),
		[
			`/** Compute the user's display name from first + last. */`,
			`export function formatName(first: string, last: string): string {`,
			`	return \`\${first.trim()} \${last.trim()}\`.trim();`,
			`}`,
			``,
			`/** CLI command "greet" -- prints a greeting. */`,
			`export function greetCommand(args: { name?: string }): number {`,
			`	const name = args.name ?? 'world';`,
			`	console.log(\`Hello, \${name}!\`);`,
			`	return 0;`,
			`}`,
			``,
			`/** HTTP route GET /users -- returns the active user. */`,
			`export function registerUsersRoute(`,
			`	app: { get(path: string, handler: (req: unknown, res: unknown) => void): void },`,
			`): void {`,
			`	app.get('/users', (_req, res) => {`,
			`		const r = res as { json(o: unknown): void };`,
			`		r.json({ id: 1, name: formatName('Test', 'User') });`,
			`	});`,
			`}`,
		].join('\n'),
		'utf8',
	);

	// Python: one helper imported by a second function.
	writeFileSync(
		join(dir, 'compute.py'),
		[
			`def _normalize(text):`,
			`    return text.strip().lower()`,
			``,
			`def normalize_email(email):`,
			`    """Normalize an email address for comparison."""`,
			`    return _normalize(email)`,
			``,
			``,
			`def normalize_name(first, last):`,
			`    """Normalize a full name."""`,
			`    return f"{_normalize(first)} {_normalize(last)}".strip()`,
			``,
		].join('\n'),
		'utf8',
	);

	// Go: a single exported type with two methods.
	writeFileSync(
		join(dir, 'user.go'),
		[
			`package main`,
			``,
			`// User is the public-facing user model.`,
			`type User struct {`,
			`	ID    int64`,
			`	Email string`,
			`	Name  string`,
			`}`,
			``,
			`// DisplayName returns the user's display name.`,
			`func (u *User) DisplayName() string {`,
			`	if u.Name != "" {`,
			`		return u.Name`,
			`	}`,
			`	return u.Email`,
			`}`,
			``,
			`// IsActive reports whether the user account is active.`,
			`func (u *User) IsActive() bool {`,
			`	return u.ID > 0`,
			`}`,
			``,
		].join('\n'),
		'utf8',
	);

	// README for completeness; lets workspace scopers detect a "real" repo.
	writeFileSync(
		join(dir, 'README.md'),
		`# tiny-multi-lang-repo\n\nFixture for analyze-shaper live tests.\n`,
		'utf8',
	);

	return dir;
}

// ---------------------------------------------------------------------------
// seeded.sqlite -- users / orders / order_items with FK
// ---------------------------------------------------------------------------

function buildSeededSqlite(path: string): string {
	// Use the system `sqlite3` CLI instead of the better-sqlite3 native
	// binding. Two reasons:
	//   1. better-sqlite3's prebuilt binary is pinned (via .npmrc) to
	//      the daemon's deployment Node version (currently 22). Local
	//      test runs on a different Node version hit NODE_MODULE_VERSION
	//      mismatch (ERR_DLOPEN_FAILED).
	//   2. The fixture is a one-shot write -- a subprocess is fast
	//      enough and skips the ABI-pin problem entirely.
	//
	// sqlite3 is preinstalled on macOS and most Linux distros. The
	// fixture builder is test-time only; if a CI host doesn't have
	// sqlite3, install it (or skip the live tests that need it).

	// Idempotency: remove a prior file before seeding.
	if (existsSync(path)) {
		rmSync(path);
	}

	const sql = [
		`CREATE TABLE users (`,
		`	id    INTEGER PRIMARY KEY AUTOINCREMENT,`,
		`	email TEXT    NOT NULL UNIQUE,`,
		`	name  TEXT    NOT NULL`,
		`);`,
		`CREATE TABLE orders (`,
		`	id      INTEGER PRIMARY KEY AUTOINCREMENT,`,
		`	user_id INTEGER NOT NULL REFERENCES users(id),`,
		`	total   NUMERIC NOT NULL DEFAULT 0`,
		`);`,
		`CREATE TABLE order_items (`,
		`	order_id INTEGER NOT NULL REFERENCES orders(id),`,
		`	product  TEXT    NOT NULL,`,
		`	qty      INTEGER NOT NULL DEFAULT 1,`,
		`	PRIMARY KEY (order_id, product)`,
		`);`,
		`INSERT INTO users (email, name) VALUES ('alice@example.com', 'Alice');`,
		`INSERT INTO users (email, name) VALUES ('bob@example.com',   'Bob');`,
		// Carol has no orders -- exercises "user with no FK children".
		`INSERT INTO users (email, name) VALUES ('carol@example.com', 'Carol');`,
		`INSERT INTO orders (user_id, total) VALUES (1, 49.99);`,
		`INSERT INTO orders (user_id, total) VALUES (1, 19.50);`,
		`INSERT INTO orders (user_id, total) VALUES (2, 99.00);`,
		`INSERT INTO order_items (order_id, product, qty) VALUES (1, 'widget',  2);`,
		`INSERT INTO order_items (order_id, product, qty) VALUES (1, 'gadget',  1);`,
		`INSERT INTO order_items (order_id, product, qty) VALUES (2, 'widget',  1);`,
		`INSERT INTO order_items (order_id, product, qty) VALUES (3, 'sprocket', 3);`,
	].join('\n');

	try {
		execFileSync('sqlite3', [path], { input: sql, stdio: ['pipe', 'ignore', 'pipe'] });
	} catch (err) {
		throw new Error(
			'fixture setup: failed to invoke sqlite3 CLI. Install it (e.g. brew install sqlite, ' +
				`apt-get install sqlite3) or skip live tests that depend on seeded.sqlite. ` +
				`Underlying: ${(err as Error).message}`,
		);
	}
	return path;
}

// ---------------------------------------------------------------------------
// seeded-csv-dir -- hive-partitioned tree with one divergent shape
// ---------------------------------------------------------------------------

function buildSeededCsvDir(dir: string): string {
	mkdirSync(dir, { recursive: true });

	const consistentHeader = 'order_id,product,qty,total\n';
	const consistentRows = (offset: number): string => [
		`${offset + 1},widget,2,49.99`,
		`${offset + 2},gadget,1,19.50`,
		`${offset + 3},sprocket,3,99.00`,
		``,
	].join('\n');

	// Hive-partitioned: region={us,eu} × date={2026-06-01, 2026-06-02}
	const partitions: ReadonlyArray<readonly [string, string]> = [
		['us', '2026-06-01'],
		['us', '2026-06-02'],
		['eu', '2026-06-01'],
		['eu', '2026-06-02'],
		['eu', '2026-06-03'],
	];

	let offset = 0;
	for (const [region, date] of partitions) {
		const p = join(dir, `region=${region}`, `date=${date}`);
		mkdirSync(p, { recursive: true });
		writeFileSync(
			join(p, 'orders.csv'),
			consistentHeader + consistentRows(offset),
			'utf8',
		);
		offset += 10;
	}

	// One file with a divergent schema -- extra column, missing total.
	const divergentDir = join(dir, 'region=us', 'date=2026-06-03');
	mkdirSync(divergentDir, { recursive: true });
	writeFileSync(
		join(divergentDir, 'orders.csv'),
		[
			'order_id,product,qty,note',
			`${offset + 1},widget,2,backorder`,
			`${offset + 2},gadget,1,gift`,
			``,
		].join('\n'),
		'utf8',
	);

	return dir;
}

// ---------------------------------------------------------------------------
// seeded-manifests -- k8s + tf + GitHub Actions
// ---------------------------------------------------------------------------

function buildSeededManifests(dir: string): string {
	mkdirSync(dir, { recursive: true });

	// --- Kubernetes -----------------------------------------------------
	const k8sDir = join(dir, 'k8s');
	mkdirSync(k8sDir, { recursive: true });

	for (const svc of ['api', 'worker', 'web']) {
		writeFileSync(
			join(k8sDir, `${svc}-deployment.yaml`),
			[
				`apiVersion: apps/v1`,
				`kind: Deployment`,
				`metadata:`,
				`  name: ${svc}`,
				`  namespace: prod`,
				`spec:`,
				`  replicas: 3`,
				`  selector:`,
				`    matchLabels:`,
				`      app: ${svc}`,
				`  template:`,
				`    metadata:`,
				`      labels:`,
				`        app: ${svc}`,
				`    spec:`,
				`      containers:`,
				`        - name: ${svc}`,
				`          image: registry.example/${svc}:v1`,
				``,
			].join('\n'),
			'utf8',
		);
	}

	for (const svc of ['api', 'web']) {
		writeFileSync(
			join(k8sDir, `${svc}-service.yaml`),
			[
				`apiVersion: v1`,
				`kind: Service`,
				`metadata:`,
				`  name: ${svc}`,
				`  namespace: prod`,
				`spec:`,
				`  selector:`,
				`    app: ${svc}`,
				`  ports:`,
				`    - port: 80`,
				`      targetPort: 8080`,
				``,
			].join('\n'),
			'utf8',
		);
	}

	writeFileSync(
		join(k8sDir, 'config.yaml'),
		[
			`apiVersion: v1`,
			`kind: ConfigMap`,
			`metadata:`,
			`  name: app-config`,
			`  namespace: prod`,
			`data:`,
			`  LOG_LEVEL: info`,
			`  FEATURE_X: 'true'`,
			``,
		].join('\n'),
		'utf8',
	);

	// --- Terraform ------------------------------------------------------
	const tfDir = join(dir, 'tf');
	mkdirSync(tfDir, { recursive: true });

	writeFileSync(
		join(tfDir, 'main.tf'),
		[
			`terraform {`,
			`  required_providers {`,
			`    aws = { source = "hashicorp/aws", version = "~> 5.0" }`,
			`  }`,
			`}`,
			``,
			`provider "aws" {`,
			`  region = var.region`,
			`}`,
			``,
			`resource "aws_s3_bucket" "logs" {`,
			`  bucket = var.bucket_name`,
			`}`,
			``,
			`resource "aws_iam_role" "app" {`,
			`  name               = "app-role"`,
			`  assume_role_policy = data.aws_iam_policy_document.assume.json`,
			`}`,
			``,
			`data "aws_iam_policy_document" "assume" {`,
			`  statement {`,
			`    actions = ["sts:AssumeRole"]`,
			`    principals { type = "Service"; identifiers = ["lambda.amazonaws.com"] }`,
			`  }`,
			`}`,
			``,
		].join('\n'),
		'utf8',
	);

	writeFileSync(
		join(tfDir, 'variables.tf'),
		[
			`variable "region"      { type = string; default = "us-east-1" }`,
			`variable "bucket_name" { type = string }`,
			``,
		].join('\n'),
		'utf8',
	);

	// --- GitHub Actions -------------------------------------------------
	const ghaDir = join(dir, '.github', 'workflows');
	mkdirSync(ghaDir, { recursive: true });

	writeFileSync(
		join(ghaDir, 'ci.yml'),
		[
			`name: CI`,
			`on:`,
			`  push:`,
			`    branches: [main]`,
			`  pull_request:`,
			`    branches: [main]`,
			`jobs:`,
			`  test:`,
			`    runs-on: ubuntu-latest`,
			`    steps:`,
			`      - uses: actions/checkout@v4`,
			`      - uses: actions/setup-node@v4`,
			`        with: { node-version: '20' }`,
			`      - run: npm install`,
			`      - run: npm test`,
			``,
		].join('\n'),
		'utf8',
	);

	return dir;
}

// ---------------------------------------------------------------------------
// empty-repo -- a workspace with no source code
// ---------------------------------------------------------------------------

function buildEmptyRepo(dir: string): string {
	mkdirSync(dir, { recursive: true });
	// .git directory -- empty body but presence signals "this is a repo"
	// to any walker that looks for it. Tests do not run git commands
	// against it.
	mkdirSync(join(dir, '.git'), { recursive: true });
	writeFileSync(
		join(dir, 'README.md'),
		`# empty-repo\n\nNo source. Used to test empty-closure handling.\n`,
		'utf8',
	);
	return dir;
}

// ---------------------------------------------------------------------------
// unindexed-repo -- real source, not registered with the indexer
// ---------------------------------------------------------------------------

function buildUnindexedRepo(dir: string): string {
	mkdirSync(dir, { recursive: true });
	mkdirSync(join(dir, '.git'), { recursive: true });
	writeFileSync(
		join(dir, 'README.md'),
		`# unindexed-repo\n\nReal source; not registered. Tests the auto-reindex path.\n`,
		'utf8',
	);
	writeFileSync(
		join(dir, 'main.ts'),
		[
			`export function unindexedFunction(): string {`,
			`	return 'unindexed';`,
			`}`,
			``,
		].join('\n'),
		'utf8',
	);
	return dir;
}
