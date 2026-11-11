import { killProcessGroup } from '../../src/shared/process-group.js';
import { runVibeChatJob } from './chat/vibe-session-process.js';
import type { VibeChatJob } from './chat/vibe-session-process.js';

const MAX_JOB_BYTES = 16 * 1024 * 1024;
const ownedGroup = process.platform !== 'win32' && process.argv[2] === '--owned-process-group';

async function main(): Promise<void> {
  const controller = new AbortController();
  const stop = (): void => controller.abort();
  process.stdout.on('error', stop);
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
    process.exitCode = await runVibeChatJob(job, controller.signal, line => { process.stdout.write(line); }, ownedGroup);
  } finally {
    process.removeListener('SIGTERM', stop);
    process.removeListener('SIGINT', stop);
  }
}

function sweepAfterOutput(): void {
  if (!ownedGroup) return;
  // The terminal record, rather than this supervisor's exit signal, carries
  // the outcome. Sweeping the group here also works after the IDE host exits.
  const sweep = (): void => {
    clearTimeout(grace);
    killProcessGroup(process.pid);
  };
  const grace = setTimeout(sweep, 1_000);
  process.stdout.once('error', sweep);
  process.stdout.write('', sweep);
}

void main().catch(error => {
  const message = error instanceof Error ? error.message : 'Vibe worker could not start';
  process.stdout.write(JSON.stringify({ type: 'insrc-vibe-result', ok: false, message }) + '\n');
  process.exitCode = 1;
}).finally(sweepAfterOutput);
