/**
 * Test teardown: stop a worker as shutdown does and terminate it. Rejects when the worker
 * exits or errors before it reports `drainedMessage`, or reports nothing within `ms`; the
 * worker is terminated either way. (No daemon imports: tests load those after setting HOME.)
 */

import type { Worker } from 'node:worker_threads';

export async function stopWorker(worker: Worker, stop: () => void, drainedMessage: unknown, ms = 30_000): Promise<void> {
	let deadline: NodeJS.Timeout | undefined;
	const drained = new Promise<void>((resolve, reject) => {
		worker.on('message', m => { if (m === drainedMessage) resolve(); });
		worker.once('exit', code => reject(new Error(`the worker exited (code ${code}) before reporting it had drained`)));
		worker.once('error', reject);
		deadline = setTimeout(() => reject(new Error(`the worker did not report it had drained within ${ms} ms`)), ms);
	});
	try {
		stop();
		await drained;
	} finally {
		clearTimeout(deadline);
		await worker.terminate();
	}
}
