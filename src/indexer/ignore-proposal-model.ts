/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The cheap-tier model the daemon hands `IndexerService` for
 * `proposeIgnoreFile` (Epic c2ba6fa6 s6/ac6): a repository added with no root
 * ignore file gets one proposed by the CHEAP tier (user decision 2026-10-10).
 *
 * The proposal is a background indexing call like document summaries, so it
 * is built exactly as the summariser's provider is — strictly from the cheap
 * tier's runner and model, never from the interactive shaper or a per-run
 * client default. The provider is resolved on each call, so a tier change in
 * config applies to the next repository added without a daemon restart; a
 * resolution failure rejects like any model failure, and `proposeIgnoreFile`
 * writes its plain fallback file instead (ac7).
 */

import { buildSummariserProvider } from '../analyze/context/shaper-provider.js';
import { loadAnalyzeConfig } from '../config/analyze.js';
import type { CompletionOpts, LLMMessage, LLMResponse } from '../shared/types.js';
import type { CheapTierModel } from './file-filter.js';

export function cheapTierIgnoreModel(build: () => CheapTierModel = () => buildSummariserProvider(loadAnalyzeConfig())): CheapTierModel {
	return {
		complete: async (messages: LLMMessage[], opts?: CompletionOpts): Promise<LLMResponse> => build().complete(messages, opts),
	};
}
