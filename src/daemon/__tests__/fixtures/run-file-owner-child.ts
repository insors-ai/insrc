/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { IpcServer, directDispatch } from '../../server.js';
import { DaemonRunFileOwnership, endForRunFileConflict } from '../../run-file-ownership.js';
const dir = process.argv[2]!;
const owner = new DaemonRunFileOwnership({ pidFile: `${dir}/pid`, socketFile: `${dir}/sock`, guardPath: `${dir}/guard` });
const publication = owner.lease();
owner.writePid();
const server = new IpcServer(directDispatch({}), Date.now, `${dir}/sock`, owner);
await server.listen(); publication.release();
process.send?.('ready');
process.on('message', () => { void server.close().then(() => owner.clearRunFiles()).catch(endForRunFileConflict); });
