/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The batched verdicts schema for `insrc_review_step`'s `emit_verdicts` turn. It
 * now lives beside the engine's VERIFY_SCHEMA (src/workflow/review/verify.ts, Epic
 * 8315a11f), so the review pipeline can offer it too; re-exported here.
 *
 * The engine judges premises ONE at a time (`VERIFY_SCHEMA` = one Finding
 * without its `claimId`). To keep the controller loop to a single turn, the
 * controller emits an ARRAY of those findings — one per claim, each carrying
 * its `claimId` so the server can re-key it. This wraps the engine's
 * `VERIFY_SCHEMA` item shape (unchanged) with a required `claimId`.
 */

export { VERDICTS_SCHEMA } from '../../../workflow/review/index.js';
