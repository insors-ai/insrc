/** Pure public endpoint safety grammar shared by producer projection and consumers.
 * Driver semantics and non-endpoint option-address syntax remain daemon-owned. */
export function isPublicEndpoint(value:unknown):value is string {
 if(typeof value!=='string')return false;
 if(/[\u0000-\u001f\u007f-\u009f\ud800-\udfff]/u.test(value)||value.includes('\\'))return false;
 const scheme=/^([A-Za-z][A-Za-z0-9+.-]*):/.exec(value);
 if(!scheme)return false;
 const rest=value.slice(scheme[0].length);if(!rest)return false;
 // Producer uri()/address() expose hierarchical forms only. Never guess the
 // credential syntax of an opaque or nested SDK-specific connection string.
 if(!rest.startsWith('//'))return false;
 let authority=rest.slice(2).split(/[/?#]/,1)[0]!;
 if(scheme[1]!.toLowerCase()!=='file'&&!authority)return false;
 for(let n=0;n<8;n++){
  if(/[\u0000-\u0020\u007f-\u009f\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff@/\\?#<>"{}|^`]/u.test(authority))return false;
  let next:string;try{next=decodeURIComponent(authority.replace(/%(?![0-9a-f]{2})/gi,'%25'));}catch{return false;}
  if(next===authority)return true;authority=next;
 }
 return false;
}
