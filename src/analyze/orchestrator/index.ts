/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Orchestrator -- barrel.
 *
 * Public surface:
 *   - runAnalyze(args): drives the full pipeline end-to-end
 *   - readRunRecord(runId): read <runRoot>/run.json
 *   - runRecordPathFor(runId): persistence path helper
 *   - Types: RunAnalyzeArgs, RunAnalyzeResult, RunFailure, RunRecord,
 *            RunErrorCode, RunStage
 *
 * The daemon RPC layer (analyze.run.start, etc.) lives in
 * daemon/analyze-rpc.ts and wraps runAnalyze for the wire surface.
 */

export { runAnalyze } from './driver.js';
export {
	readRunRecord,
	runRecordPathFor,
	writeRunRecord,
	purgeRun,
	purgeRunForTests,
	type PurgeRunResult,
	type PurgeRunRefused,
} from './persistence.js';
export type {
	RunAnalyzeArgs,
	RunAnalyzeOpts,
	RunAnalyzeResult,
	RunAnalyzeOk,
	RunAnalyzeFail,
	RunErrorCode,
	RunFailure,
	RunRecord,
	RunStage,
	AnalyzeRunEvent,
} from './types.js';
