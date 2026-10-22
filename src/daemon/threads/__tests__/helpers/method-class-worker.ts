/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Worker for method-class.test.ts: loads the method-class registry alone on a
// worker thread and reports what it answers.
import { parentPort } from 'node:worker_threads';

import { methodClasses } from '../../method-class.js';

parentPort!.postMessage({
	status: methodClasses.classOf('daemon.status'),
	reindex: methodClasses.classOf('repo.reindex'),
	step: methodClasses.classOf('step.call'),
	entries: methodClasses.entries().length,
});
