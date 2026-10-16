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

import { PATH_FORM_RULE } from '../runners/scope-prompts.js';
import { defineContextSchema } from '../runners/define/schemas.js';
import { hldContextSchema } from '../runners/design-epic/schemas.js';
import { lldContextSchema, contractDetailSchema } from '../runners/design-story/schemas.js';
import { planContextSchema } from '../runners/plan/schemas.js';

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
