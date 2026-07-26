/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Re-export shim. The catalog's single definition site is
 * src/config/config-catalog.ts (moved there so the daemon-boot reconcile
 * can reach it without a daemon→cli import edge). The CLI command bar's
 * `config list` imports it from here; keep this file declaration-free so
 * there is exactly one CONFIG_CATALOG array in the program.
 */

export { CONFIG_CATALOG } from '../config/config-catalog.js';
export type { ConfigOption } from '../config/config-catalog.js';
