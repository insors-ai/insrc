/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Config service — read / write the on-disk `~/.insrc/config.json`
 * through the daemon (which owns it): `config.show` returns the whole
 * object, `config.write` sets a dot-path, `config.reload` re-reads it.
 */

import type { SettingsCatalogPayload } from '../../config/settings-catalog.js';
import type { SettingsResult } from '../../daemon/repo-settings.js';
import { rpc } from '../client.js';

export function showConfig(): Promise<Record<string, unknown>> {
	return rpc<Record<string, unknown>>('config.show');
}

/** Set a config value. `path` is a dot-string for the common dot-free case, OR
 *  an array of literal segments when a key contains dots (e.g.
 *  `['models','tasks','context.assemble']`) — the daemon splits a
 *  string on '.', so a dotted key MUST be passed segmented. */
export function writeConfig(path: string | string[], value: unknown): Promise<{ ok: boolean }> {
	return rpc<{ ok: boolean }>('config.write', { path, value });
}

export function reloadConfig(): Promise<{ ok: boolean; reloaded?: unknown }> {
	return rpc<{ ok: boolean; reloaded?: unknown }>('config.reload');
}

/** The self-describing catalog, including `repoFields` (the repo-scoped tracker rows). */
export function getCatalog(): Promise<SettingsCatalogPayload> {
	return rpc<SettingsCatalogPayload>('config.catalog');
}

/** A repo's tracker settings, sign-in status and policy rows. Business errors come back as data. */
export function getRepoSettings(repo: string): Promise<SettingsResult> {
	return rpc<SettingsResult>('repo.settings.get', { repo });
}

/** Set (or, with `null`, clear) one local tracker row of a repo. The daemon is the only writer of github.json. */
export function setRepoSetting(repo: string, key: string, value: string | boolean | null): Promise<SettingsResult> {
	return rpc<SettingsResult>('repo.settings.set', { repo, key, value });
}
