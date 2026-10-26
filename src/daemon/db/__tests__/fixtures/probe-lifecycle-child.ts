/** Actual disposable process used to control IPC/result/exit races in supervisor tests. */
const mode=process.env['CM_PROBE_FIXTURE_MODE'];
const keep=setInterval(()=>{},1000);
process.on('message',(message:unknown)=>{
 const input=message as {type:string;requestId:string;nonce:string};if(input.type!=='start')return;
 const reply=()=>process.send!({type:'result',requestId:input.requestId,nonce:input.nonce,code:'reachable'});
 if(mode==='reply-hang')reply();
 if(mode==='late')setTimeout(()=>{reply();clearInterval(keep);process.disconnect();},100);
 // Cancel is deliberately ignored: the production supervisor must kill this owned process.
});
