/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Story E202610163c6a109d:S001 — how the authoring stages write a file reference.
 *
 * The rule is defined once (PATH_FORM_RULE), put in the descriptions of the path-valued schema
 * fields and in the prompts that author paths, and enforced in shape by checkPathForms.
 *
 * Run:
 *   npx tsx --test src/workflow/__tests__/path-forms.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PATH_FORM_RULE } from '../runners/scope-prompts.js';
import { defineContextSchema } from '../runners/define/schemas.js';
import { hldContextSchema } from '../runners/design-epic/schemas.js';
import { lldContextSchema, contractDetailSchema } from '../runners/design-story/schemas.js';
import { planContextSchema } from '../runners/plan/schemas.js';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string): string => readFileSync(join(SRC, rel), 'utf8');

/** `analyzeBundles[].pathsCited` of a step-1 context schema. */
const pathsCitedOf = (schema: unknown): Record<string, unknown> => {
  const s = schema as { properties: { analyzeBundles: { items: { properties: { pathsCited: Record<string, unknown> } } } } };
  return s.properties.analyzeBundles.items.properties.pathsCited;
};

test('src/workflow/__tests__/path-forms.test.ts: the callSites and pathsCited schema descriptions carry the rule wording', () => {
  for (const [name, schema] of [
    ['define', defineContextSchema],
    ['design.epic', hldContextSchema],
    ['design.story', lldContextSchema],
    ['plan', planContextSchema],
  ] as const) {
    const field = pathsCitedOf(schema);
    assert.equal(field['description'], PATH_FORM_RULE, `${name}: pathsCited carries the rule`);
    assert.equal(field['pattern'], undefined, `${name}: pathsCited gains no pattern`);
  }
  const dm = (contractDetailSchema as unknown as {
    properties: { dataModel: { items: { properties: { callSites: Record<string, unknown> } } } };
  }).properties.dataModel.items.properties.callSites;
  assert.equal(dm['description'], PATH_FORM_RULE, 'design.story: callSites carries the rule');
  assert.equal(dm['pattern'], undefined, 'design.story: callSites gains no pattern');
  assert.match(PATH_FORM_RULE, /relative to the project root/);
  assert.match(PATH_FORM_RULE, /full path/);
});

test('src/workflow/__tests__/path-forms.test.ts: every synthesize prompt and the step prompts that author paths contain PATH_FORM_RULE', () => {
  const orchestrator = read('orchestrator.ts');
  // One synthesizer function per workflow; each ends where the next top-level function starts.
  const body = (name: string): string => {
    const at = orchestrator.indexOf(`function ${name}(`);
    assert.ok(at >= 0, `${name} is found`);
    const next = orchestrator.indexOf('\nfunction ', at + 1);
    return orchestrator.slice(at, next === -1 ? undefined : next);
  };
  for (const name of [
    'stubSynthesizer', 'brainstormSynthesizer', 'issueSynthesizer', 'defineSynthesizer',
    'designEpicSynthesizer', 'designStorySynthesizer', 'planSynthesizer',
  ]) {
    assert.ok(body(name).includes('PATH_FORM_RULE'), `${name} carries the rule`);
  }
  // The tracker prompt does not reach validateBodyAndCitations, so it is left alone.
  assert.equal(body('trackerSynthesizer').includes('PATH_FORM_RULE'), false, 'the tracker synthesizer is unchanged');
  // The wording is imported, never retyped.
  assert.match(orchestrator, /import \{ PATH_FORM_RULE \} from '\.\/runners\/scope-prompts\.js'/);
  assert.equal(orchestrator.includes('WRITE FILE REFERENCES IN ONE FORM'), false, 'orchestrator does not copy the wording');

  // The step prompts that author callSites or pathsCited, and the issue capture prompt.
  const ds = read('runners/design-story/index.ts');
  for (const id of ["id: 'context.assemble'", "id: 'contract.detail'"]) {
    const start = ds.indexOf(id);
    assert.ok(start >= 0, `${id} is found`);
    assert.ok(ds.slice(start, ds.indexOf('userTurn:', start)).includes('PATH_FORM_RULE'), `${id} carries the rule`);
  }
  assert.ok(read('runners/issue/index.ts').includes('PATH_FORM_RULE'), 'the issue capture prompt carries the rule');
  assert.equal(ds.includes('WRITE FILE REFERENCES IN ONE FORM'), false, 'design-story does not copy the wording');
});

test('src/workflow/__tests__/path-forms.test.ts: the design.story synthesize prompt lets a call site taken from s4 be corrected to the path form', () => {
  const orchestrator = read('orchestrator.ts');
  const at = orchestrator.indexOf('function designStorySynthesizer(');
  const text = orchestrator.slice(at, orchestrator.indexOf('\nfunction ', at + 1));
  // The verbatim hard rule names the one exception, and the rule it points at is in the same prompt.
  const line = text.split('\n').find((l) => l.includes('`body.dataModelChanges`') && l.includes('MUST be verbatim from s4'));
  assert.ok(line !== undefined, 'the verbatim-from-s4 rule is found');
  assert.match(line, /except that every `callSites` entry is written in the form the file-reference rule below requires/);
  assert.ok(text.indexOf('PATH_FORM_RULE') > text.indexOf(line), 'the rule follows the verbatim rule in the prompt');
});
