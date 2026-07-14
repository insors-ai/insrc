/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Template-registry bootstrap.
 *
 * Called once at daemon boot. Each per-target module registers its
 * own templates side-effect-free; this bootstrap chains them so the
 * daemon's startup sequence has one entry point to call.
 *
 * Order is not significant -- the registry rejects id collisions at
 * registerTemplate() time.
 */

import { getLogger } from '../../../shared/logger.js';

import { getTemplateCatalog } from './registry.js';
import { registerCodeTemplates    } from './code/index.js';
import { registerDataTemplates    } from './data/index.js';
import { registerInfraTemplates   } from './infra/index.js';
import { registerGenericTemplates } from './generic/index.js';
import { registerDocsTemplates    } from './docs/index.js';

const log = getLogger('analyze:planner:templates:bootstrap');

let _bootstrapped = false;

export function registerBuiltinTemplates(): void {
	if (_bootstrapped) {
		log.debug('analyze templates already registered; skipping');
		return;
	}
	registerCodeTemplates();
	registerDataTemplates();
	registerInfraTemplates();
	registerGenericTemplates();
	registerDocsTemplates();
	_bootstrapped = true;
	log.info({ count: getTemplateCatalog().length }, 'analyze templates registered');
}

/** Test-only -- resets the bootstrap latch so the next call re-runs. */
export function _resetTemplateBootstrapLatchForTests(): void {
	_bootstrapped = false;
}
