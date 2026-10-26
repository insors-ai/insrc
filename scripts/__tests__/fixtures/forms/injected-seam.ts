export type Exec = (cmd: string, args: string[]) => string;
export function run(_exec: Exec): string { return _exec('gh', ['api', 'user']); }
