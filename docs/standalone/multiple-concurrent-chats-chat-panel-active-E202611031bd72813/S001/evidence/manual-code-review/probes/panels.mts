// Diagnostic reproduction: emitted observations demonstrate a review finding, not a passing safety assertion.
import {createDocsReviewHost} from '../../../../../../../vscode-plugin/src/chat/docs-review-panel.ts';
const panels:any[]=[]; const calls:any[]=[];
const docs=['LLD-a-S001','LLD-b-S001'].map(id=>({id,kind:'LLD',title:id}));
const client={pending:async()=>docs,content:async(id:string)=>({markdown:'# '+id,openQuestions:[],blocked:false,docPath:'docs/'+id+'.md'}),decide:async(...args:any[])=>{calls.push(args);return {artifactId:'LLD-b-S001',outcome:'approved',recorded:true};}};
const host=createDocsReviewHost({client:client as any,pollMs:0,logger:{warn(){},error(){}},createPanel(){const p:any={posted:[],send:undefined};panels.push(p);return{setHtml(){},postMessage(m:any){p.posted.push(m.payload);},onMessage(fn:any){p.send=fn;},onDidDispose(){},reveal(){},dispose(){}};}});
const tick=()=>new Promise(r=>setTimeout(r,10));
try{
 host.openArtifact({artifactId:docs[0]!.id,mdPath:'docs/A.md',presentKey:'A#1'});
 host.openArtifact({artifactId:docs[1]!.id,mdPath:'docs/B.md',presentKey:'B#2'});
 await tick();await tick();
 const initial=panels.map(p=>p.posted.filter((m:any)=>m.type==='docs-content').map((m:any)=>m.artifactId));
 panels[0].send({v:1,payload:{type:'docs-decision',artifactId:docs[0]!.id,decision:'approve',comments:[]}});
 await tick();
 const firstDecisionCalls=calls.length;
 const firstReplies=panels[0].posted.filter((m:any)=>m.type==='docs-decision-result').length;
 panels[1].send({v:1,payload:{type:'open-doc',artifactId:''}});
 await tick();
 console.log(JSON.stringify({initial,firstPanelDecisionReachedDaemon:firstDecisionCalls,firstPanelDecisionReplies:firstReplies,contentCountsAfterSecondPanelBoot:panels.map(p=>p.posted.filter((m:any)=>m.type==='docs-content').length)}));
}finally{host.dispose();}
