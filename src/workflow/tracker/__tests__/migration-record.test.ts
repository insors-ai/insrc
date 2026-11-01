/**
 * The migration record (Story s9, task t22): it lists every row of the replacement table and every site s9 moved, each with a test that exists.
 * Run: npx tsx --test-force-exit src/workflow/tracker/__tests__/migration-record.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createRegistryTable, workflowToolDeps } from '../registry-table.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const RECORD = readFileSync(join(ROOT, 'docs', 'plans', 'tool-registry-migration-record.md'), 'utf8');
const AUDIT = RECORD.slice(RECORD.indexOf('## 5. The s9 audit'), RECORD.indexOf('## 6. The sites s9 moved'));
const MOVED = RECORD.slice(RECORD.indexOf('## 6. The sites s9 moved'));

const cells = (line: string): string[] => line.split('|').slice(1, -1).map(c => c.trim());

test('migration-record.test.ts: docs/plans/tool-registry-migration-record.md lists every table row and every moved site with its test', () => {
	// every row of the replacement table has a line in the record
	for (const row of Object.keys(createRegistryTable(workflowToolDeps('/tmp')))) assert.ok(RECORD.includes(`\`${row}\``), `the record has no row for ${row}`);

	// every file of the audit (section 5) is a row of section 6 with a test file that exists and is not the file itself
	const auditFiles = new Set<string>();
	for (const line of AUDIT.split('\n').filter(l => l.startsWith('| `src/'))) auditFiles.add(/`(src\/[^`]+\.ts)`/.exec(line)![1]!);
	const moved = new Map<string, string>();
	for (const line of MOVED.split('\n').filter(l => l.startsWith('| `src/'))) {
		const [site = '', , test = ''] = cells(line);
		moved.set(/`(src\/[^`]+\.ts)`/.exec(site)![1]!, /`(src\/[^`]+\.test\.ts)`/.exec(test)?.[1] ?? '');
	}
	assert.ok(auditFiles.size >= 18, 'the audit covers the 18 files of the replacement table');
	for (const file of auditFiles) {
		assert.ok(existsSync(join(ROOT, file)), `${file} named in the record does not exist`);
		const test = moved.get(file);
		assert.ok(test !== undefined && test !== '', `${file} has no test in section 6`);
		assert.ok(existsSync(join(ROOT, test)), `the test ${test} of ${file} does not exist`);
	}
	for (const file of moved.keys()) assert.ok(auditFiles.has(file), `${file} is in section 6 but not in the audit`);
});
