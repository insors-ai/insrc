/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The indexing port's internal methods (Epic 86197ac6, Story s2): what the
 * main thread (and the document-summary worker) ask of the code-indexing
 * worker, which owns the index queue, the indexer and the watcher. They are
 * served beside the indexing-class methods but are not in the method-class
 * table, so a client socket cannot reach them.
 */

export const INDEXING_PORT = {
	enqueue:            'indexing.port.enqueue',
	codeIndexWorkFor:   'indexing.port.codeIndexWorkFor',
	depthForRepo:       'indexing.port.depthForRepo',
	addRepo:            'indexing.port.addRepo',
	removeRepo:         'indexing.port.removeRepo',
	takeDocSummaryEdit: 'indexing.port.takeDocSummaryEdit',
} as const;

/** The main thread tells the code-indexing worker to stop its queue and watcher (shutdown). */
export const INDEXING_STOP_OP = 'indexing.stop';
/** The code-indexing worker reports that its queue has drained after a stop. */
export const INDEXING_DRAINED = 'indexing-drained';
