import {createConnection} from 'node:net';
import {parentPort,workerData} from 'node:worker_threads';
const socket=createConnection(workerData.socket);let text='';
socket.on('error',error=>{parentPort.postMessage({error:error.message});socket.destroy();});
socket.on('connect',()=>socket.write(JSON.stringify({id:1,method:'codeReview.investigation.probe',params:workerData.params})+'\n'));
socket.on('data',chunk=>{text+=chunk;const end=text.indexOf('\n');if(end<0)return;parentPort.postMessage(JSON.parse(text.slice(0,end)));socket.destroy();});
