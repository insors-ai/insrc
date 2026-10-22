/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The end of a conversion: sweep every head, and only when the sweep is clean write `.insrc/schema.json` at version 2. The marker
 * is the last write; the progress file of the apply goes after it. A head that is not clean blocks the marker and is listed, and
 * a rerun after the cause is fixed finishes the job.
 */

import { rmSync } from 'node:fs';
import { join } from 'node:path';

import { RepoSchemaGate, writeRepoSchema } from '../artifact-core/repo-schema.js';
import type { History } from '../artifact-core/history.js';
import { sweepHeads } from './sweep.js';
import type { SweepReport } from './sweep.js';
import { ConversionIncomplete } from './types.js';

export const CONVERTED_VERSION = 2;

/** The apply's record of where it started: the before-snapshot, kept so a run that stopped part-way can be resumed and still verified. */
export const PROGRESS_FILE = '.insrc/convert-progress.json';

/** Sweep, then write the marker. Throws ConversionIncomplete naming each head that is not clean, with the marker not written. */
export async function writeMarkerIfClean(repo: string, history: History, now: () => Date): Promise<SweepReport> {
	const report = await sweepHeads(repo, history);
	if (report.problems.length > 0) {
		throw new ConversionIncomplete(
			`${report.problems.length} of ${report.heads} heads are not in the converted state, so the marker was not written: ${report.problems.slice(0, 3).map(p => `${p.artifactId} ${p.reason}`).join('; ')}`,
			report.problems.map(p => ({ artifactId: p.artifactId, reason: p.reason })),
		);
	}
	if (RepoSchemaGate.read(repo).version < CONVERTED_VERSION) writeRepoSchema(repo, { version: CONVERTED_VERSION, convertedAt: now().toISOString() });
	rmSync(join(repo, PROGRESS_FILE), { force: true });
	return report;
}
