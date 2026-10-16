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
import { checkPathForms, validateBodyAndCitations } from '../synthesizer.js';
import type { Citation, WorkflowArtifact } from '../types.js';

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

const code = (id: string, ref: string): Citation => ({ id, kind: 'code', ref });
const doc  = (id: string, ref: string): Citation => ({ id, kind: 'doc', ref });

/** The details of a failed result, or an empty list when it passed. */
const detailsOf = (result: ReturnType<typeof checkPathForms>): readonly string[] =>
  result.ok ? [] : (result.details ?? []);

test('src/workflow/__tests__/path-forms.test.ts: checkPathForms accepts a root-relative path with and without a line number', () => {
  const result = checkPathForms(
    [code('c1', 'src/workflow/synthesizer.ts'), code('c2', 'src/workflow/synthesizer.ts:93'), doc('c3', 'README.md')],
    ['src/workflow/artifacts/plan.ts', 'src/workflow/artifacts/lld.ts:388'],
  );
  assert.deepEqual(result, { ok: true });
});

test('src/workflow/__tests__/path-forms.test.ts: checkPathForms accepts an absolute path as an external file', () => {
  const result = checkPathForms(
    [code('c1', '/home/user/.insrc/daemon/out/index.js'), code('c2', 'C:\\Users\\me\\notes.md')],
    ['/usr/lib/node_modules/tsx/dist/cli.mjs'],
  );
  assert.deepEqual(result, { ok: true });
});

test('src/workflow/__tests__/path-forms.test.ts: checkPathForms refuses a call site with prose beside the path and names it', () => {
  const prose = 'src/workflow/artifacts/plan.ts (new artifact module defining PlanTask, mirroring artifacts/lld.ts)';
  const result = checkPathForms([], [prose, 'src/workflow/synthesizer.ts']);
  assert.equal(result.ok, false);
  assert.equal(result.ok ? '' : result.kind, 'paths');
  const details = detailsOf(result);
  assert.equal(details.length, 1, 'only the entry with prose is named');
  assert.ok(details[0]!.includes(prose), 'the entry is named in full');
  assert.match(details[0]!, /whitespace/);
  // A code citation with a note in the same string is refused the same way.
  const cited = checkPathForms([code('c1', 'synthesizer.ts validateCitations')], []);
  assert.equal(cited.ok, false);
  assert.ok(detailsOf(cited)[0]!.includes('citation c1'), 'the citation id is named');
});

test('src/workflow/__tests__/path-forms.test.ts: checkPathForms refuses a leading ./ and a .. segment', () => {
  const result = checkPathForms(
    [code('c1', './src/workflow/synthesizer.ts'), code('c2', '../insrc/src/shared/types.ts'), code('c3', 'src/../src/shared/types.ts')],
    [],
  );
  const details = detailsOf(result);
  assert.equal(details.length, 3, 'all three entries are named');
  assert.ok(details.every(d => /relative to the project root/.test(d)));
});

test('src/workflow/__tests__/path-forms.test.ts: checkPathForms checks only citations of kind code and doc', () => {
  const others: Citation[] = [
    { id: 'c1', kind: 'analyze-bundle', ref: 'Path-valued fields and the prompts around them' },
    { id: 'c2', kind: 'step-output', ref: 's1.analyzeBundles[0]' },
    { id: 'c3', kind: 'stakeholder', ref: 'the user' },
    { id: 'c4', kind: 'convention', ref: 'ESM imports use .js' },
    { id: 'c5', kind: 'prior-artifact', ref: 'LLD S001 contractDetails: validateBodyAndCitations' },
  ];
  assert.deepEqual(checkPathForms(others, []), { ok: true });
  // With no data model changes, an artifact reads no call sites.
  const artifact = { meta: { workflow: 'plan' }, body: { tasks: [] }, citations: others } as unknown as WorkflowArtifact<unknown>;
  assert.deepEqual(validateBodyAndCitations(artifact, 'a plan'), { ok: true });
});

test('src/workflow/__tests__/path-forms.test.ts: checkPathForms accepts a path with a line range, a column and a #anchor', () => {
  const result = checkPathForms(
    [
      code('c1', 'src/workflow/synthesizer.ts:93-96'),
      code('c2', 'src/workflow/synthesizer.ts:93:5'),
      code('c3', 'src/workflow/synthesizer.ts:93-96:5'),
      doc('c4', 'docs/plans/workflow-define.md#as-built-deltas'),
    ],
    [],
  );
  assert.deepEqual(result, { ok: true });
  // A suffix the chat page does not link is refused.
  assert.equal(checkPathForms([code('c1', 'src/workflow/synthesizer.ts:filter')], []).ok, false);
});

test('src/workflow/__tests__/path-forms.test.ts: checkPathForms accepts an http(s) URL in a doc citation', () => {
  const result = checkPathForms(
    [doc('c1', 'https://plugins.jetbrains.com/docs/intellij/embedded-browser-jcef.html'), doc('c2', 'http://localhost:8080/docs#intro')],
    [],
  );
  assert.deepEqual(result, { ok: true });
});

const lld = (callSites: string[], citations: Citation[]): WorkflowArtifact<unknown> => ({
  meta: { workflow: 'design.story' },
  body: { dataModelChanges: [{ entity: 'ValidationFailure', change: 'field-modify', details: 'x', callSites }] },
  citations,
} as unknown as WorkflowArtifact<unknown>);

test('src/workflow/__tests__/path-forms.test.ts: validateBodyAndCitations returns a paths failure for an LLD whose call site carries prose', () => {
  const artifact = lld(['src/workflow/artifacts/plan.ts (new artifact module)'], [code('c1', 'src/workflow/synthesizer.ts:207')]);
  const result = validateBodyAndCitations(artifact, 'body [[c1]]');
  assert.equal(result.ok, false);
  assert.equal(result.ok ? '' : result.kind, 'paths');
  assert.ok(detailsOf(result)[0]!.includes('src/workflow/artifacts/plan.ts (new artifact module)'));
  // The path check runs after the citation check: a dangling [[cN]] is still reported as a citations failure.
  const dangling = validateBodyAndCitations(artifact, 'body [[c9]]');
  assert.equal(dangling.ok ? '' : dangling.kind, 'citations');
});

test('src/workflow/__tests__/path-forms.test.ts: validateBodyAndCitations keeps the citation result for a well-formed artifact', () => {
  const artifact = lld(['src/workflow/artifacts/plan.ts', 'src/daemon/workflow-rpc.ts:278'], [code('c1', 'src/workflow/synthesizer.ts:207')]);
  assert.deepEqual(validateBodyAndCitations(artifact, 'body [[c1]]'), { ok: true });
  const dangling = validateBodyAndCitations(artifact, 'body [[c2]]');
  assert.equal(dangling.ok, false);
  assert.equal(dangling.ok ? '' : dangling.kind, 'citations', 'the existing citation result is unchanged');
});

test('src/workflow/__tests__/path-forms.test.ts: checkPathForms refuses an absolute path inside the project when it knows the project root', () => {
  const root = '/home/user/work/insrc';
  const inside = checkPathForms([code('c1', `${root}/src/workflow/synthesizer.ts:93`)], [`${root}/src/workflow/artifacts/plan.ts`], root);
  const details = detailsOf(inside);
  assert.equal(details.length, 2, 'both entries are named');
  assert.ok(details.every(d => /inside the project/.test(d)));
  // A path outside the project, and a sibling directory that merely shares the prefix, stay external.
  assert.deepEqual(checkPathForms([code('c1', '/home/user/other/file.ts'), code('c2', `${root}-old/file.ts`)], [], root), { ok: true });
  // Without a root there is nothing to compare, so an absolute path is external as before.
  assert.deepEqual(checkPathForms([code('c1', `${root}/src/a.ts`)], []), { ok: true });
});

test('src/workflow/__tests__/path-forms.test.ts: checkPathForms refuses a path that names a symbol and says what to keep', () => {
  for (const ref of ['src/workflow/synthesizer.ts:validateCitations', 'src/workflow/id.ts::storyIdToOrdinal']) {
    const details = detailsOf(checkPathForms([], [ref]));
    assert.equal(details.length, 1, `${ref} is refused`);
    assert.match(details[0]!, /names a symbol after the path; keep only the path/);
  }
});

test('src/workflow/__tests__/path-forms.test.ts: checkPathForms accepts a project directory with a trailing slash', () => {
  assert.deepEqual(checkPathForms([code('c1', 'src/workflow/'), doc('c2', 'docs/plans/')], ['src/workflow/runners/']), { ok: true });
  assert.equal(checkPathForms([], ['src/work flow/']).ok, false, 'a directory with a space is still refused');
});
