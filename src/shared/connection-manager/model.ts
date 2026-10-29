/** Pure sc7 state. No platform, storage, transport, credentials or operation tickets. */
import type { ConnectionKey, ConnectionScope, SafeConnection } from '../connection-management.js';
import { decodeSafeConnectionList } from './wire.js';

export type ScopeFilter = 'all' | ConnectionScope;
export type ConnectionListState = 'loading' | 'ready' | 'empty-registry' | 'empty-filter' | 'read-error' | 'offline' | 'no-repository' | 'upgrade-required';
export interface ReadIdentity { readonly repoRoot: string; readonly viewGeneration: number; readonly daemonEpoch: string }
export interface ConnectionSelection { readonly key: ConnectionKey; readonly revision: string }
export interface ConnectionManagerState {
 readonly roots: readonly string[]; readonly repoRoot: string | null; readonly daemonEpoch: string;
 readonly filter: ScopeFilter; readonly search: string; readonly listState: ConnectionListState;
 readonly rows: readonly SafeConnection[]; readonly selected: ConnectionSelection | null;
 readonly pendingReveal: ConnectionSelection | null; readonly viewGeneration: number;
 readonly awaitingRead: boolean; readonly closed: boolean;
}
export type ManagerEvent =
 | { readonly type: 'select-root'; readonly repoRoot: string }
 | { readonly type: 'registered-roots'; readonly roots: readonly string[] }
 | { readonly type: 'refresh' }
 | ({ readonly type: 'list-result'; readonly rows: unknown } & ReadIdentity)
 | ({ readonly type: 'list-error'; readonly code: 'read-error' | 'offline' | 'upgrade-required' } & ReadIdentity)
 | { readonly type: 'filter'; readonly value: ScopeFilter }
 | { readonly type: 'search'; readonly value: string }
 | { readonly type: 'select'; readonly selection: ConnectionSelection }
 | { readonly type: 'committed-reveal'; readonly selection: ConnectionSelection }
 | { readonly type: 'epoch'; readonly value: string }
 | { readonly type: 'temporary-ended' }
 | { readonly type: 'unavailable'; readonly code: 'offline' | 'upgrade-required' }
 | { readonly type: 'close' };
export type ManagerEffect = { readonly type: 'list' } & ReadIdentity;
export interface ManagerTransition { readonly state: ConnectionManagerState; readonly effects: readonly ManagerEffect[] }
export interface ManagerProjection extends ConnectionManagerState {
 readonly visibleKeys: readonly ConnectionKey[]; readonly counts: { readonly all: number; readonly saved: number; readonly temporary: number };
 readonly matchingCount: number; readonly stale: boolean; readonly canMutate: boolean;
}
export function sameConnectionKey(a: ConnectionKey, b: ConnectionKey): boolean {
 return a.repoRoot === b.repoRoot && a.scope === b.scope && a.id === b.id;
}
function freeze<T>(value: T): T {
 if (value && typeof value === 'object' && !Object.isFrozen(value)) {
  for (const child of Object.values(value)) freeze(child);
  Object.freeze(value);
 }
 return value;
}
function rootsCopy(roots: readonly string[]): readonly string[] {
 if (roots.length > 16384 || roots.some(r => typeof r !== 'string' || !r || r.length > 16384 || /[\u0000-\u001f]/.test(r))) throw new Error('Invalid registered roots.');
 return Object.freeze([...new Set(roots)]);
}
export function createConnectionManager(roots: readonly string[], daemonEpoch: string): ConnectionManagerState {
 return freeze({ roots: rootsCopy(roots), daemonEpoch, repoRoot:null, filter:'all', search:'', listState:'no-repository', rows:[], selected:null, pendingReveal:null, viewGeneration:0, awaitingRead:false, closed:false });
}
const live = (s: ConnectionManagerState): boolean => ['ready','empty-registry','empty-filter'].includes(s.listState) && !s.closed;
const matches = (row: SafeConnection, search: string): boolean => [row.key.id,row.kind,row.label ?? ''].some(v => v.toLowerCase().includes(search.toLowerCase()));
function visible(s: ConnectionManagerState): readonly SafeConnection[] { return s.rows.filter(r => (s.filter === 'all' || r.key.scope === s.filter) && matches(r,s.search)); }
function readyState(s: ConnectionManagerState): ConnectionListState { return !s.rows.length ? 'empty-registry' : visible(s).length ? 'ready' : 'empty-filter'; }
export function projectConnectionManager(s: ConnectionManagerState): ManagerProjection {
 return freeze({...s, visibleKeys:visible(s).map(r=>r.key), counts:{all:s.rows.length,saved:s.rows.filter(r=>r.key.scope==='saved').length,temporary:s.rows.filter(r=>r.key.scope==='temporary').length}, matchingCount:visible(s).length, stale:!live(s) && s.rows.length>0, canMutate:live(s)});
}
/** Host supplies daemon-authoritative registry roots and captured read identity, never renderer authority. */
export function reduceConnectionManager(s: ConnectionManagerState, event: ManagerEvent): ManagerTransition {
 const unchanged = (): ManagerTransition => ({state:s,effects:[]});
 const changed = (state: ConnectionManagerState, effects: readonly ManagerEffect[] = []): ManagerTransition => ({state:freeze(state),effects:freeze(effects)});
 const refresh = (state: ConnectionManagerState): ManagerTransition => {
  if (!state.repoRoot || !state.roots.includes(state.repoRoot) || state.viewGeneration >= Number.MAX_SAFE_INTEGER) return unchanged();
  const next = {...state,viewGeneration:state.viewGeneration+1,listState:'loading' as const,awaitingRead:true};
  return changed(next,[{type:'list',repoRoot:state.repoRoot,viewGeneration:next.viewGeneration,daemonEpoch:state.daemonEpoch}]);
 };
 if (s.closed) return unchanged();
 switch(event.type) {
  case 'select-root':
   if (!s.roots.includes(event.repoRoot) || s.repoRoot===event.repoRoot) return unchanged();
   return refresh({...s,repoRoot:event.repoRoot,rows:[],selected:null,pendingReveal:null});
  case 'registered-roots': {
   const roots=rootsCopy(event.roots);
   if (s.repoRoot && !roots.includes(s.repoRoot)) return changed({...s,roots,repoRoot:null,rows:[],selected:null,pendingReveal:null,awaitingRead:false,listState:'no-repository',viewGeneration:Math.min(Number.MAX_SAFE_INTEGER,s.viewGeneration+1)});
   return changed({...s,roots});
  }
  case 'refresh': return refresh(s);
  case 'list-result': case 'list-error': {
   if (!s.awaitingRead || event.repoRoot!==s.repoRoot || event.viewGeneration!==s.viewGeneration || event.daemonEpoch!==s.daemonEpoch) return unchanged();
   if (event.type==='list-error') return changed({...s,awaitingRead:false,listState:event.code});
   let rows: readonly SafeConnection[];
   try {rows=decodeSafeConnectionList(event.rows,event.repoRoot);} catch {return changed({...s,awaitingRead:false,listState:'read-error'});}
   let next={...s,rows,awaitingRead:false};
   if (next.selected && !rows.some(r=>sameConnectionKey(r.key,next.selected!.key)&&r.revision===next.selected!.revision)) next={...next,selected:null};
   if (s.pendingReveal && rows.some(r=>sameConnectionKey(r.key,s.pendingReveal!.key)&&r.revision===s.pendingReveal!.revision)) {
    next={...next,selected:s.pendingReveal,pendingReveal:null,filter:s.pendingReveal.key.scope,search:''};
   }
   return changed({...next,listState:readyState(next)});
  }
  case 'filter': {
   if (!['all','saved','temporary'].includes(event.value)) return unchanged();
   const next={...s,filter:event.value};return changed({...next,listState:live(s)?readyState(next):s.listState});
  }
  case 'search': {
   if (event.value.length>16384 || /[\u0000-\u001f]/.test(event.value)) return unchanged();
   const next={...s,search:event.value};return changed({...next,listState:live(s)?readyState(next):s.listState});
  }
  case 'select': {
   if (!live(s)) return unchanged();
   const row=visible(s).find(r=>sameConnectionKey(r.key,event.selection.key)&&r.revision===event.selection.revision);
   return row?changed({...s,selected:{key:row.key,revision:row.revision}}):unchanged();
  }
  case 'committed-reveal':
   if (event.selection.key.repoRoot!==s.repoRoot) return unchanged();
   return refresh({...s,pendingReveal:{key:{...event.selection.key},revision:event.selection.revision}});
  case 'epoch':
   if (event.value===s.daemonEpoch) return unchanged();
   return changed({...s,daemonEpoch:event.value,viewGeneration:Math.min(Number.MAX_SAFE_INTEGER,s.viewGeneration+1),awaitingRead:false,listState:s.repoRoot?'offline':'no-repository',rows:s.rows.filter(r=>r.key.scope==='saved'),selected:null,pendingReveal:null});
  case 'temporary-ended':
   return changed({...s,viewGeneration:Math.min(Number.MAX_SAFE_INTEGER,s.viewGeneration+1),awaitingRead:false,listState:s.repoRoot?'offline':'no-repository',rows:s.rows.filter(r=>r.key.scope==='saved'),selected:s.selected?.key.scope==='saved'?s.selected:null,pendingReveal:null});
  case 'unavailable': return changed({...s,awaitingRead:false,viewGeneration:Math.min(Number.MAX_SAFE_INTEGER,s.viewGeneration+1),listState:s.repoRoot?event.code:'no-repository'});
  case 'close': return changed({...s,closed:true,awaitingRead:false,viewGeneration:Math.min(Number.MAX_SAFE_INTEGER,s.viewGeneration+1)});
 }
}
