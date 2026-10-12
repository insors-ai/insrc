/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { SourceRequest } from '../eligibility.js';
import { repositoryUrl } from './fixtures.js';
export function gitFixture(format: 'sha1' | 'sha256' = 'sha1') {
  const dir = mkdtempSync(join(tmpdir(), 'insrc-source-git-'));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' } }).trim();
  git('init', '-q', `--object-format=${format}`); git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.org');
  const binary = Uint8Array.from([0, 255, 128, 13, 10, 1, 65]);
  writeFileSync(join(dir, 'binary.bin'), binary); writeFileSync(join(dir, 'unsafe%file'), 'Unselected');
  writeFileSync(join(dir, 'lfs'), 'version https://git-lfs.github.com/spec/v1\noid sha256:' + '0'.repeat(64) + '\nsize 10\n');
  symlinkSync('binary.bin', join(dir, 'link')); git('add', '.'); git('commit', '-qm', 'Original test objects');
  const revision = git('rev-parse', 'HEAD');
  const request: SourceRequest = { repositoryUrl, revision, paths: ['binary.bin'], retrievedAt: '2026-10-12T00:00:00Z' };
  return { dir, git, binary, request, dispose: () => rmSync(dir, { recursive: true, force: true }) };
}
