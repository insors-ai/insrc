/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The inline approval prompt (sc4): shows the exact call a tool is about to make, with the
 * repository, the arguments and the preview, and the time left, and takes the answer.
 * It is shown above the panes whenever a request is waiting; y / a approve, n / d decline.
 */

import { Box, Text, useInput } from 'ink';
import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';

import type { ApprovalRequest } from '../../shared/types.js';

export function secondsLeft(expiresAt: string, now: number = Date.now()): number {
	const ms = Date.parse(expiresAt) - now;
	return Number.isFinite(ms) ? Math.max(0, Math.ceil(ms / 1000)) : 0;
}

export function ApprovalPrompt(props: {
	request: ApprovalRequest;
	/** How many more requests wait behind this one. */
	more: number;
	/** Why the last answer did not go through, shown under the prompt. */
	notice?: string | undefined;
	onAnswer: (decision: 'approve' | 'decline') => void;
}): ReactElement {
	const { request: r } = props;
	const [left, setLeft] = useState(secondsLeft(r.expiresAt));
	useEffect(() => {
		setLeft(secondsLeft(r.expiresAt));
		const id = setInterval(() => setLeft(secondsLeft(r.expiresAt)), 1000);
		return () => clearInterval(id);
	}, [r.requestId, r.expiresAt]);
	useInput((input, key) => {
		const c = input.toLowerCase();
		if (c === 'y' || c === 'a') props.onAnswer('approve');
		else if (c === 'n' || c === 'd' || key.escape) props.onAnswer('decline');
	});
	const destructive = r.approvalClass === 'destructive';
	return (
		<Box flexDirection="column" borderStyle="round" borderColor={destructive ? 'red' : 'yellow'} paddingX={1}>
			<Text bold color={destructive ? 'red' : 'yellow'}>
				{destructive ? 'Approval needed (destructive)' : 'Approval needed'}: {r.toolId}
				{props.more > 0 ? <Text dimColor>  (+{props.more} more waiting)</Text> : null}
			</Text>
			<Text>Repository: {r.repoPath}</Text>
			<Text>Arguments: {JSON.stringify(r.arguments)}</Text>
			{r.preview !== undefined && <Text dimColor>{r.preview.title}: {r.preview.content}</Text>}
			<Text dimColor>{r.reason} · {left}s left</Text>
			{props.notice !== undefined && <Text color="red">{props.notice}</Text>}
			<Text><Text color="green">y</Text> approve   <Text color="red">n</Text> decline</Text>
		</Box>
	);
}
