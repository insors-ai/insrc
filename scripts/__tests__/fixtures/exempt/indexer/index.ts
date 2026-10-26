import { execFileSync } from 'node:child_process';
export const head = (): string => execFileSync('git', ['rev-parse', 'HEAD']).toString();
