/**
 * Story E20261015067b05b6:S001 — the steering text tells the controller to declare, with
 * insrc_present, the documents it asks the user to review, before it asks for approval.
 *
 * Run: npx tsx --test src/mcp/__tests__/present-steering.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { readWorkflowGuide } from '../../daemon/guide-sections.js';
import { readSteeringBlock, stripGuideSections } from '../../daemon/steering-inject.js';

const HERE = dirname(fileURLToPath(import.meta.url));
/** One line, single spaces: the texts are hard-wrapped, the claims are not. */
const flat = (s: string): string => s.replace(/\s+/g, ' ');

test('the steering block, the steering template and the guide tell the controller to call insrc_present before it asks for approval', () => {
	const block = flat(readSteeringBlock());

	// The approval discipline: declare first, then present and ask; the path goes in the message too.
	const discipline = block.slice(block.indexOf('### Approval discipline'));
	const declare = discipline.indexOf('insrc_present({ documents: [...] })');
	assert.ok(declare > 0, 'the approval discipline names the call');
	assert.ok(declare < discipline.indexOf('PRESENT a concise summary'), 'declare comes before presenting and asking');
	assert.ok(declare < discipline.indexOf('insrc_workflow_approve'), 'and before the approval');
	assert.match(discipline, /give the document's path in your message too/);
	assert.match(discipline, /does not work out what to open from tool output/);
	assert.match(discipline, /`notPending`/);

	// The note that steering-only enforcement may need to be revisited.
	assert.match(discipline, /steering-only for now/);
	assert.match(discipline, /if that proves unreliable, revisit it \(a reminder from the daemon in tool responses, or detection of a missing call\)/);

	// The guide sections that end in an approval carry it too.
	const review = flat(readWorkflowGuide(readSteeringBlock(), 'review') ?? '');
	assert.match(review, /declare the document with `insrc_present`, present-ask-approve/);
	const build = flat(readWorkflowGuide(readSteeringBlock(), 'build') ?? '');
	assert.match(build, /DECLARE the BUILD record and the code review with `insrc_present`/);

	// The injected skeleton keeps the discipline (it is not inside a guide section) and the catalog row.
	const skeleton = flat(stripGuideSections(readSteeringBlock()));
	assert.match(skeleton, /first DECLARE what you are about to show/);
	assert.match(skeleton, /\| `insrc_present` \|/);

	// The steering template only points at the block: it carries no approval text to contradict it.
	const template = flat(readFileSync(join(HERE, '../steering-template.md'), 'utf8'));
	assert.ok(!/pendingApproval|artifactPath/.test(template), 'the template holds no approval text of its own');
});
