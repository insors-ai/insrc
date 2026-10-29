/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The main thread's handler runtime, built on first need (Epic 86197ac6, Story s4): with daemon
 * threads, every request is served on a worker except those that must stay on the main thread
 * (a connection-scoped request, an unclassified method, the abort of a run started here). The
 * handler tables are built when the first of those arrives, so a daemon that never sees one never
 * builds them (the modules themselves are imported at boot). A build that fails answers that request with its error; the next one builds again.
 */

import { getLogger } from '../../shared/logger.js';
import type { ForwardRequest } from '../server.js';

const log = getLogger('lazy-runtime');

export interface LazyForward {
	/** Serves a request with the runtime, building it first if this is the first request. */
	readonly forward: ForwardRequest;
	/** Whether the runtime has been built. */
	readonly built: () => boolean;
}

/** A forward over the runtime `build` makes, built on its first request. */
export function lazyForward(build: () => ForwardRequest): LazyForward {
	let forward: ForwardRequest | undefined;
	return {
		forward: (request, deliver) => {
			if (forward === undefined) {
				try {
					forward = build();
					log.info({ method: request.method }, 'handler runtime built on the main thread');
				} catch (err) {
					const error = err instanceof Error ? err.message : String(err);
					log.error({ method: request.method, err: error }, 'handler runtime: the build failed; the next local request tries again');
					try {
						deliver(request.stream
							? { kind: 'frame', requestId: request.requestId, frame: { id: 0, stream: 'error', data: { error, recoverable: true } } }
							: { kind: 'reply', requestId: request.requestId, error });
					} finally { request.lifetime?.complete(); }
					return () => {};
				}
			}
			return forward(request, deliver);
		},
		built: () => forward !== undefined,
	};
}
