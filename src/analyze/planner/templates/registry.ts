/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Template registry -- process-singleton store of every registered
 * AnalyzeTaskTemplate the Plan Builder may pick from.
 *
 * Templates self-register at module load via `registerTemplate(t)`;
 * the daemon's boot sequence imports `./bootstrap.js` once at
 * startup, which pulls every per-target template barrel and side-
 * effects them into the registry.
 *
 * The Plan Builder's validator (P0) consumes `getTemplateCatalog()`
 * or its target-filtered variant; the Plan Builder's LLM driver
 * (later phase) renders the catalog into the planner prompt.
 *
 * See: design/analyze-framework.md "Template definition"
 *      design/analyze-plan-builder.md "Param resolution from context"
 */

import { getLogger } from '../../../shared/logger.js';
import type { AnalyzeTarget, AnalyzeTaskTemplate } from '../../../shared/analyze-types.js';

const log = getLogger('analyze:planner:templates');

const REGISTRY = new Map<string, AnalyzeTaskTemplate>();

export class TemplateRegistrationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'TemplateRegistrationError';
	}
}

/**
 * Register a template. Throws on:
 *   - id collision (a template with this id is already registered)
 *   - missing required fields (inputSchema, produces, description)
 *     -- aggregator templates must additionally set isAggregator:true
 *
 * Templates are validated at registration time so a programming
 * error in a per-target module surfaces at daemon boot, not at the
 * first Plan Builder invocation.
 */
export function registerTemplate(t: AnalyzeTaskTemplate): void {
	if (REGISTRY.has(t.id)) {
		throw new TemplateRegistrationError(
			`template id collision: '${t.id}' already registered`,
		);
	}
	if (t.inputSchema === undefined) {
		throw new TemplateRegistrationError(
			`template '${t.id}': inputSchema is required`,
		);
	}
	if (t.produces === undefined || t.produces.length === 0) {
		throw new TemplateRegistrationError(
			`template '${t.id}': produces must be a non-empty array`,
		);
	}
	if (t.description === undefined || t.description.length === 0) {
		throw new TemplateRegistrationError(
			`template '${t.id}': description is required`,
		);
	}
	// Aggregators MUST flag isAggregator:true so INV-12 (exactly one
	// aggregator, must be last) dispatches correctly. We accept either
	// convention-based naming OR the explicit flag, but the flag is
	// authoritative.
	if (t.family === 'aggregate' && t.isAggregator !== true) {
		throw new TemplateRegistrationError(
			`template '${t.id}': family='aggregate' templates must set isAggregator:true`,
		);
	}
	if (t.isAggregator === true && t.family !== 'aggregate') {
		throw new TemplateRegistrationError(
			`template '${t.id}': isAggregator:true requires family='aggregate'`,
		);
	}
	REGISTRY.set(t.id, t);
	log.debug({ id: t.id, target: t.target, kind: t.kind, family: t.family }, 'template registered');
}

/** Return the full catalog as a stable array (sorted by id for determinism). */
export function getTemplateCatalog(): readonly AnalyzeTaskTemplate[] {
	return Array.from(REGISTRY.values()).sort((a, b) => (a.id < b.id ? -1 : 1));
}

/**
 * Return templates whose target is acceptable for a plan of
 * `planTarget`. A `generic` plan accepts every template (per INV-4),
 * so this returns the full catalog.
 */
export function getTemplatesForTarget(planTarget: AnalyzeTarget): readonly AnalyzeTaskTemplate[] {
	if (planTarget === 'generic') {
		return getTemplateCatalog();
	}
	return getTemplateCatalog().filter(t => t.target === planTarget);
}

/** Get a single template by id, or undefined when not registered. */
export function getTemplate(id: string): AnalyzeTaskTemplate | undefined {
	return REGISTRY.get(id);
}

/**
 * Return the aggregator template for a given target, or undefined
 * when none is registered. INV-12 requires every Plan to end with
 * one; the Plan Builder uses this lookup to surface a useful error
 * when the catalog is missing the per-target aggregator.
 */
export function getAggregatorFor(target: AnalyzeTarget): AnalyzeTaskTemplate | undefined {
	return getTemplateCatalog().find(t => t.target === target && t.isAggregator === true);
}

/** Test-only -- wipes the registry. */
export function _resetTemplateRegistryForTests(): void {
	REGISTRY.clear();
}
