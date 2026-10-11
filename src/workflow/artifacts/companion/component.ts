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
 * as a companion page (componentDependencyDefinitionToPage → shell.ts, a Mermaid
 * `flowchart LR` plus a components table); the companion is
 * DERIVED from it, never the reverse. Validation runs against the JSON element ONLY —
 * it never reads a rendered companion file (k2).
 *
 * Deterministic + provider-free. Mirrors ./er.ts.
 */

import type { DimensionFinding } from '../../code-review/types.js';
import { MermaidIds, mermaidFlowText } from './mermaid-text.js';
import type { CompanionPageContent, DescriptionCell } from './shell.js';
import { completenessFindings, described } from './completeness.js';

// ---------------------------------------------------------------------------
// t2 — ComponentDependencyDefinition types
// ---------------------------------------------------------------------------

/** One component (module/box) in the dependency graph. */
export interface Component {
	readonly id:           string;
	readonly label?:       string | undefined;
	/** What this component is responsible for, shown in the companion page's description table. Optional. */
	readonly description?: string | undefined;
	/** The repo path the component lives at, shown beside it in the description table. Optional. */
	readonly path?:        string | undefined;
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
	/** A short narrative of what this visual shows, rendered above it on the companion page. Optional: a missing one is a LOW completeness finding at code review. */
	readonly narrative?:    string | undefined;
	readonly components:    readonly Component[];
	readonly dependencies:  readonly ComponentDependency[];
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
// LLD-d9f85b3c S001/t6 — the component-dependency companion page content
// ---------------------------------------------------------------------------

/** The kind badge on a component-dependency companion page. */
export const COMPONENT_KIND_LABEL = 'Component dependencies';

/**
 * Build the component-dependency page from its definition: a left-to-right
 * flowchart with one box per component (its file name under the label when it
 * has a path) and one arrow per dependency, labelled when the dependency is,
 * plus a components table. Pure.
 */
export function componentDependencyDefinitionToPage(compDef: ComponentDependencyDefinition, title: string): CompanionPageContent {
	const components = compDef.components ?? [];
	const dependencies = compDef.dependencies ?? [];
	const ids = new MermaidIds('c');
	for (const c of components) ids.id(c.id);
	const nameOf = new Map(components.map(c => [c.id, c.label ?? c.id]));

	const lines = ['flowchart LR'];
	for (const c of components) {
		const file = c.path !== undefined && c.path.length > 0 ? c.path.split('/').filter(s => s.length > 0).pop() : undefined;
		const sub = file !== undefined ? `<br/><small>${mermaidFlowText(file)}</small>` : '';
		lines.push(`  ${ids.id(c.id)}["${mermaidFlowText(c.label ?? c.id)}${sub}"]`);
	}
	for (const d of dependencies) {
		const label = d.label !== undefined && d.label.length > 0 ? `|${mermaidFlowText(d.label)}|` : '';
		lines.push(`  ${ids.id(d.from)} -->${label} ${ids.id(d.to)}`);
	}

	const rows: DescriptionCell[][] = components.map(c => {
		const deps = dependencies.filter(d => d.from === c.id).map(d => nameOf.get(d.to) ?? d.to);
		return [c.label ?? c.id, c.path ?? null, deps.length > 0 ? deps.join(', ') : null, c.description ?? null];
	});
	return {
		title,
		kindLabel: COMPONENT_KIND_LABEL,
		...(compDef.narrative !== undefined ? { narrative: compDef.narrative } : {}),
		visual: { kind: 'mermaid', source: lines.join('\n') },
		description: [{
			heading: 'Components',
			lead: `${components.length} ${components.length === 1 ? 'component' : 'components'}, `
				+ `${dependencies.length} ${dependencies.length === 1 ? 'dependency' : 'dependencies'}. `
				+ 'An arrow points from a component to what it depends on.',
			columns: ['Component', 'Path', 'Depends on', 'Description'],
			rows,
		}],
	};
}

/** LLD-d9f85b3c S001/t9: LOW findings for a missing narrative and for components
 *  with no description. Never part of validateComponentDependencyDefinition. */
export function componentCompletenessFindings(compDef: ComponentDependencyDefinition): readonly DimensionFinding[] {
	const undescribed = (compDef.components ?? []).filter(c => !described(c.description)).map(c => `component ${c.id}`);
	return completenessFindings('diagram', 'componentDependencyDefinition', described(compDef.narrative), undescribed);
}
