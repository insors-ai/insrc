/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The batched verdicts schema for `insrc_review_step`'s `emit_verdicts` turn.
 *
 * The engine judges premises ONE at a time (`VERIFY_SCHEMA` = one Finding
 * without its `claimId`). To keep the controller loop to a single turn, the
 * controller emits an ARRAY of those findings — one per claim, each carrying
 * its `claimId` so the server can re-key it. This wraps the engine's
 * `VERIFY_SCHEMA` item shape (unchanged) with a required `claimId`.
 */

import { VERIFY_SCHEMA } from '../../workflow/review/index.js';

const verifyItem = VERIFY_SCHEMA as { readonly required?: readonly string[]; readonly properties?: Record<string, unknown> };

const VERDICT_ITEM_SCHEMA: Record<string, unknown> = {
	type:                 'object',
	additionalProperties: false,
	required:             ['claimId', ...(verifyItem.required ?? [])],
	properties:           {
		claimId: { type: 'string', minLength: 1 },
		...(verifyItem.properties ?? {}),
	},
};

export const VERDICTS_SCHEMA: Record<string, unknown> = {
	type:                 'object',
	additionalProperties: false,
	required:             ['verdicts'],
	properties:           {
		verdicts: { type: 'array', items: VERDICT_ITEM_SCHEMA },
	},
};
