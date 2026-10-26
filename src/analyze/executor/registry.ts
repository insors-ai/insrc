/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Template-runtime registry.
 *
 * Process-singleton mapping templateId -> TemplateRuntime. Per-target
 * runtime modules (code/discovery.ts, data/schema.ts, infra/inventory.ts,
 * ...) self-register at boot via `registerTemplateRuntime`.
 *
 * The executor calls `getRuntime(templateId)` per leaf task; the
 * `runtime-missing` error path fires when a registered template id
 * has no runtime registered.
 */

import { assertAnalysisConnectionExecution } from '../connection-access.js';
import { ConnectionExecutionError } from '../../shared/step-context.js';
import type { ConnectionExecutionContext } from '../../shared/step-context.js';
import { getLogger } from '../../shared/logger.js';

import type { TemplateRuntime } from './types.js';

const log = getLogger('analyze:executor:registry');

let sessionReadOnly = new WeakMap<TemplateRuntime, TemplateRuntime['execute']>();
const REGISTRY = new Map<string, TemplateRuntime>();

export class TemplateRuntimeRegistrationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'TemplateRuntimeRegistrationError';
	}
}

/**
 * Register a runtime. Throws on id collision -- per the template
 * registry's same-shape rule, two runtimes for the same templateId
 * is a programming error (the second registration would silently
 * shadow the first otherwise).
 */
export function registerTemplateRuntime(runtime: TemplateRuntime, admission?: { readonly sessionMemory: 'read-only' }): void {
	if (REGISTRY.has(runtime.templateId)) {
		throw new TemplateRuntimeRegistrationError(
			`runtime collision for template '${runtime.templateId}': already registered`,
		);
	}
	if (admission?.sessionMemory === 'read-only') { Object.freeze(runtime); sessionReadOnly.set(runtime, runtime.execute); }
	else sessionReadOnly.delete(runtime);
	REGISTRY.set(runtime.templateId, runtime);
	log.debug({ templateId: runtime.templateId }, 'template runtime registered');
}

export function getRuntime(templateId: string): TemplateRuntime | undefined {
	return REGISTRY.get(templateId);
}

export function listRegisteredRuntimes(): readonly string[] {
	return Array.from(REGISTRY.keys()).sort();
}

/** Test-only -- wipes the runtime registry. */
export function _resetRuntimeRegistryForTests(): void {
	REGISTRY.clear();
	sessionReadOnly = new WeakMap();
}

/** Registration is daemon source code, never a task param or caller-supplied kind string. */
export function assertRuntimeExecution(runtime: TemplateRuntime, execution?: ConnectionExecutionContext): void {
	assertAnalysisConnectionExecution(execution);
	if (execution?.mode === 'session-memory') {
		const approved = sessionReadOnly.get(runtime);
		if (!approved || approved !== runtime.execute) throw new ConnectionExecutionError('unsupported-temporary');
	}
}
