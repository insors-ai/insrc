/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * `insrc_guide` handler — a thin MCP wrapper over the daemon guide IPC (the
 * docgen precedent). It imports ONLY the daemon guide clients (no direct
 * file/DB access — the daemon owns the steering content): a present workflow
 * forwards to `guide.get`, an omitted workflow forwards to `guide.list` and is
 * shaped as a structured InsrcGuideError. A miss never throws (k3); a transport
 * failure (daemon unreachable) is surfaced as a clean `isError` envelope, as in
 * handleDocgen.
 */

import { getLogger } from '../../shared/logger.js';
import { guideGet, guideList, type UnaryRpcDeps } from '../daemon-stream.js';
import type { InsrcGuideInput, InsrcGuideResult } from '../../daemon/guide-sections.js';

const log = getLogger('mcp:guide');

interface GuideEnvelope {
	readonly content: { readonly type: 'text'; readonly text: string }[];
	readonly isError?: boolean;
}

/** Retrieve one workflow's guidance, or the valid-workflows list on a miss. */
export async function handleInsrcGuide(
	args: InsrcGuideInput,
	deps: UnaryRpcDeps = {},
): Promise<GuideEnvelope> {
	// Trim so a whitespace-only workflow is treated as omitted (ac2), not forwarded.
	const workflow = typeof args.workflow === 'string' ? args.workflow.trim() : '';

	try {
		let result: InsrcGuideResult;
		if (workflow.length === 0) {
			// No workflow named: hand back the list so the controller can re-ask (ac2).
			const { workflows } = await guideList(deps);
			result = { error: 'workflow is required', validWorkflows: workflows };
		} else {
			result = await guideGet({ workflow }, deps);
		}
		return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
	} catch (err) {
		// Transport failure (daemon unreachable) — surface a clean, actionable
		// envelope rather than a raw rejection, mirroring handleDocgen.
		const msg = err instanceof Error ? err.message : String(err);
		log.warn({ err: msg }, 'insrc_guide: daemon call failed');
		return {
			content: [{ type: 'text', text: `insrc_guide: could not reach the daemon (${msg}). Is it running?` }],
			isError: true,
		};
	}
}
