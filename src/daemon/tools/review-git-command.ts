/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { GIT_READ_ARGS,gitEnvironment } from './git-isolation.js';
export const REVIEW_GIT_PREFIX=[...GIT_READ_ARGS,'--no-pager'] as const;
/** Committed review reads never use replacement objects, filters, external
 * diff programs, hooks, pagers, inherited Git overrides or lazy network fetch. */
export function reviewGitCommand(args:readonly string[]):{args:readonly string[];env:NodeJS.ProcessEnv}{
 let body=[...args];
 if(GIT_READ_ARGS.every((v,i)=>body[i]===v))body=body.slice(GIT_READ_ARGS.length);
 if(body[0]==='--no-pager')body.shift();
 const verb=body.shift();
 const boundary=body.indexOf('--');
 if(boundary>=0)body=body.map((value,i)=>i>boundary&&value.startsWith(':(top,literal)')?value.slice(14):value);
 if(verb==='diff'||verb==='log')for(const flag of ['--no-ext-diff','--no-textconv'])if(!body.includes(flag))body.unshift(flag);
 return{args:[...REVIEW_GIT_PREFIX,...(verb?[verb]:[]),...body],env:gitEnvironment()};
}
