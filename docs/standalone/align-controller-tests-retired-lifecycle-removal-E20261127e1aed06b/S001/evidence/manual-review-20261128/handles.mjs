import { createHook } from 'node:async_hooks';
import { writeSync } from 'node:fs';
const resources = new Map();
const hook = createHook({ init(id, type, trigger, resource) {
 if (['Timeout', 'TCPWRAP', 'TCPSERVERWRAP', 'MessagePort', 'MESSAGEPORT', 'WORKER', 'FSEVENTWRAP'].includes(type)) resources.set(id, { type, ref: new WeakRef(resource), stack: new Error().stack.split('\n').slice(2, 10) });
}, destroy(id) { resources.delete(id); } });
hook.enable();
for (const delay of [3000, 10000]) setTimeout(() => {
 const handles = [...resources.values()].flatMap(({type, ref, stack}) => { const resource = ref.deref(); return resource && (typeof resource.hasRef !== 'function' || resource.hasRef()) ? [{type, stack}] : []; });
 writeSync(2, '\nHANDLE_DIAGNOSTIC ' + JSON.stringify({delay, resources: process.getActiveResourcesInfo(), handles, libuv: process.report.getReport().libuv.map(({type,is_active,is_referenced}) => ({type,is_active,is_referenced}))}) + '\n');
}, delay).unref();
