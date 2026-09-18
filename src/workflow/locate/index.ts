/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * S003 / sc3 — public surface of the tiered parent-locator.
 *
 * Consumers (s4 orchestration, s5 GitHub) import from here. The daemon-only
 * `infer-daemon.ts` (which pulls DB imports) is intentionally NOT re-exported —
 * the daemon IPC handler imports it directly; the controller stays DB-free.
 */

export * from './types.js';
export { locateParent } from './locate-parent.js';
export {
	inferParentCandidates,
	refFromDocPath,
	DEFAULT_SEMANTIC_K,
	type InferencePorts,
} from './infer.js';
export {
	buildOwnershipIndex,
	matchGraphCandidates,
	workItemKey,
	refPath,
	type OwnershipIndex,
} from './ownership.js';

import type { InferParentsRequest, InferredCandidates } from './types.js';

/** The IPC method name the controller calls to reach the daemon inference. */
export const LOCATE_INFER_PARENTS_METHOD = 'locate.inferParents';

/**
 * Adapt a generic IPC call function into the `inferCandidates` collaborator the
 * controller policy (`locateParent`) needs. The caller supplies however it talks
 * to the daemon (a bound RPC client); this keeps the locator decoupled from any
 * concrete client type. Rule 1: the DB-bound inference runs daemon-side; this
 * shim only forwards the request.
 */
export function daemonInferCandidates(
	call: (method: string, params: unknown) => Promise<unknown>,
): (req: InferParentsRequest) => Promise<InferredCandidates> {
	return async (req: InferParentsRequest): Promise<InferredCandidates> => {
		const res = await call(LOCATE_INFER_PARENTS_METHOD, req);
		return res as InferredCandidates;
	};
}
