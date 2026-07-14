/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Runtime-registry bootstrap.
 *
 * Registers every per-target runtime with the executor's template-
 * runtime registry. Idempotent within a process (latch-protected
 * to match the template-catalog bootstrap pattern at
 * analyze/planner/templates/bootstrap.ts).
 *
 * Called by the daemon at startup (alongside registerBuiltinTemplates).
 * Tests that need a clean slate call _resetRuntimeBootstrapLatchForTests
 * + _resetRuntimeRegistryForTests before re-registering.
 */

import { getLogger } from '../../shared/logger.js';

import {
	registerTemplateRuntime,
	_resetRuntimeRegistryForTests,
} from '../executor/registry.js';
import type { TemplateRuntime } from '../executor/types.js';

import { CODE_RUNTIMES    } from './code/index.js';
import { DATA_RUNTIMES    } from './data/index.js';
import { INFRA_RUNTIMES   } from './infra/index.js';
import { GENERIC_RUNTIMES } from './generic/index.js';
import { DOCS_RUNTIMES    } from './docs/index.js';

const log = getLogger('analyze:runtimes:bootstrap');

let LATCHED = false;

/**
 * Register every implemented per-target runtime with the executor's
 * registry. Safe to call multiple times -- second + later calls are
 * no-ops.
 *
 * Order: code -> (data -> infra -> generic, as those families land).
 */
export function registerBuiltinRuntimes(): void {
	if (LATCHED) {
		log.debug('registerBuiltinRuntimes: already latched (no-op)');
		return;
	}
	LATCHED = true;

	const families: ReadonlyArray<{ name: string; runtimes: readonly TemplateRuntime[] }> = [
		{ name: 'code',    runtimes: CODE_RUNTIMES    },
		{ name: 'data',    runtimes: DATA_RUNTIMES    },
		{ name: 'infra',   runtimes: INFRA_RUNTIMES   },
		{ name: 'generic', runtimes: GENERIC_RUNTIMES },
		{ name: 'docs',    runtimes: DOCS_RUNTIMES    },
	];

	let total = 0;
	for (const fam of families) {
		for (const rt of fam.runtimes) {
			registerTemplateRuntime(rt);
			total++;
		}
		log.debug({ family: fam.name, count: fam.runtimes.length }, 'family runtimes registered');
	}
	log.info({ total }, 'analyze runtimes registered');
}

// ---------------------------------------------------------------------------
// Test hooks
// ---------------------------------------------------------------------------

export function _resetRuntimeBootstrapLatchForTests(): void {
	LATCHED = false;
	_resetRuntimeRegistryForTests();
}
