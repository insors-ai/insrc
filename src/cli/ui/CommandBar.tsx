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

import { Box, Text, useInput, useStdout } from 'ink';
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
	const { stdout } = useStdout();
	useInput((_input, key) => { if (key.escape) props.onClose(); });
	// Show as much output as the terminal has room for (leave space for
	// the header, input line, and hints). Truncate from the TOP so the
	// most recent lines stay visible; note how many were hidden.
	const rows = stdout?.rows ?? 24;
	const maxLines = Math.max(6, rows - 7);
	const hidden = Math.max(0, props.output.length - maxLines);
	const shown = props.output.slice(-maxLines);
	return (
		<Box flexDirection="column">
			{props.output.length > 0 && (
				<Box flexDirection="column" marginBottom={1}>
					{hidden > 0 && <Text dimColor>… {hidden} more line{hidden === 1 ? '' : 's'} above (narrow with a search term, e.g. `config list models.tiers`)</Text>}
					{shown.map((line, i) => <Text key={i} dimColor>{line}</Text>)}
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
