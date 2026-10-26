/** Test-only preload: delay an actual owned resource close, then optionally fail it. */
process.env.INSRC_MODE='probe-worker';
const {MemoryFileExecution}=await import(process.env.CM_TEST_EXECUTION_URL);
const close=MemoryFileExecution.prototype.close;
MemoryFileExecution.prototype.close=async function(){
 process.send({type:'test-close-start'});
 await new Promise(resolve=>setTimeout(resolve,250));
 await close.call(this);
 if(process.env.CM_TEST_CLOSE_MODE==='fail')throw new Error('PRIVATE_CLOSE_CANARY');
};
