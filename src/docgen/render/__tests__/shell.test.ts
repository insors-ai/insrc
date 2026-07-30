/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Tests for the docgen RenderedDocumentShell assembly (s1 · t6). Reads the real
 * vendored runtime from src/assets/docgen (present under both src + out trees),
 * so it doubles as the offline-guarantee check: no `<script src=` / `<link`.
 *
 * Run: npx tsx --test src/docgen/render/__tests__/shell.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { documentIRToMermaid, assembleShell } from '../shell.js';
import { isOk } from '../../outcome.js';
import type { DocumentIR } from '../../types.js';

function ir(): DocumentIR {
	return {
		docType: 'type-structure',
		scopeDescription: 'src/sample (types)',
		derived: {
			nodes: [
				{ id: 'a', label: 'Base', kind: 'class', citation: { entityId: 'a' } },
				{ id: 'b', label: 'Derived', kind: 'class', citation: { entityId: 'b' } },
				{ id: 'i', label: 'Shape', kind: 'interface', citation: { entityId: 'i' } },
			],
			edges: [
				{ id: 'b:inherits:a', from: 'b', to: 'a', kind: 'inherits' },
				{ id: 'b:implements:i', from: 'b', to: 'i', kind: 'implements' },
			],
		},
		narrated: { sections: [] },
		generatedAtRevision: 'rev1',
	};
}

test('documentIRToMermaid: classDiagram with class decls + inherit/implement arrows', () => {
	const src = documentIRToMermaid(ir());
	assert.match(src, /^classDiagram/);
	assert.match(src, /class n0\["Base"\]/);
	assert.match(src, /class n2\["Shape"\]/);
	assert.match(src, /<<interface>> n2/);            // interface stereotype
	assert.match(src, /n0 <\|-- n1/);                 // Base <|-- Derived (inherits)
	assert.match(src, /n2 <\|\.\. n1/);               // Shape <|.. Derived (implements)
});

test('documentIRToMermaid: an edge to an alias-less node is skipped; labels are escaped', () => {
	const doc: DocumentIR = {
		...ir(),
		derived: {
			nodes: [{ id: 'x', label: 'A"weird`name', kind: 'class' }],
			edges: [{ id: 'e', from: 'x', to: 'missing', kind: 'inherits' }],
		},
	};
	const src = documentIRToMermaid(doc);
	assert.match(src, /class n0\["A weird name"\]/);   // quotes/backticks scrubbed
	assert.doesNotMatch(src, /missing/);               // dangling edge dropped
});

test('assembleShell: offline self-contained shell — runtime INLINED, no external fetch', async () => {
	const out = await assembleShell(ir());
	assert.ok(isOk(out), 'expected ok');
	if (!isOk(out)) return;
	const shell = out.value;
	assert.equal(shell.backend, 'primary-inline');
	assert.equal(shell.diagramFormat, 'svg');
	assert.equal(shell.supportsZoomPan, true);
	assert.equal(shell.inlinedRuntimeVersion, '10.9.1');
	// the OFFLINE guarantee: no <script src=, no <link href= — everything inlined
	assert.doesNotMatch(shell.html, /<script[^>]*\bsrc=/i);
	assert.doesNotMatch(shell.html, /<link[^>]*\bhref=/i);
	// the runtimes are actually inlined (not stubs): large + both present
	assert.ok(shell.html.length > 1_000_000, 'runtime should be inlined (large document)');
	assert.match(shell.html, /svgPanZoom|svg-pan-zoom/);
	assert.match(shell.html, /mermaid/);
	// the diagram source is embedded
	assert.match(shell.html, /class n0/);
	assert.match(shell.html, /Base/);
});
