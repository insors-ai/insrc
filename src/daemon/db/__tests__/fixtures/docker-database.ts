import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
/** Disposable test containers only: random names, localhost ports, no host mounts or retained volumes. */
export function databaseFixture(image:string,port:number,args:readonly string[]=[],environment:Readonly<Record<string,string>>={}) {
 const name='insrc-cm-s2-'+randomUUID();
 const id=execFileSync('docker',['run','--rm','-d','--name',name,'--label','insrc.fixture=connection-management-s2','--memory=768m','--cpus=1','-p','127.0.0.1::'+port,...Object.entries(environment).flatMap(([key,value])=>['-e',key+'='+value]),image,...args],{encoding:'utf8',timeout:60000,stdio:['ignore','pipe','pipe']}).trim();
 const mapping=execFileSync('docker',['port',id,String(port)],{encoding:'utf8',timeout:10000}).trim();
 const hostPort=Number(mapping.split(':').at(-1));
 return {id,port:hostPort,close:()=>{execFileSync('docker',['stop','-t','2',id],{timeout:15000,stdio:'ignore'});}};
}
