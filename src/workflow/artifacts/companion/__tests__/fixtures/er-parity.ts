/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * S003/t4 — SHARED ER fixtures for the daemon/client PARITY test.
 *
 * S003 re-implements `erDefinitionToIr`'s node/edge derivation inside a webview
 * source string. The duplication is unavoidable: the derivation has to run
 * client-side and a webview cannot import a daemon module. The only safe
 * mitigation is to pin both implementations against the SAME inputs, with the
 * daemon as the AUTHORITY — so a client drift fails the test instead of quietly
 * redefining what correct means.
 *
 * This module is the single source of those inputs. It is imported directly by the
 * daemon-side `erDefinitionToIr` call and loaded by the plugin test that
 * `new Function`-evaluates the client derivation, so neither side can be fed a
 * fixture the other never saw.
 *
 * Only records the DAEMON ACCEPTS belong in PARITY_FIXTURES: `erDefinitionToIr`
 * throws on a dangling range, so a dangling record cannot have a parity
 * expectation. That case is a deliberate DIVERGENCE and lives separately below.
 */

import type { ErDefinition } from '../../er.js';

export interface ParityFixture {
	readonly name: string;
	readonly why: string;
	readonly record: ErDefinition;
}

/** Records both implementations must agree on, exactly. */
export const PARITY_FIXTURES: readonly ParityFixture[] = [
	{
		name: 'single class, scalar attributes only',
		why: 'the floor: no edges at all, and the attribute label format (`name: range`) is load-bearing',
		record: {
			id: 'one-class',
			classes: {
				Artifact: {
					attributes: {
						id: { range: 'string', identifier: true, required: true },
						createdAt: { range: 'datetime' },
					},
				},
			},
		},
	},
	{
		name: 'two classes, one relationship',
		why: 'the simplest edge: a class-ranged slot becomes a relation, not an attribute',
		record: {
			classes: {
				Order: { attributes: { id: { range: 'string', identifier: true }, placedBy: { range: 'Customer', required: true } } },
				Customer: { attributes: { id: { range: 'string', identifier: true } } },
			},
		},
	},
	{
		name: 'every cardinality combination',
		why: 'the crow\'s-foot token must match the daemon\'s for all four corners, and an explicit cardinality must beat the boolean flag',
		record: {
			classes: {
				A: {
					attributes: {
						zeroToOne: { range: 'B' },
						oneToOne: { range: 'B', required: true },
						zeroToMany: { range: 'B', multivalued: true },
						oneToMany: { range: 'B', required: true, multivalued: true },
						explicitMin: { range: 'B', minimum_cardinality: 1 },
						explicitMaxMany: { range: 'B', maximum_cardinality: 5 },
						explicitMaxOne: { range: 'B', multivalued: true, maximum_cardinality: 1 },
					},
				},
				B: { attributes: { id: { range: 'string' } } },
			},
		},
	},
	{
		name: 'rangeless and unknown-shaped slots',
		why: 'a slot with no range renders as the BARE name; the daemon does the same, and an empty range must not become an edge',
		record: {
			classes: {
				Thing: { attributes: { bare: {}, alsoBare: { range: '' }, typed: { range: 'integer' } } },
			},
		},
	},
	{
		name: 'self-reference',
		why: 'an ordinary tree. The layout must iterate the sorted class list, never walk edges, or this does not terminate',
		record: {
			classes: {
				Node: { attributes: { id: { range: 'string' }, parent: { range: 'Node' }, children: { range: 'Node', multivalued: true } } },
			},
		},
	},
	{
		name: 'cycle across three classes',
		why: 'A -> B -> C -> A is a legitimate model, and the same termination property as the self-reference',
		record: {
			classes: {
				A: { attributes: { toB: { range: 'B' } } },
				B: { attributes: { toC: { range: 'C' } } },
				C: { attributes: { toA: { range: 'A' } } },
			},
		},
	},
	{
		name: 'class with no attributes',
		why: 'a legitimate entity — often the target end of a relationship — that must still draw as a box, or the edges pointing at it break',
		record: {
			classes: { Empty: {}, Pointer: { attributes: { at: { range: 'Empty' } } } },
		},
	},
	{
		name: 'sort order is not insertion order',
		why: 'both sides must sort classes AND slots, so the node/edge sequences are comparable at all',
		record: {
			classes: {
				Zebra: { attributes: { zz: { range: 'string' }, aa: { range: 'Apple' } } },
				Apple: { attributes: { mm: { range: 'string' } } },
				Mango: { attributes: { bb: { range: 'Zebra' } } },
			},
		},
	},
	{
		name: 'hostile names',
		why: 'XML-active and HTML-active characters must survive character-for-character; SVG is XML, so this is the ac4 proof case',
		record: {
			classes: {
				'<script>alert(1)</script>': { attributes: { 'a & b': { range: 'string' }, '`tick`': { range: 'Plain' } } },
				Plain: { attributes: { '<em>x</em>': { range: 'string' } } },
			},
		},
	},
];

/**
 * A DANGLING class range: a range naming neither a defined class nor a LinkML
 * scalar. The daemon treats this as FATAL (`erDefinitionToIr` throws
 * ErDefinitionError at er.ts:291-294) because it is generating an artifact and owes
 * referential integrity. The CLIENT deliberately does not: it loses the
 * relationship that range would have implied and still draws every box and every
 * other edge, because its job is to show the reviewer what it legibly can.
 *
 * Kept out of PARITY_FIXTURES precisely because the two sides must NOT agree here.
 */
export const DANGLING_FIXTURE: ErDefinition = {
	classes: {
		Order: {
			attributes: {
				id: { range: 'string' },
				placedBy: { range: 'Customer' },        // resolves -> an edge
				shippedVia: { range: 'NoSuchClass' },   // dangling -> daemon throws, client keeps the box
			},
		},
		Customer: { attributes: { id: { range: 'string' } } },
	},
};
