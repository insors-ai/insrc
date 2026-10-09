/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** Small helpers the delivery client, the board protocol parser and the board host share. */
export const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** An error's message, or the thrown value as text. */
export const errorText = (err: unknown): string => (err instanceof Error ? err.message : String(err));
