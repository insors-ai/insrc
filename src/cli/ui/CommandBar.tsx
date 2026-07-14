/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The vim-style `:` command bar. Accumulated output renders above a
 * single-line input; Enter runs a command (staying open for the next,
 * REPL-style), Esc closes. While a command runs the input is replaced
 * by a `running…` marker.
 */

import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { useState } from 'react';
import type { ReactElement } from 'react';

export function CommandBar(props: {
	output: readonly string[];
	running: boolean;
	onSubmit: (line: string) => void;
	onClose: () => void;
}): ReactElement {
	const [value, setValue] = useState('');
	useInput((_input, key) => { if (key.escape) props.onClose(); });
	return (
		<Box flexDirection="column">
			{props.output.length > 0 && (
				<Box flexDirection="column" marginBottom={1}>
					{props.output.slice(-14).map((line, i) => <Text key={i} dimColor>{line}</Text>)}
				</Box>
			)}
			<Box>
				<Text color="cyan">:</Text>
				{props.running
					? <Text dimColor> running…</Text>
					: <TextInput value={value} onChange={setValue} onSubmit={v => { setValue(''); props.onSubmit(v); }} />}
			</Box>
			{!props.running && <Text dimColor>Enter run · Esc close · type `help`</Text>}
		</Box>
	);
}
