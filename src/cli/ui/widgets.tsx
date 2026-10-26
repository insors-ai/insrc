/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** Shared presentational widgets for the TUI. */

import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { useState } from 'react';
import type { ReactElement, ReactNode } from 'react';

/** A bordered pane with a title; cyan border when active. */
export function Panel(props: { title: string; active?: boolean; children: ReactNode }): ReactElement {
	return (
		<Box flexDirection="column" borderStyle="round" borderColor={props.active === true ? 'cyan' : 'gray'} paddingX={1} flexGrow={1}>
			<Box marginBottom={1}>
				<Text bold color={props.active === true ? 'cyan' : 'white'}>{props.title}</Text>
			</Box>
			{props.children}
		</Box>
	);
}

/** Footer of `key: label` hints. */
export function KeyHints(props: { hints: readonly (readonly [string, string])[] }): ReactElement {
	return (
		<Box>
			{props.hints.map(([k, label], i) => (
				<Text key={k} dimColor>
					{i > 0 ? '   ' : ''}<Text color="yellow">{k}</Text> {label}
				</Text>
			))}
		</Box>
	);
}

/** A modal single-line text field. Enter submits, Esc cancels. */
export function TextPrompt(props: {
	label: string;
	initial?: string;
	onSubmit: (value: string) => void;
	onCancel: () => void;
}): ReactElement {
	const [value, setValue] = useState(props.initial ?? '');
	useInput((_input, key) => { if (key.escape) props.onCancel(); });
	return (
		<Box>
			<Text color="cyan">{props.label} </Text>
			<TextInput value={value} onChange={setValue} onSubmit={() => props.onSubmit(value)} />
		</Box>
	);
}

/** A modal yes/no confirm. */
export function ConfirmPrompt(props: { label: string; onYes: () => void; onNo: () => void }): ReactElement {
	useInput((input, key) => {
		const c = input.toLowerCase();
		if (c === 'y') props.onYes();
		else if (c === 'n' || key.escape) props.onNo();
	});
	return <Text color="yellow">{props.label} <Text dimColor>[y/N]</Text></Text>;
}

/** Scrolling tail of log lines (keeps the last `max`). */
export function LogView(props: { lines: readonly string[]; max?: number }): ReactElement {
	const max = props.max ?? 12;
	const tail = props.lines.slice(-max);
	return (
		<Box flexDirection="column">
			{tail.map((line, i) => <Text key={i} dimColor>{line}</Text>)}
		</Box>
	);
}
