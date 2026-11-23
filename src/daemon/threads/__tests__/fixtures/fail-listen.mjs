import { Server } from 'node:net';
Server.prototype.listen = function () { throw new Error('injected startup listen failure'); };
