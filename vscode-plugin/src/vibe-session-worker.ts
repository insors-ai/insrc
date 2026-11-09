import { runVibeChatJob } from './chat/vibe-session-process.js';
import type { VibeChatJob } from './chat/vibe-session-process.js';

const MAX_JOB_BYTES = 16 * 1024 * 1024;

async function main(): Promise<void> {
  const controller = new AbortController();
  const stop = (): void => controller.abort();
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
  try {
    // One private request, sent by the parent over stdin. EOF transfers
    // ownership to this worker, which writes directly to its inherited stdout.
    const chunks: Buffer[] = [];
    let bytes = 0;
    for await (const chunk of process.stdin) {
      const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytes += data.length;
      if (bytes > MAX_JOB_BYTES) throw new Error('Vibe turn request exceeded the input limit');
      chunks.push(data);
    }
    const job = JSON.parse(Buffer.concat(chunks).toString('utf8')) as VibeChatJob;
    process.exitCode = await runVibeChatJob(job, controller.signal, line => { process.stdout.write(line); });
  } finally {
    process.removeListener('SIGTERM', stop);
    process.removeListener('SIGINT', stop);
  }
}

void main().catch(error => {
  const message = error instanceof Error ? error.message : 'Vibe worker could not start';
  process.stdout.write(JSON.stringify({ type: 'insrc-vibe-result', ok: false, message }) + '\n');
  process.exitCode = 1;
});
