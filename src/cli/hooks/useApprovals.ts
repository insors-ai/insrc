/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The approval requests waiting for this terminal's answer. Opens the daemon's approval stream
 * for as long as the app is mounted; with no watcher in the services (a test double) it is empty.
 */

import { useEffect, useState } from 'react';

import type { ApprovalRequest } from '../../shared/types.js';
import { useServices } from '../ui/context.js';

export function useApprovals(): { readonly pending: readonly ApprovalRequest[]; answer(requestId: string, decision: 'approve' | 'decline'): void } {
	const watcher = useServices().approvals;
	const [pending, setPending] = useState<readonly ApprovalRequest[]>(watcher?.pending() ?? []);
	useEffect(() => {
		if (watcher === undefined) return;
		const off = watcher.subscribe(() => setPending([...watcher.pending()]));
		watcher.start();
		return () => { off(); watcher.stop(); };
	}, [watcher]);
	return {
		pending,
		answer: (requestId, decision) => { void watcher?.answer(requestId, decision).catch(() => { /* the daemon went away; the prompt is already gone */ }); },
	};
}
