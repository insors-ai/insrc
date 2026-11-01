import { parentPort, workerData } from 'node:worker_threads';
const config = parentPort ? workerData : { path: process.argv[2], entry: process.argv[3] };
const { MemoryFactory } = await import(config.entry);
const send = message => parentPort ? parentPort.postMessage(message) : process.send(message);
const receive = listener => parentPort ? parentPort.on('message', listener) : process.on('message', listener);
let service;
receive(async message => {
  try {
    if (message === 'open') {
      service = await MemoryFactory.open({ dataDirectory: config.path, models: { embeddingModel: 'local', embeddingDimension: 2, async complete() { throw Error('unexpected provider call'); }, async embed() { throw Error('unexpected provider call'); } }, policy: { async bind() { throw Error('unexpected policy call'); }, async admit() { throw Error('unexpected policy call'); } }, logger: { write() {} }, limits: { maxEventBytes: 1024, segmentBytes: 4096, maxPendingBytes: 8192, modelTimeoutMs: 1000 } });
      send({ event: 'ready' });
    } else if (message === 'close') {
      await service?.close(); service = undefined; send({ event: 'released' });
    } else if (message === 'exit') { await service?.close(); process.exit(0); }
  } catch (error) { send({ event: 'refused', code: error.code ?? 'INTERNAL' }); }
});
send({ event: 'booted' });
