/** Local protocol fixtures: they accept only authentication and SELECT 1, never external services. */
import {createServer} from 'node:net';
import type {Socket} from 'node:net';
import mysql from 'mysql2';

function packet(type:string,payload:Buffer):Buffer {const header=Buffer.alloc(5);header.write(type);header.writeInt32BE(payload.length+4,1);return Buffer.concat([header,payload]);}
export async function pgProbeServer(expectedPassword='ok') {
 const queries:string[]=[],sockets=new Set<Socket>();
 const server=createServer(socket=>{
  sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.on('error',()=>{});
  let buffer=Buffer.alloc(0),startup=true;
  socket.on('data',data=>{
   buffer=Buffer.concat([buffer,data]);
   while(buffer.length>=(startup?4:5)) {
    const size=startup?buffer.readInt32BE(0):buffer.readInt32BE(1)+1;
    if(buffer.length<size)return;const message=buffer.subarray(0,size);buffer=buffer.subarray(size);
    if(startup){startup=false;const ask=Buffer.alloc(4);ask.writeInt32BE(3);socket.write(packet('R',ask));continue;}
    const type=message.toString('utf8',0,1),body=message.subarray(5);
    if(type==='p') {
     if(body.toString()!==expectedPassword+'\0'){socket.end(packet('E',Buffer.from('SERROR\0C28P01\0MAuthentication failed\0\0')));continue;}
     socket.write(Buffer.concat([packet('R',Buffer.alloc(4)),packet('Z',Buffer.from('I'))]));
    } else if(type==='Q') {
     const query=body.toString().replace(/\0$/,'');queries.push(query);
     socket.write(Buffer.concat([packet('C',Buffer.from('SELECT 1\0')),packet('Z',Buffer.from('I'))]));
    } else if(type==='X')socket.end();
   }
  });
 });
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const addr=server.address();if(!addr||typeof addr==='string')throw new Error();
 return {port:addr.port,queries,idleError:(message:string)=>{for(const socket of sockets)socket.write(packet('E',Buffer.from('SERROR\0CXX000\0M'+message+'\0\0')));},close:async()=>{for(const socket of sockets)socket.destroy();await new Promise<void>(r=>server.close(()=>r()));}};
}
export async function mysqlProbeServer() {
 const queries:string[]=[],sockets=new Set<Socket>();
 const server=mysql.createServer(connection=>{
  sockets.add(connection.stream);connection.stream.on('close',()=>sockets.delete(connection.stream));connection.on('error',()=>{});
  connection.serverHandshake({protocolVersion:10,serverVersion:'8.0.0',connectionId:1,statusFlags:2,characterSet:33,capabilityFlags:0x88200,
   authCallback:(params:{user:string},done:(error:unknown,mysqlError?:{message:string;code:number})=>void)=>params.user==='good'?done(null):done(null,{message:'Authentication failed',code:1045})});
  connection.on('query',(query:string)=>{queries.push(query);connection.writeOk({affectedRows:0});});
  connection.on('quit',()=>connection.close());
 });
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const addr=server._server.address();if(!addr||typeof addr==='string')throw new Error();
 return {port:addr.port,queries,close:async()=>{for(const socket of sockets)socket.destroy();await new Promise<void>(r=>server.close(()=>r()));}};
}
