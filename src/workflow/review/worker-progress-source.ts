/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import type { ReviewWorkerStatus } from '../../shared/review-worker-progress.js';
/** The existing main status board supplies this read-only projection across
 * thread boundaries. No checkpoint scan and no request to a busy review worker. */
let read:()=>Promise<readonly {subject:string;progress:ReviewWorkerStatus}[]>=async()=>[];
export function setReviewProgressSource(source:typeof read):void{read=source;}
export function reviewProgressRows(threads:readonly {reviewSubject?:string|undefined;reviewProgress?:ReviewWorkerStatus|undefined}[]):readonly {subject:string;progress:ReviewWorkerStatus}[]{return threads.flatMap(t=>t.reviewSubject&&t.reviewProgress?[{subject:t.reviewSubject,progress:t.reviewProgress}]:[]);}
export async function reviewProgressForArtifact(project:string,artifactId:string):Promise<ReviewWorkerStatus|undefined>{
 const rows=await read();const progress=rows.filter(row=>row.progress.project===project&&(row.subject===artifactId||row.progress.family==='code'&&row.subject===artifactId.replace(/^(CR|TESTS)-/,'BUILD-'))).sort((a,b)=>b.progress.observedAt.localeCompare(a.progress.observedAt))[0]?.progress;return progress?{...progress,freshness:Date.now()-Date.parse(progress.observedAt)>2000?'stale':progress.freshness}:undefined;
}
