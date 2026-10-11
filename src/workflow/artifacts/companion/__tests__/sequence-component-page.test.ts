/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * LLD-d9f85b3c S001/t6 — the sequence and component-dependency page builders,
 * on the Delivery-board flow and the companion-rendering components used by the
 * approved mocks.
 *
 * Run:
 *   npx tsx --test src/workflow/artifacts/companion/__tests__/sequence-component-page.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { sequenceDefinitionToPage, validateSequenceDefinition, type SequenceDefinition } from '../sequence.js';
import { componentDependencyDefinitionToPage, validateComponentDependencyDefinition, type ComponentDependencyDefinition } from '../component.js';
import type { CompanionPageContent } from '../shell.js';

const BOARD: SequenceDefinition = {
	narrative: 'A refresh flows from the webview through the host to the daemon and back.',
	participants: [
		{ id: 'reader', label: 'Reader', description: 'The person using the Delivery board.' },
		{ id: 'webview', label: 'Board webview' },
		{ id: 'host', label: 'Board host', description: 'Owns requests and state.' },
		{ id: 'daemon', label: 'Daemon' },
	],
	messages: [
		{ from: 'reader', to: 'webview', label: 'Refresh', description: 'Reader asks for a fresh board.' },
		{ from: 'webview', to: 'host', label: 'refresh intent' },
		{ from: 'host', to: 'daemon', label: 'workflow.delivery; snapshot #n', note: 'Single IPC read.' },
		{ from: 'daemon', to: 'host', label: 'DeliverySnapshot | { error }', kind: 'return' },
		{ from: 'host', to: 'host', label: 'drop stale response', kind: 'recurse' },
		{ from: 'host', to: 'webview', label: 'status + board view model' },
	],
	truncations: [{ atParticipant: 'daemon', note: 'depth limit reached' }],
};

const COMPONENTS: ComponentDependencyDefinition = {
	narrative: 'The finalizer drives one shell and four plug-ins.',
	components: [
		{ id: 'orchestrator', label: 'Workflow finalizer', path: 'src/workflow/orchestrator.ts', description: 'Renders companions after an HLD/LLD is written.' },
		{ id: 'shell', label: 'Companion shell', path: 'src/workflow/artifacts/companion/shell.ts' },
		{ id: 'panzoom', label: 'Pan/zoom runtime', path: 'src/assets/artifacts/companion/panzoom.js', description: 'One pan/zoom for every visual.' },
		{ id: 'header' },
	],
	dependencies: [
		{ from: 'orchestrator', to: 'shell', label: 'renders' },
		{ from: 'orchestrator', to: 'header' },
		{ from: 'shell', to: 'panzoom' },
	],
};

function src(p: CompanionPageContent): string {
	return p.visual.kind === 'mermaid' ? p.visual.source : '';
}

// ---------------------------------------------------------------------------
// unit: sequence page builder: autonumber, labels, dashed returns, notes; participants + messages tables (Delivery-board fixture)
// ---------------------------------------------------------------------------

test('d9f85b3c t6 — the sequenceDiagram is autonumbered, labels every message, dashes returns and keeps the notes', () => {
	assert.deepEqual(validateSequenceDefinition(BOARD), []);
	const page = sequenceDefinitionToPage(BOARD, 'Delivery board refresh');
	assert.equal(page.kindLabel, 'Sequence diagram');
	assert.equal(src(page), [
		'sequenceDiagram',
		'  autonumber',
		'  participant reader as Reader',
		'  participant webview as Board webview',
		'  participant host as Board host',
		'  participant daemon as Daemon',
		'  reader->>webview: Refresh',
		'  webview->>host: refresh intent',
		'  host->>daemon: workflow.delivery#59; snapshot #35;n',
		'  daemon-->>host: DeliverySnapshot | { error }',
		'  host->>host: drop stale response',
		'  Note over host: recursion',
		'  host->>webview: status + board view model',
		'  Note over daemon: depth limit reached',
	].join('\n'));
	assert.equal(page.narrative, BOARD.narrative);
});

test('d9f85b3c t6 — the participants and messages tables, in call order with kind tags', () => {
	const page = sequenceDefinitionToPage(BOARD, 'Delivery board refresh');
	const [parts, msgs, truncs] = page.description;
	assert.equal(parts!.lead, '4 participants, 6 messages, in call order.');
	assert.deepEqual(parts!.rows, [
		['Reader', 'reader', 'The person using the Delivery board.'],
		['Board webview', 'webview', null],
		['Board host', 'host', 'Owns requests and state.'],
		['Daemon', 'daemon', null],
	]);
	assert.deepEqual(msgs!.columns, ['Step', 'From → To', 'Message', 'Kind', 'Description']);
	assert.deepEqual(msgs!.rows, [
		['1', 'Reader → Board webview', 'Refresh', { tag: 'call', text: 'call' }, 'Reader asks for a fresh board.'],
		['2', 'Board webview → Board host', 'refresh intent', { tag: 'call', text: 'call' }, null],
		['3', 'Board host → Daemon', 'workflow.delivery; snapshot #n', { tag: 'call', text: 'call' }, 'Single IPC read.'],
		['4', 'Daemon → Board host', 'DeliverySnapshot | { error }', { tag: 'return', text: 'return' }, null],
		['5', 'Board host → Board host', 'drop stale response', { tag: 'call', text: 'recurse' }, null],
		['6', 'Board host → Board webview', 'status + board view model', { tag: 'call', text: 'call' }, null],
	]);
	assert.deepEqual(truncs!.rows, [['Daemon', 'depth limit reached']]);
});

test('d9f85b3c t6 — awkward participant ids are aliased; no truncations block when there are none', () => {
	const page = sequenceDefinitionToPage({
		participants: [{ id: 'a b', label: 'A' }, { id: '1st' }],
		messages: [{ from: 'a b', to: '1st', label: 'go' }],
	}, 't');
	assert.match(src(page), /participant a_b as A\n  participant p_1st as 1st\n  a_b->>p_1st: go/);
	assert.equal(page.description.length, 2);
});

// ---------------------------------------------------------------------------
// unit: component page builder: flowchart + components table
// ---------------------------------------------------------------------------

test('d9f85b3c t6 — the component flowchart has one box per component and one arrow per dependency', () => {
	assert.deepEqual(validateComponentDependencyDefinition(COMPONENTS), []);
	const page = componentDependencyDefinitionToPage(COMPONENTS, 'Companion rendering');
	assert.equal(page.kindLabel, 'Component dependencies');
	assert.equal(src(page), [
		'flowchart LR',
		'  orchestrator["Workflow finalizer<br/><small>orchestrator.ts</small>"]',
		'  shell["Companion shell<br/><small>shell.ts</small>"]',
		'  panzoom["Pan/zoom runtime<br/><small>panzoom.js</small>"]',
		'  header["header"]',
		'  orchestrator -->|renders| shell',
		'  orchestrator --> header',
		'  shell --> panzoom',
	].join('\n'));
});

test('d9f85b3c t6 — the components table lists path, depends-on and description, null when absent', () => {
	const page = componentDependencyDefinitionToPage(COMPONENTS, 'Companion rendering');
	const [block] = page.description;
	assert.deepEqual(block!.columns, ['Component', 'Path', 'Depends on', 'Description']);
	assert.equal(block!.lead, '4 components, 3 dependencies. An arrow points from a component to what it depends on.');
	assert.deepEqual(block!.rows, [
		['Workflow finalizer', 'src/workflow/orchestrator.ts', 'Companion shell, header', 'Renders companions after an HLD/LLD is written.'],
		['Companion shell', 'src/workflow/artifacts/companion/shell.ts', 'Pan/zoom runtime', null],
		['Pan/zoom runtime', 'src/assets/artifacts/companion/panzoom.js', null, 'One pan/zoom for every visual.'],
		['header', null, null, null],
	]);
});

test('d9f85b3c t6 — component labels with quotes, pipes or markup cannot break the flowchart', () => {
	const page = componentDependencyDefinitionToPage({
		components: [{ id: 'x', label: 'say "hi" <b>|</b>' }, { id: 'y' }],
		dependencies: [{ from: 'x', to: 'y', label: 'a|b' }],
	}, 't');
	assert.ok(src(page).includes(`x["say 'hi' #lt;b#gt;/#lt;/b#gt;"]`), src(page));
	assert.ok(src(page).includes('x -->|a/b| y'));
});
