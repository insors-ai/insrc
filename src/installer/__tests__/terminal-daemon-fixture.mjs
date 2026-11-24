import { createServer } from 'node:net';
const [endpoint, encoded] = process.argv.slice(2);
const identity = JSON.parse(encoded);
const server = createServer(socket => { socket.on('error', () => {}); socket.once('data', () => socket.end(JSON.stringify({ id: 1, result: identity }) + '\n')); });
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(endpoint, resolve); });
process.stdout.write('ready\n');
process.stdin.once('data', () => { server.close(); process.stdin.destroy(); });
