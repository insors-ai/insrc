import { execFile } from 'node:child_process';
export function run(): void { execFile('git', ['status'], () => {}); }
