/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Polls the daemon for live status. `pollMs = 0` fetches once (tests
 * pass 0 to avoid a live interval); `nonce` forces an immediate refetch
 * when the user hits `r`.
 */

import { useEffect, useState } from 'react';

import type { DaemonStatus } from '../../shared/types.js';
import { useServices } from '../ui/context.js';

export interface DaemonState {
	readonly status?:  DaemonStatus;
	readonly error?:   string;
	readonly loading:  boolean;
	readonly running:  boolean;
}

export function useDaemonStatus(pollMs = 2000, nonce = 0): DaemonState {
	const svc = useServices();
	const [state, setState] = useState<DaemonState>({ loading: true, running: false });

	useEffect(() => {
		let cancelled = false;
		const tick = async (): Promise<void> => {
			try {
				const status = await svc.daemon.getStatus();
				if (!cancelled) setState({ status, loading: false, running: true });
			} catch (err) {
				if (!cancelled) setState({ error: err instanceof Error ? err.message : String(err), loading: false, running: false });
			}
		};
		void tick();
		if (pollMs > 0) {
			const id = setInterval(() => void tick(), pollMs);
			return () => { cancelled = true; clearInterval(id); };
		}
		return () => { cancelled = true; };
	}, [svc, pollMs, nonce]);

	return state;
}
