/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The vim-style `:` command bar — input only. Enter runs a command (staying
 * open for the next, REPL-style), Esc closes. While a command runs the input is
 * replaced by a `running…` marker. Command output + errors stream into the
 * shared bottom message box (owned by app.tsx), not here.
 */

import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { useState } from 'react';
import type { ReactElement } from 'react';

export function CommandBar(props: {
	running: boolean;
	onSubmit: (line: string) => void;
	onClose: () => void;
}): ReactElement {
	const [value, setValue] = useState('');
	useInput((_input, key) => { if (key.escape) props.onClose(); });
	return (
		<Box flexDirection="column">
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
