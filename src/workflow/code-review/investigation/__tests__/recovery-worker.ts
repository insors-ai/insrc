/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { openSync, writeSync, fsyncSync, closeSync } from 'node:fs';
const path = process.argv[2]!;
const fd = openSync(path, 'wx', 0o600);
writeSync(fd, 'durable-handshake\n'); fsyncSync(fd); closeSync(fd);
process.send?.({ boundary: 'synced' });
setInterval(() => {}, 1000);
