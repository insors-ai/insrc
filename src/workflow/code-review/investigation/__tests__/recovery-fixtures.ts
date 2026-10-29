/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
export function recoveryDirectory() {
 const repo = mkdtempSync(join(tmpdir(), 'insrc-recovery-'));
 return { repo, cleanup: () => rmSync(repo, { recursive: true, force: true }) };
}
