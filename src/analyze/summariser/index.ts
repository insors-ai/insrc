/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Doc summariser -- barrel.
 *
 * plans/docs-module.md Section 8. Public surface:
 *   - summariseDoc(args): drives a single-entity summarisation
 *   - inferDocFamily(file): path-based family classifier
 *   - DOC_SUMMARISER_PROMPT_PATH: for the boot validator
 *
 * The indexer's job processor calls `summariseDoc` per-entity;
 * downstream consumers read summaries via `db/doc-summaries.ts`.
 */

export {
	summariseDoc,
	DocSummariserPromptMissingError,
	DOC_SUMMARISER_PROMPT_PATH,
} from './driver.js';
export type {
	SummariseDocArgs,
	SummariseDocResult,
} from './driver.js';

export { inferDocFamily } from './family.js';
