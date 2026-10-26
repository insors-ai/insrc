/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Models service (Epic ce99b72065d03b1b, Story s5) — the TUI's only route to the
 * daemon's model definitions (sc3), the unknown-model check and decisions (sc4)
 * and role resolution (sc5). Each method is one daemon request; nothing is
 * computed or held here (k2). Only types are imported from the daemon modules.
 */

import type { ModelDefinitionsResult, ResolvedRole } from '../../daemon/model-definitions.js';
import type { DecisionResult, InvalidParams, ModelCheckResult } from '../../daemon/model-check.js';
import type { CliFamilyId, EffortLevel } from '../../daemon/model-catalog.js';
import { rpc } from '../client.js';

export type { ModelDefinitionsResult, ResolvedRole, DecisionResult, InvalidParams, ModelCheckResult };

/** One daemon request; the default is the shared socket client. */
export type Rpc = <T>(method: string, params?: unknown) => Promise<T>;

export interface ModelsService {
	definitions(): Promise<ModelDefinitionsResult>;
	check(p: { family: CliFamilyId; modelId: string; claimedEfforts: readonly EffortLevel[] }): Promise<ModelCheckResult | InvalidParams>;
	approve(p: { checkId: string; efforts: readonly EffortLevel[] }): Promise<DecisionResult>;
	reject(p: { checkId: string }): Promise<DecisionResult>;
	resolveRole(p: { role: string; repoPath: string }): Promise<ResolvedRole | InvalidParams>;
}

export function modelsService(call: Rpc = rpc): ModelsService {
	return {
		definitions: () => call<ModelDefinitionsResult>('models.definitions', {}),
		check:       p => call<ModelCheckResult | InvalidParams>('models.check', p),
		approve:     p => call<DecisionResult>('models.approve', p),
		reject:      p => call<DecisionResult>('models.reject', p),
		resolveRole: p => call<ResolvedRole | InvalidParams>('models.resolveRole', p),
	};
}

/** Why a daemon request got no answer, in the user's terms: the daemon is not
 *  running (`down`); the connection was lost; or the daemon refused — an older
 *  daemon may not know the request, so that case names the update. */
export function daemonProblem(err: unknown): { readonly down: boolean; readonly text: string } {
	const message = err instanceof Error ? err.message : String(err);
	if (message.startsWith('daemon is not running')) return { down: true, text: 'the daemon is not running' };
	if (typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'disconnected') {
		return { down: false, text: 'the daemon closed the connection before answering' };
	}
	return { down: false, text: `the daemon could not answer: ${message} — if it is older than this TUI, update it (daemon update)` };
}
