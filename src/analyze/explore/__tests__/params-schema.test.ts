/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The per-type exploration params table (ISSUE-8d39ef09, LLD-9874475f902756f6-S001 t1).
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { validateAgainstSchema } from '../../../agent/providers/structured-output.js';
import { DECOMPOSE_SCHEMA } from '../../context/decomposer.js';
import { EXPLORATION_PARAMS, explorationParamsSchema } from '../params-schema.js';
import type { ExplorationType } from '../types.js';

/** The exploration types the decomposer offers, read from its own schema. */
function explorationTypes(): readonly ExplorationType[] {
	const items = (DECOMPOSE_SCHEMA as { properties: { explorations: { items: { properties: { type: { enum: ExplorationType[] } } } } } })
		.properties.explorations.items.properties.type.enum;
	return items;
}

test('every exploration type has exactly one params branch, derived from EXPLORATION_TYPES', () => {
	const types = explorationTypes();
	assert.ok(types.length > 0);
	assert.deepEqual(Object.keys(EXPLORATION_PARAMS).sort(), [...types].sort(), 'one table entry per exploration type, no more, no less');
	for (const t of types) assert.equal(explorationParamsSchema(t)['type'], 'object', `${t} has a params branch`);
});

test('each branch is closed, requires no param, and admits null and a placeholder string for every value', () => {
	for (const t of explorationTypes()) {
		const schema = explorationParamsSchema(t);
		assert.equal(schema['additionalProperties'], false, `${t}: closed`);
		assert.equal(schema['required'], undefined, `${t}: no required param`);
		assert.ok(validateAgainstSchema(schema, {}).ok, `${t}: empty params are valid`);
		assert.equal(validateAgainstSchema(schema, { notAParam: 1 }).ok, false, `${t}: an undeclared key is refused`);
		for (const name of Object.keys(EXPLORATION_PARAMS[t])) {
			assert.ok(validateAgainstSchema(schema, { [name]: null }).ok, `${t}.${name}: null`);
			assert.ok(validateAgainstSchema(schema, { [name]: '$e1.hits[0].path' }).ok, `${t}.${name}: a placeholder string`);
		}
	}
});

/** Every `params: {...}` example in the decomposer prompt's catalog (single- or multi-line), with the type it documents. */
function documentedExamples(): { type: string; params: unknown }[] {
	const prompt = readFileSync(join(process.cwd(), 'src/prompts/analyze/decompose.system.md'), 'utf8');
	const catalog = prompt.slice(prompt.indexOf('## Exploration catalog'), prompt.indexOf('## When to reach for'));
	const out: { type: string; params: unknown }[] = [];
	const headings = [...catalog.matchAll(/^- \*\*`([a-z.-]+)`\*\*/gm)];
	headings.forEach((h, i) => {
		const section = catalog.slice(h.index, headings[i + 1]?.index ?? catalog.length);
		for (const m of section.matchAll(/params:\s*\{/g)) {
			// Take the object from its opening brace to the matching close, across lines.
			const start = m.index + m[0].length - 1;
			let depth = 0;
			let end = start;
			for (; end < section.length; end++) {
				if (section[end] === '{') depth++;
				else if (section[end] === '}' && --depth === 0) break;
			}
			out.push({ type: h[1]!, params: JSON.parse(section.slice(start, end + 1)) });
		}
	});
	return out;
}

test("every documented params example in the decomposer prompt validates against its type's branch", () => {
	const examples = documentedExamples();
	const types = new Set(explorationTypes());
	assert.deepEqual([...new Set(examples.map(e => e.type))].sort(), [...types].sort(), 'every exploration type has a documented example, and every example names a type');
	for (const { type, params } of examples) {
		assert.ok(types.has(type as ExplorationType), `${type} is an exploration type`);
		const r = validateAgainstSchema(explorationParamsSchema(type as ExplorationType), params);
		assert.ok(r.ok, `${type}: ${JSON.stringify(params)} -> ${r.ok ? '' : r.errors.join('; ')}`);
	}
});
