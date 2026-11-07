/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { readWorkflowGuide } from '../../../../daemon/guide-sections.js';
import { CODE_REVIEW_INPUT } from '../../../../mcp/code-review/schema.js';
import { parsePacket } from '../contracts.js';
import { DOCUMENT_ROLES } from '../route.js';

const oid = 'a'.repeat(40);
const doc = (path: string) => ({ path, commit: oid });
const packet = (documents: Record<string, unknown>) => ({
	reviewRevision: 'b'.repeat(40), storyId: 's1', functionalSummary: 'Change behaviour', documents,
	reviewSet: [{ commit: 'b'.repeat(40), parent: oid, files: [{ path: 'src/a.ts', segments: [{ after: [1, 1] }] }] }], tests: [],
});
const advertised = z.object(CODE_REVIEW_INPUT);
const request = (documents: Record<string, unknown>) => ({ phase: 'start', epicHash: '1234567890abcdef', reviewId: 'review-1', attempt: 1, packet: packet(documents) });

test('src/workflow/code-review/task-review/__tests__/documents-contract.test.ts: the advertised packet schema accepts the four optional roles and matches the stored schema', () => {
	for (let mask = 0; mask < 1 << DOCUMENT_ROLES.length; mask++) {
		const documents = Object.fromEntries(DOCUMENT_ROLES.filter((_, i) => mask & (1 << i)).map(role => [role, doc(`${role}.json`)]));
		const stored = (() => { try { parsePacket(packet(documents)); return true; } catch { return false; } })();
		assert.equal(advertised.safeParse(request(documents)).success, stored, `subset ${JSON.stringify(Object.keys(documents))}: advertised and stored schemas agree`);
		assert.equal(stored, true);
	}
	const extra = { ...Object.fromEntries(DOCUMENT_ROLES.map(role => [role, doc(`${role}.json`)])), design: doc('design.json') };
	assert.equal(advertised.safeParse(request(extra)).success, false, 'a fifth key is refused by the advertised schema');
	assert.throws(() => parsePacket(packet(extra)), 'and by the stored schema');
});

test('src/workflow/code-review/task-review/__tests__/documents-contract.test.ts: the guide text states the documents per route', () => {
	const steering = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../../../prompts/steering-block.md'), 'utf8');
	const section = readWorkflowGuide(steering, 'code-review');
	assert.ok(section !== null);
	const g = section.replace(/\s+/g, ' ');
	assert.doesNotMatch(g, /Include pinned Story\/LLD\/Plan/, 'the guide no longer says every packet pins a Story, an LLD and a Plan');
	assert.match(g, /Pin exactly the documents the Story's route produced/);
	assert.match(g, /a Story with a Plan pins its `lld` and `plan`/);
	assert.match(g, /a Story with only an LLD pins that `lld`/);
	assert.match(g, /a bugfix with only an ISSUE pins that `issue`/);
	assert.match(g, /a trivial change pins none/);
});
