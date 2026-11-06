import {createProviderRegistry} from '../../../../../../../vscode-plugin/src/chat/cli-adapter.ts';
import {makeFakeSpawner} from '../../../../../../../vscode-plugin/src/chat/__tests__/fixtures.ts';
const signals:string[]=[];let exitSettled=false;let handle:any;
const neverExit=new Promise<any>(()=>{});neverExit.then(()=>exitSettled=true);
const spawner=makeFakeSpawner({lines:[JSON.stringify({type:'control_request',request:{subtype:'can_use_tool',request_id:'req-stop',tool_name:'Bash',command:'fixture'}})],pid:9876});
const adapter=createProviderRegistry({spawn:(bin,args,opts)=>({...spawner.spawn(bin,args,opts),exit:neverExit,kill(signal){signals.push(signal);}}),isInstalled:()=>true,stopGraceMs:5}).get('claude');
const it=adapter.run({prompt:'fixture',cwd:'/repo'},{onSpawn(p){handle=p;}})[Symbol.asyncIterator]();
await it.next();const verified=await handle.stopVerified();console.log(JSON.stringify({stopVerifiedResult:verified,processExitConfirmed:exitSettled,signals}));await it.return?.();
