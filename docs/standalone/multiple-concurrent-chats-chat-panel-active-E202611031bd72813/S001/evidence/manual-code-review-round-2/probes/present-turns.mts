import {createChatPanelHost} from '../../../../../../../vscode-plugin/src/chat/chat-panel.ts';
import {createInMemoryChatSessionStore} from '../../../../../../../vscode-plugin/src/chat/session-store.ts';
import {createReviewPresenter} from '../../../../../../../vscode-plugin/src/chat/review-presenter.ts';
let send:any,onDispose=()=>{},runs=0;const opened:any[]=[];const store=createInMemoryChatSessionStore();
const ad:any={capabilities:{resume:false},decide(){return{delivered:true};},cancel(){},async *run(){const turnId='turn-'+(++runs);yield{kind:'tool-call',turnId,callId:'item_1',tool:'insrc_present',present:['LLD-a']};yield{kind:'done',turnId,ok:true};}};
const presenter=createReviewPresenter({pendingDocuments:async()=>[{id:'LLD-a',mdPath:'/repo/A.md'}],open(t){opened.push(t);},log:{warn(){},error(){}}});
const host=createChatPanelHost({createPanel:()=>({setHtml(){},postMessage(){},onMessage(fn:any){send=fn;},onDidDispose(fn:any){onDispose=fn;},reveal(){},dispose(){onDispose();}}),store,providers:{available:['claude'],get(){return ad;}} as any,cwd:()=>'/repo',presenter});
const tick=()=>new Promise(r=>setTimeout(r,20));
try{host.open();send({v:1,payload:{type:'submit-turn',text:'first'}});await tick();send({v:1,payload:{type:'submit-turn',text:'second'}});await tick();const s=store.get(store.list()[0]!.id);console.log(JSON.stringify({differentTurns:runs,sameCallId:'item_1',expectedPanels:2,actualPanels:opened.length,persisted:s?.presentedDeclarations}));}finally{host.dispose();}
