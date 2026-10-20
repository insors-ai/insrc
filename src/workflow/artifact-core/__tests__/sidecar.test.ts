import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { appendSidecarLine } from '../sidecar.js';

describe('appendSidecarLine', () => {
	it('appendSidecarLine appends one JSON line per call to the path it is given', () => {
		const dir = mkdtempSync(join(tmpdir(), 'sidecar-'));
		try {
			const path = join(dir, 'nested', 'a.log.jsonl');
			appendSidecarLine(path, { artifactId: 'LLD-0123456789abcdef-s2', entry: { id: 'e1' } });
			appendSidecarLine(path, { artifactId: 'LLD-0123456789abcdef-s2', entry: { id: 'e2', text: 'a\nb' } });
			const lines = readFileSync(path, 'utf8').split('\n');
			assert.equal(lines.length, 3);
			assert.equal(lines[2], '');
			assert.deepEqual(JSON.parse(lines[0] ?? ''), { artifactId: 'LLD-0123456789abcdef-s2', entry: { id: 'e1' } });
			assert.deepEqual(JSON.parse(lines[1] ?? ''), { artifactId: 'LLD-0123456789abcdef-s2', entry: { id: 'e2', text: 'a\nb' } });
		} finally { rmSync(dir, { recursive: true, force: true }); }
	});
});
