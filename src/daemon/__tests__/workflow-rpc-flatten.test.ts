/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The analyze findings a workflow step is grounded on are flattened into its
 * prompt. A bundle with a report leads with its completeness line; a bundle
 * with none is flattened as before.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { renderCompletenessLine, type AnswerReport } from '../../analyze/completeness.js';
import type { AnalyzeContextBundle } from '../../analyze/context/types.js';
import { _flattenBundleForTest as flattenBundle } from '../workflow-rpc.js';

const LAYERS: AnalyzeContextBundle = {
	system: 'sys', focus: 'foc', summary: 'sum', structure: '', surface: 'sur', artefacts: 'art', upstream: 'up',
};

test('the findings flattened into a workflow step start with the completeness line when the bundle has a report, and are unchanged when it has none', () => {
	const report: AnswerReport = {
		completeness: {
			complete:   false,
			incomplete: [],
			failed:     [{ sourceId: 'symbol.locate [e3]', sourceKind: 'lookup', reason: 'the graph store is closed' }],
		},
	};
	const without = flattenBundle(LAYERS);
	assert.equal(without, 'sys\n\nfoc\n\nsum\n\nsur\n\nart');

	const withReport = flattenBundle({ ...LAYERS, report });
	assert.equal(withReport.split('\n')[0], renderCompletenessLine(report));
	assert.match(withReport.split('\n')[0] ?? '', /symbol\.locate \[e3\]/);
	assert.equal(withReport, `${renderCompletenessLine(report)}\n\n${without}`);
});
