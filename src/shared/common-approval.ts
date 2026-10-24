/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The global setting for the common approval class: `tools.commonApproval` in
 * `~/.insrc/config.json` ('manual' | 'edit-auto' | 'auto', default 'auto'). Read on each
 * call, so a change takes effect without a restart. A missing file, a missing key or an
 * unknown value gives 'auto'; an unknown value is also logged.
 */

import { existsSync, readFileSync } from 'node:fs';

import { getLogger } from './logger.js';
import { PATHS } from './paths.js';

const log = getLogger('common-approval');

export type CommonApprovalSetting = 'manual' | 'edit-auto' | 'auto';
const MODES: readonly CommonApprovalSetting[] = ['manual', 'edit-auto', 'auto'];

export function readCommonApprovalMode(configPath: string = PATHS.config): CommonApprovalSetting {
	if (!existsSync(configPath)) return 'auto';
	let value: unknown;
	try {
		const parsed = JSON.parse(readFileSync(configPath, 'utf8')) as { tools?: { commonApproval?: unknown | undefined } | undefined };
		value = parsed.tools?.commonApproval;
	} catch (err) {
		log.warn({ configPath, err: (err as Error).message }, 'config.json cannot be read; tools.commonApproval defaults to auto');
		return 'auto';
	}
	if (value === undefined) return 'auto';
	if (typeof value === 'string' && (MODES as readonly string[]).includes(value)) return value as CommonApprovalSetting;
	log.warn({ value }, "tools.commonApproval has an unknown value; using 'auto'");
	return 'auto';
}
