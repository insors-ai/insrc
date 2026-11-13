import { createHash } from 'node:crypto';
/** Key order is not part of an immutable review request's identity. */
export function requestSignature(value:unknown):string{
 const canonical=JSON.stringify(value,(_key,item:unknown)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a<b?-1:a>b?1:0)):item);
 return createHash('sha256').update(canonical).digest('hex');
}
