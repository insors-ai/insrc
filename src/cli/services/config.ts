/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Config service — read / write the on-disk `~/.insrc/config.json`
 * through the daemon (which owns it): `config.show` returns the whole
 * object, `config.write` sets a dot-path, `config.reload` re-reads it.
 */

import { rpc } from '../client.js';

export function showConfig(): Promise<Record<string, unknown>> {
	return rpc<Record<string, unknown>>('config.show');
}

export function writeConfig(path: string, value: unknown): Promise<{ ok: boolean }> {
	return rpc<{ ok: boolean }>('config.write', { path, value });
}

export function reloadConfig(): Promise<{ ok: boolean; reloaded?: unknown }> {
	return rpc<{ ok: boolean; reloaded?: unknown }>('config.reload');
}
