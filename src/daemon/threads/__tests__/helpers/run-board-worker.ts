/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Worker for registry-board.test.ts: runs a detached stub workflow with the real workflow
// run registry, which mirrors it to the main thread's board through the hub; forgets it on request.
import { parentPort, threadId, workerData } from 'node:worker_threads';
import type { MessagePort } from 'node:worker_threads';

import { HubClient } from '../../channel.js';
import { StatusBoardClient } from '../../status-board.js';
import { pollWorkflowRun, setRunBoard, startWorkflowRun } from '../../../workflow-run-registry.js';
import type { LLMMessage, LLMProvider, StructuredSchema } from '../../../../shared/types.js';

const { port, repo } = workerData as { port: MessagePort; repo: string };
const board = new StatusBoardClient(new HubClient(port));
setRunBoard(board);

/** Canned plan + artifact for the stub workflow: no model is reached. */
const answers: unknown[] = [
	{ workflow: 'stub', steps: [{ id: 's1', runner: 'echo.a', params: {} }, { id: 's2', runner: 'echo.b', params: {} }, { id: 's3', runner: 'echo.c', params: {} }] },
	{ body: { title: 'Demo', summary: 'A demo summary grounded in a step [[c1]].', bulletList: ['first point [[c1]]'] }, citations: [{ id: 'c1', kind: 'step-output', ref: 's1' }] },
];
const provider: LLMProvider = {
	supportsTools: false,
	get capabilities() { return { structuredOutput: true, toolCalling: false, vision: false, webSearch: false, streaming: false, embeddings: false }; },
	complete: async () => { throw new Error('unused'); },
	async *stream() { throw new Error('unused'); },
	embed: async () => [],
	completeStructured: async <T>(_m: LLMMessage[], _s: StructuredSchema): Promise<T> => answers.shift() as T,
} as unknown as LLMProvider;

const { runId } = startWorkflowRun({ workflow: 'stub', focus: 'demo stub run', repo }, {
	prepare: () => ({
		intent: { workflow: 'stub', focus: 'demo stub run', repoPath: repo, repoIndexedAt: null, params: {} },
		runId: 'wf-worker', epicKey: 'demo-stub-wf-worker', provider, modelLabel: 'ollama:qwen3-test', clientDefault: undefined, review: false,
	}),
});
const waitDone = async (): Promise<void> => { while (pollWorkflowRun(runId, 0).status === 'running') await new Promise(r => setTimeout(r, 10)); };
parentPort!.on('message', (m: string) => {
	if (m === 'forget') { board.forgetRun(runId); void board.snapshot().then(() => parentPort!.postMessage('forgot')); }
});
// The snapshot request is answered after the run's last publish, which went first on the same port.
void waitDone().then(() => board.snapshot()).then(() => parentPort!.postMessage({ threadId, runId }));
