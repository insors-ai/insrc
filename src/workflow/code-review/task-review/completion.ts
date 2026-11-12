/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { requireReview } from './contracts.js';
import { latestReviewSummaries, validateTaskBody,hasPreservedReviewFailures } from './record.js';
import { reviewedBuildFingerprint } from '../build-freshness.js';

const object = (value:unknown):Record<string,unknown> => value && typeof value==='object' && !Array.isArray(value) ? value as Record<string,unknown> : {};
/** Version/scope interpretation only. Approval events and checkpoint cleanup remain S3. */
export function inspectTaskCompletion(input:unknown, build:unknown, epicHash:string, storyId:string):{counts:{high:number;med:number;low:number};gap?:string} {
 const head=object(input),meta=object(head['meta']);
 requireReview(meta['workflow']==='code-review' && [2,3].includes(meta['schemaVersion'] as number) && meta['epicHash']===epicHash && meta['storyId']===storyId,'CR','Unknown version or mismatched CR identity');
 const body=validateTaskBody(head['body']);
 requireReview((meta['schemaVersion']===3)===hasPreservedReviewFailures(body),'CR','CR capability does not match preserved admission history');
 requireReview(body.storyId===storyId,'storyId','Foreign story body');
 const counts={high:0,med:0,low:0};
 for(const review of latestReviewSummaries(body.reviews)) for(const task of review.tasks) for(const finding of task.findings) counts[finding.severity==='HIGH'?'high':finding.severity==='MED'?'med':'low']++;
 if(body.status!=='passed') return {counts,gap:`Task-based review is ${body.status}`};
 const full=latestReviewSummaries(body.reviews).filter(review=>!review.taskId).sort((a,b)=>Date.parse(a.completedAt)-Date.parse(b.completedAt)).at(-1);
 if(!full || full.status!=='passed') return {counts,gap:'A task-only review does not establish whole-story signoff'};
 const record=object(build),buildBody=object(record['body']);
 if(!Array.isArray(buildBody['tasks']) || !buildBody['tasks'].length) return {counts,gap:'Current BUILD tasks cannot be verified'};
 const ids=buildBody['tasks'].map(task=>object(task)['id']);
 if(ids.some(id=>typeof id!=='string') || ids.some(id=>!full.tasks.some(task=>task.taskId===id))) return {counts,gap:'Whole-story review does not cover every current BUILD task'};
 if(!full.buildFingerprint || full.buildFingerprint!==reviewedBuildFingerprint(build)) return {counts,gap:'BUILD has changed or the whole-story review has no BUILD binding'};
 if(meta['reviewedBy']!==full.reviewer) return {counts,gap:'Reviewer provenance does not match the full-story assessment'};
 return {counts};
}
