import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { buildTemplateReviewPrompt, reviewTemplateFor, validateTemplateAnswer } from '../template.js';
import { computeVerdict, DEFAULT_BLOCK_ON } from '../verdict.js';
import { readWorkflowGuide } from '../../../daemon/guide-sections.js';
import { ER_CONTENT_GATE_RULE } from '../../artifacts/companion/er-schema.js';
import { UX_CONTENT_GATE_RULE } from '../../artifacts/companion/ux-schema.js';
import { SEQUENCE_CONTENT_GATE_RULE } from '../../artifacts/companion/sequence-schema.js';
import { COMPONENT_CONTENT_GATE_RULE } from '../../artifacts/companion/component-schema.js';

const read = (path: string): string => readFileSync(new URL('../../../' + path, import.meta.url), 'utf8');
const steering = read('prompts/steering-block.md');
const source = (path: string): string => readFileSync(new URL('../../../../' + path, import.meta.url), 'utf8');
const flat = (s: string): string => s.replace(/\s+/g, ' ');

test('author and builder guidance selects relevant visuals without a blanket ERD rule', () => {
 assert.match(flat(steering), /docgen describes existing code, not a future model/);
 for (const key of ['design.epic', 'design.story', 'build']) {
  const guide = readWorkflowGuide(steering, key);
  assert.ok(guide);
  assert.match(flat(guide), /document relationship changes even when simple/);
  assert.match(flat(guide), /do not require an ERD for isolated class edits/);
 }
 for (const path of ['src/workflow/runners/design-epic/index.ts', 'src/workflow/runners/design-story/index.ts', 'src/workflow/orchestrator.ts']) {
  const consumer = source(path);
  for (const name of ['ER_CONTENT_GATE_RULE', 'UX_CONTENT_GATE_RULE', 'SEQUENCE_CONTENT_GATE_RULE', 'COMPONENT_CONTENT_GATE_RULE']) assert.ok(consumer.split(name).length >= 3, path + ': ' + name + ' imported and consumed');
 }
 assert.match(ER_CONTENT_GATE_RULE, /clear prose\/table can suffice/);
 assert.match(UX_CONTENT_GATE_RULE, /no user-facing impact/);
 assert.match(SEQUENCE_CONTENT_GATE_RULE, /ordering across participants/);
 assert.match(COMPONENT_CONTENT_GATE_RULE, /ownership boundaries/);
 for (const rule of [ER_CONTENT_GATE_RULE, UX_CONTENT_GATE_RULE, SEQUENCE_CONTENT_GATE_RULE, COMPONENT_CONTENT_GATE_RULE]) {
  assert.match(rule, /Do NOT author `companions`/);
 }
});

test('reviewer independently checks absent and generated artifacts with honest verdicts', () => {
 const template = reviewTemplateFor('issue');
 const prompt = flat(buildTemplateReviewPrompt(template, 'Class-local edit; no companion definitions.', 'design.story').system);
 for (const text of ['even when no companion definitions are supplied', 'linked companion files, generated content, and rendered consistency', 'A structured definition alone does not prove', 'If rendering is unavailable', 'Request author correction/regeneration', 'not a warn verdict', 'do not silently substitute a reviewer-authored design', 'could-not-verify', 'including missing necessary relationship documentation', 'confirmed does-not-hold MED/HIGH', 'Do not label a confirmed omission could-not-verify']) assert.ok(prompt.includes(text), text);
 for (const [outcome, severity, expectedSeverity, expectedVerdict] of [
  ['holds', 'LOW', 'LOW', 'pass'],
  ['does-not-hold', 'LOW', 'MED', 'block'],
  ['does-not-hold', 'HIGH', 'HIGH', 'block'],
  ['could-not-verify', 'LOW', 'LOW', 'warn'],
 ] as const) {
  const answer = { items: template.items.map((item, i) => i === 0 ? { item: item.id, premises: [{ premise: 'Design adequacy and relationship documentation', outcome, severity, evidence: 'Checked design; optional visual advice when adequate; renderer unavailable only in unverified fixture.', action: 'Document relationships or optionally clarify adequate prose.', files: ['design.md'] }] } : { item: item.id, notApplicable: 'Not part of this isolated fixture.', premises: [] }) };
  const result = validateTemplateAnswer(template, answer);
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error(result.errors.join('; '));
  assert.equal(result.findings[0]?.severity, expectedSeverity);
  assert.equal(computeVerdict(result.findings, DEFAULT_BLOCK_ON), expectedVerdict);
 }
});

test('shipped steering copy and review cycle limit remain synchronized', () => {
 const plugin = readFileSync(new URL('../../../../vscode-plugin/assets/steering-block.md', import.meta.url), 'utf8');
 assert.equal(plugin, steering);
 assert.equal((steering.match(/At most three review rounds per cycle/g) ?? []).length, 3);
 for (const key of ['review', 'code-review']) assert.match(flat(readWorkflowGuide(steering, key) ?? ''), /Do not start a fourth review until the user says so/);
});
