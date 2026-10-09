/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** One macrotask tick: lets every already-settled promise chain in the host run. */
export const flush = (): Promise<void> => new Promise<void>(r => setImmediate(r));
