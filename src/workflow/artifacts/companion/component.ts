/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * sc3 (S003, artifact-companion-wiring) — the authored ComponentDependencyDefinition
 * body element + its deterministic validation/visualization. The
 * component-dependency peer of the ErDefinition / UxDefinition / SequenceDefinition set.
 *
 * The ComponentDependencyDefinition is a structure sketch (the stakeholder-directed
 * source of truth): named `components` (the modules) and directed `dependencies`
 * (which component depends on which). The JSON element is validated (a light
 * structural + referential-integrity check) and visualized
 * (componentDependencyDefinitionToIr → docgen assembleShell, which already renders a
 * `component-dependency` DocumentIR as a mermaid `flowchart LR`); the companion is
 * DERIVED from it, never the reverse. Validation runs against the JSON element ONLY —
 * it never reads a rendered companion file (k2).
 *
 * Deterministic + provider-free. Mirrors ./er.ts.
 */

import type { DocumentIR, IrEdge, IrNode } from '../../../docgen/types.js';
import type { DimensionFinding } from '../../code-review/types.js';

// ---------------------------------------------------------------------------
// t2 — ComponentDependencyDefinition types
// ---------------------------------------------------------------------------

/** One component (module/box) in the dependency graph. */
export interface Component {
	readonly id:     string;
	readonly label?: string | undefined;
}

/** One directed dependency edge (`from` depends on `to`). */
export interface ComponentDependency {
	readonly from:   string;
	readonly to:     string;
	readonly label?: string | undefined;
}

/** The authored component-dependency (structure) — the source of truth for the
 *  component-dependency companion. */
export interface ComponentDependencyDefinition {
	readonly id?:           string | undefined;
	readonly components:    readonly Component[];
	readonly dependencies:  readonly ComponentDependency[];
}

/** Thrown by componentDependencyDefinitionToIr when a dependency endpoint names a
 *  component absent from `components` — a dangling reference (referential
 *  integrity), enforced as defense-in-depth after
 *  validateComponentDependencyDefinition. Mirrors ErDefinitionError. */
export class ComponentDefinitionError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ComponentDefinitionError';
	}
}

const DIMENSION = 'diagram' as const;

// ---------------------------------------------------------------------------
// t2 — validateComponentDependencyDefinition (JSON element only)
// ---------------------------------------------------------------------------

/**
 * Validate the authored ComponentDependencyDefinition JSON element. Light
 * structural + referential-integrity check, deterministic and provider-free,
 * operating on the JSON element ONLY (never the rendered file):
 *
 *   1. Structural shape: `components` and `dependencies` are arrays; each component
 *      has a non-empty `id`; each dependency has non-empty `from`/`to`. Component
 *      ids are unique.
 *   2. Referential integrity: every dependency `from`/`to` resolves to a declared
 *      component; a dangling endpoint is a HIGH breach.
 *
 * Returns an EMPTY array when sound (mirrors validateErDefinition).
 */
export function validateComponentDependencyDefinition(compDef: unknown): readonly DimensionFinding[] {
	const findings: DimensionFinding[] = [];
	if (typeof compDef !== 'object' || compDef === null) {
		return [breach('componentDependencyDefinition', 'componentDependencyDefinition is not an object')];
	}
	const def = compDef as { components?: unknown; dependencies?: unknown };

	if (!Array.isArray(def.components)) {
		findings.push(breach('componentDependencyDefinition:components', 'components is not an array'));
	}
	if (!Array.isArray(def.dependencies)) {
		findings.push(breach('componentDependencyDefinition:dependencies', 'dependencies is not an array'));
	}
	if (findings.length > 0) return findings;

	const components = def.components as unknown[];
	const dependencies = def.dependencies as unknown[];

	const ids = new Set<string>();
	components.forEach((c, i) => {
		const id = (c as { id?: unknown }).id;
		if (typeof id !== 'string' || id.length === 0) {
			findings.push(breach(`componentDependencyDefinition:components[${i}]`, `component at index ${i} has no non-empty id`));
			return;
		}
		if (ids.has(id)) findings.push(breach(`componentDependencyDefinition:components.${id}`, `component id '${id}' is declared more than once`));
		ids.add(id);
	});

	dependencies.forEach((d, i) => {
		const dep = d as { from?: unknown; to?: unknown };
		for (const endpoint of ['from', 'to'] as const) {
			const v = dep[endpoint];
			if (typeof v !== 'string' || v.length === 0) {
				findings.push(breach(`componentDependencyDefinition:dependencies[${i}]`, `dependency at index ${i} has no non-empty '${endpoint}'`));
				continue;
			}
			if (!ids.has(v)) {
				findings.push(breach(
					`componentDependencyDefinition:dependencies[${i}].${endpoint}`,
					`dependency at index ${i} references '${endpoint}' component '${v}', which is not declared in components (dangling reference)`,
				));
			}
		}
	});

	return findings;
}

/** A HIGH 'breach' diagram finding. */
function breach(location: string, message: string): DimensionFinding {
	return { dimension: DIMENSION, severity: 'HIGH', location, message, confidence: 'breach' };
}

// ---------------------------------------------------------------------------
// t2 — componentDependencyDefinitionToIr (deterministic; feeds docgen assembleShell)
// ---------------------------------------------------------------------------

/** The docType stamped on the component IR. Consumed by assembleShell's mermaid
 *  emitter, which renders a `component-dependency` DocumentIR as a `flowchart LR`
 *  (a box per node, one `A --> B` arrow per edge). */
export const COMPONENT_DOC_TYPE = 'component-dependency';

/**
 * Transform a ComponentDependencyDefinition into a docgen DocumentIR: each
 * component → a 'component' IrNode; each dependency → a 'depends-on' IrEdge. Pure +
 * deterministic: component + dependency order is preserved verbatim, so the same
 * compDef always yields byte-identical IR (no graph, no provider).
 *
 * @throws ComponentDefinitionError when a dependency endpoint names a component
 *   absent from `components` (referential integrity — should have been caught by
 *   validateComponentDependencyDefinition; enforced here as defense-in-depth,
 *   mirroring erDefinitionToIr).
 */
export function componentDependencyDefinitionToIr(compDef: ComponentDependencyDefinition): DocumentIR {
	const ids = new Set(compDef.components.map(c => c.id));
	const nodes: IrNode[] = [];
	const edges: IrEdge[] = [];

	for (const c of compDef.components) {
		nodes.push({
			id:    c.id,
			label: c.label !== undefined && c.label.length > 0 ? c.label : c.id,
			kind:  'component',
		});
	}

	compDef.dependencies.forEach((d, i) => {
		if (!ids.has(d.from)) {
			throw new ComponentDefinitionError(`componentDependencyDefinitionToIr: dependency ${i} 'from' names undeclared component '${d.from}'`);
		}
		if (!ids.has(d.to)) {
			throw new ComponentDefinitionError(`componentDependencyDefinitionToIr: dependency ${i} 'to' names undeclared component '${d.to}'`);
		}
		edges.push({
			id:   `${d.from}->${d.to}#${i}`,
			from: d.from,
			to:   d.to,
			kind: 'depends-on',
		});
	});

	return {
		docType:             COMPONENT_DOC_TYPE,
		scopeDescription:    compDef.id !== undefined && compDef.id.length > 0 ? `Components: ${compDef.id}` : 'Component dependencies',
		derived:             { nodes, edges },
		narrated:            { sections: [] },
		generatedAtRevision: 'authored-component',
	};
}
