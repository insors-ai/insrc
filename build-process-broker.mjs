/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const source = join(root, 'src/native/process-broker');
const output = join(root, 'out/bin/insrc-process-broker');
const temporary = `${output}.${process.pid}.tmp`;
try {
	if (!['linux', 'darwin'].includes(process.platform)) throw new Error(`stable process capabilities are unsupported on ${process.platform}`);
	mkdirSync(dirname(output), { recursive: true });
	execFileSync(process.env['CC'] || 'cc', ['-std=c11', '-O2', '-Wall', '-Wextra', '-Werror', join(source, 'main.c'), join(source, `${process.platform}.c`), '-o', temporary, ...(process.platform === 'darwin' ? ['-lbsm'] : [])], { stdio: 'pipe', timeout: 60_000 });
	chmodSync(temporary, 0o755);
	renameSync(temporary, output);
	process.stdout.write(`[build-process-broker] built ${process.platform} capability broker\n`);
} catch (error) {
	rmSync(temporary, { force: true });
	process.stderr.write(`Cannot build the internal process-capability broker. A local C compiler and supported OS headers are required; runtime compilation and PID-kill fallbacks are disabled.\n${error instanceof Error ? error.message : String(error)}\n`);
	process.exitCode = 1;
}
