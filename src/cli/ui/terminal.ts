/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** The narrow output contract needed to clear a terminal before Ink mounts. */
export interface TerminalOutput {
	write(chunk: string): unknown;
}

/** Clear the visible screen and move the cursor to the top-left corner. */
export function clearTerminal(output: TerminalOutput): void {
	output.write('\u001B[2J\u001B[H');
}
