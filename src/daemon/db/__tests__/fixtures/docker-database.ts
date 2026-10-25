import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
/** Disposable test containers only: random names, localhost ports, no host mounts or retained volumes. */
export function databaseFixture(image:string,port:number,args:readonly string[]=[],environment:Readonly<Record<string,string>>={},memory='768m') {
 const name='insrc-cm-s2-'+randomUUID();
 const id=execFileSync('docker',['run','--rm','-d','--name',name,'--label','insrc.fixture=connection-management-s2','--memory='+memory,'--cpus=1','-p','127.0.0.1::'+port,...Object.entries(environment).flatMap(([key,value])=>['-e',key+'='+value]),image,...args],{encoding:'utf8',timeout:60000,stdio:['ignore','pipe','pipe']}).trim();
 let closed=false;
 const close=()=>{if(!closed){execFileSync('docker',['stop','-t','2',id],{timeout:15000,stdio:'ignore'});closed=true;}};
 try {
  const mapping=execFileSync('docker',['port',id,String(port)],{encoding:'utf8',timeout:10000}).trim();
  const hostPort=Number(mapping.split(':').at(-1));
  if(!Number.isInteger(hostPort)||hostPort<1)throw new Error('Missing fixture port');
  return {id,port:hostPort,close};
 } catch(error){close();throw error;}
}
