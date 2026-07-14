/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Builtin tools -- registration aggregator.
 *
 * One entry point for daemon/index.ts. Each domain plugs in via its
 * `registerXTools()` call; every domain registers unconditionally.
 *
 * Cleanup: removed `diff`, `plan`, `artifact`, `skills`, `llm-aliases`.
 * The diff + plan + artifact tools were agent-orchestration-specific;
 * the skills tool wrapped the dead skill registry; the llm-aliases
 * mapped legacy LLM names (Read/Grep/Bash/...) onto canonical tool
 * ids, which the next backend can reintroduce if needed.
 */

import { registerGitTools } from './git/index.js';
import { registerFileTools } from './file/index.js';
import { registerShellTools } from './shell/index.js';
import { registerSearchTools } from './search/index.js';
import { registerGhTools } from './gh/index.js';
import { registerSshTools } from './ssh/index.js';
import { registerHttpTools } from './http/index.js';
import { registerK8sTools } from './k8s/index.js';
import { registerCloudTools } from './cloud/index.js';
import { registerNotifyTools } from './notify/index.js';
import { registerTestTools } from './test/index.js';
import { registerPkgTools } from './pkg/index.js';
import { registerWebTools } from './web/index.js';
import { registerGraphTools } from './graph/index.js';
import { registerDbTools } from './db/index.js';
import { registerDataTools } from './data/index.js';
import { registerCodeTools } from './code/index.js';
import { registerDocsTools } from './docs/index.js';

export function registerBuiltinTools(): void {
	registerGitTools();
	registerFileTools();
	registerShellTools();
	registerSearchTools();
	registerGhTools();
	registerSshTools();
	registerHttpTools();
	registerK8sTools();
	registerCloudTools();
	registerNotifyTools();
	registerTestTools();
	registerPkgTools();
	registerWebTools();
	registerGraphTools();
	registerDbTools();
	registerDataTools();
	registerCodeTools();
	registerDocsTools();
}
