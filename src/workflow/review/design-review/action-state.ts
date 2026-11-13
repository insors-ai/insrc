/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { isDeepStrictEqual as same } from 'node:util';
import type { DesignAttempt } from './contracts.js';
type Action=NonNullable<DesignAttempt['actions']>[number];
/** Only a pending action may acquire qualification or a pointed failure.
 * Neither its exact request nor an already filled outcome can be replaced. */
export function designActionEvolution(old:Action,next:Action):boolean{
 const {validation:before,outcome:oldOutcome,...request}=old;
 const {validation:after,outcome:newOutcome,...nextRequest}=next;
 return same(request,nextRequest)&&(!oldOutcome||same(oldOutcome,newOutcome))&&
  (before===after||before==='unverified'&&(after==='qualified'||after==='failed'));
}
export function qualifiedDesignAction(action:Action):boolean{return action.validation===undefined||action.validation==='qualified';}
