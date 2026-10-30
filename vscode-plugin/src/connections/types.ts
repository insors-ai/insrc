/** Dedicated view protocol. It cannot name an RPC method, capability, ticket or arbitrary action. */
import type { ConnectionKey,ConnectionScope } from '../../../src/shared/connection-management.js';
import type { ScopeFilter,ManagerProjection } from '../../../src/shared/connection-manager/model.js';
import type { DraftView } from '../../../src/shared/connection-manager/draft.js';
import type { DraftTestView } from '../../../src/shared/connection-manager/test-controller.js';
import type { MutationView } from '../../../src/shared/connection-manager/controller.js';
import type { RemovalConfirmation } from '../../../src/shared/connection-removal.js';
import type { ChatPanelChannel } from '../chat/chat-panel.js';
import { connectionReplyData } from '../../../src/shared/connection-manager/wire.js';
import { parseConnectionKey } from '../../../src/shared/connection-management-wire.js';

type Header={readonly v:1;readonly viewId:string;readonly generation:number};
export type ConnectionIntent=Header&(
 | {readonly type:'ready'|'refresh'|'add'|'save'|'test'|'cancel-test'|'remove'|'close'|'clear-filter'}
 | {readonly type:'root'|'search'|'id'|'kind';readonly value:string}
 | {readonly type:'filter';readonly value:ScopeFilter}
 | {readonly type:'scope';readonly value:ConnectionScope}
 | {readonly type:'select';readonly key:ConnectionKey;readonly revision:string}
 | {readonly type:'browse-file';readonly path:readonly string[]}
 | {readonly type:'field';readonly path:readonly string[];readonly value:unknown}
 | {readonly type:'reset-field';readonly path:readonly string[]}
 | {readonly type:'credential';readonly slot:string;readonly action:'keep'|'replace'|'clear';readonly value?:string|undefined}
 | {readonly type:'credential-addresses';readonly slot:string;readonly values:readonly string[]}
 | {readonly type:'dirty';readonly decision:'discard'|'cancel'}
 | {readonly type:'removal';readonly decision:'confirm'|'cancel'}
 | {readonly type:'operation';readonly recordId:string;readonly action:'reconcile'|'replay'|'activation'|'cleanup'|'refresh'|'dismiss'}
);
export interface ConnectionPanel extends ChatPanelChannel {onVisibility?(listener:(visible:boolean)=>void):void}
export interface ConnectionRenderView {
 readonly controls:import('../../../src/shared/connection-manager/capabilities.js').ConnectionControls;
 readonly viewId:string;readonly generation:number;
 readonly list:Pick<ManagerProjection,'roots'|'repoRoot'|'filter'|'search'|'listState'|'counts'|'matchingCount'|'stale'|'canMutate'>;
 readonly rows:readonly {readonly key:ConnectionKey;readonly revision:string;readonly kind:string;readonly label:string;readonly family:string;readonly selected:boolean}[];
 readonly canCreateDraft:boolean;readonly canBrowseFile:boolean;readonly validationMessages:readonly string[];
 readonly choices:readonly {readonly kind:string;readonly family:string;readonly enabled:boolean;readonly guidance:string|null}[];
 readonly draft:DraftView|null;readonly formId:number;readonly blocked:boolean;readonly valid:boolean;
 readonly test:DraftTestView;readonly operations:readonly MutationView[];
 readonly confirmation:RemovalConfirmation|null;readonly dirty:boolean;readonly error:string;readonly notice:string;
}
const simple=new Set(['ready','refresh','add','save','test','cancel-test','remove','close','clear-filter']);
const text=(v:unknown):v is string=>typeof v==='string'&&v.length<=16384&&!/[\u0000-\u001f]/.test(v);
/** Safe data-descriptor copy rejects getters/prototypes/cycles/private references before field access. */
export function parseConnectionIntent(value:unknown):ConnectionIntent|null {
 try{
  const o=connectionReplyData(value) as Record<string,unknown>;
  if(!o||typeof o!=='object'||Array.isArray(o)||o['v']!==1||!text(o['viewId'])||!o['viewId']||!Number.isSafeInteger(o['generation'])||(o['generation'] as number)<0||!text(o['type']))return null;
  const type=o['type'];let fields:string[]=[];
  if(simple.has(type))fields=[];
  else if(['root','search','id','kind'].includes(type)){if(!text(o['value']))return null;fields=['value'];}
  else if(type==='filter'||type==='scope'){if(!(type==='filter'?['all','saved','temporary']:['saved','temporary']).includes(o['value'] as string))return null;fields=['value'];}
  else if(type==='select'){parseConnectionKey(o['key']);if(!text(o['revision'])||!o['revision'])return null;fields=['key','revision'];}
  else if(type==='browse-file'){
   if(!Array.isArray(o['path'])||!['[\"path\"]','[\"schemaSource\",\"path\"]'].includes(JSON.stringify(o['path'])))return null;fields=['path'];
  }else if(type==='field'||type==='reset-field'){
   if(!Array.isArray(o['path'])||!o['path'].length||o['path'].length>32||o['path'].some(v=>!text(v)||!v||['__proto__','prototype','constructor'].includes(v)))return null;
   fields=type==='field'?['path','value']:['path'];
  }else if(type==='credential'){
   if(!text(o['slot'])||!['keep','replace','clear'].includes(o['action'] as string))return null;
   if(o['action']==='replace'){if(!text(o['value']))return null;fields=['slot','action','value'];}else fields=['slot','action'];
  }else if(type==='credential-addresses'){
   if(!text(o['slot'])||!Array.isArray(o['values'])||!o['values'].length||o['values'].length>1024||o['values'].some(v=>!text(v)||!v))return null;fields=['slot','values'];
  }else if(type==='dirty'||type==='removal'){
   if(!(type==='dirty'?['discard','cancel']:['confirm','cancel']).includes(o['decision'] as string))return null;fields=['decision'];
  }else if(type==='operation'){
   if(!text(o['recordId'])||!['reconcile','replay','activation','cleanup','refresh','dismiss'].includes(o['action'] as string))return null;fields=['recordId','action'];
  }else return null;
  const expected=['v','viewId','generation','type',...fields];
  if(Object.keys(o).length!==expected.length||expected.some(k=>!Object.hasOwn(o,k)))return null;
  return o as unknown as ConnectionIntent;
 }catch{return null;}
}
