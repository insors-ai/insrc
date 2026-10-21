/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** The shape checks of a TASK and a TASKS body (s7), run by the kind codecs on every read and write. */

import { ArtifactShapeError } from './types.js';

const SIZES: readonly unknown[] = ['S', 'M', 'L'];
const LEVELS: readonly unknown[] = ['unit', 'integration', 'live', 'smoke'];

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === 'string');
const isCount = (v: unknown, min: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min;

/** Throws ArtifactShapeError naming the first field of a TASK body that is missing or the wrong type. */
export function checkTaskBody(body: unknown, where: string): void {
	const fail = (field: string, want: string): never => { throw new ArtifactShapeError(`${where} has no valid ${field} (${want})`); };
	if (!isObject(body)) return fail('body', 'an object');
	if (!isText(body['title'])) fail('title', 'a non-empty string');
	if (!isText(body['summary'])) fail('summary', 'a non-empty string');
	if (!SIZES.includes(body['size'])) fail('size', 'S, M or L');
	if (!isCount(body['order'], 1)) fail('order', 'an integer from 1');
	if (!isStrings(body['acceptanceChecks'])) fail('acceptanceChecks', 'a list of strings');
	const tests = body['tests'];
	if (!Array.isArray(tests) || !tests.every(t => isObject(t) && LEVELS.includes(t['level']) && isText(t['name']))) fail('tests', 'a list of { level, name }');
	if (!isText(body['planTaskId']) || !/^t[1-9]\d*$/.test(body['planTaskId'] as string)) fail('planTaskId', 'a plan row id such as t1');
}

/** Throws ArtifactShapeError naming the first field of a TASKS body that is missing or the wrong type. */
export function checkTasksBody(body: unknown, where: string): void {
	const fail = (field: string, want: string): never => { throw new ArtifactShapeError(`${where} has no valid ${field} (${want})`); };
	if (!isObject(body)) return fail('body', 'an object');
	if (!isCount(body['planRevision'], 1)) fail('planRevision', 'an integer from 1');
	if (!isStrings(body['taskIds'])) fail('taskIds', 'a list of Task ids');
	if (!isCount(body['nextNumber'], 1)) fail('nextNumber', 'an integer from 1');
}
