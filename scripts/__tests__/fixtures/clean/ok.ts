import { execFile } from 'node:child_process';
export function run(): void { execFile('node', ['--version'], () => {}); }
