/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The schema guard at the daemon entry points: each refuses an unconverted repository, naming the conversion; repo.convert is exempt.
 *
 * Run: npx tsx --test src/daemon/__tests__/repo-schema-entry-points.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { IpcStreamMessage } from '../../shared/types.js';
import { handleAnalyzeStep } from '../steps/analyze-step/handler.js';
import { handleBuildStep } from '../steps/build-step/handler.js';
import { handleTriageStep } from '../steps/triage-step/handler.js';
import { handleWorkflowStep } from '../steps/workflow-step/handler.js';
import { codeReviewRunStart } from '../code-review-rpc.js';
import { listTemplatesRpc } from '../artifacts-rpc.js';
import { repoSchemaRefusalOfInput } from '../repo-schema-guard.js';
import { handleRepoConvert } from '../repo-convert.js';
import { handleTrackerAttach } from '../tracker-attach.js';
import { handleTrackerSyncComments } from '../tracker-sync-comments.js';
import { prepareWorkflowRun } from '../workflow-rpc.js';
import { workflowReviewStart } from '../workflow-review-rpc.js';

const NAMING = /schema version 1 but version 2 is needed.*repo\.convert/s;
const text = (env: { content: readonly { text: string }[] }): string => env.content[0]?.text ?? '';

async function frames(run: (send: (m: IpcStreamMessage) => void) => Promise<void>): Promise<string> {
	const out: IpcStreamMessage[] = [];
	await run(m => out.push(m));
	return JSON.stringify(out);
}
