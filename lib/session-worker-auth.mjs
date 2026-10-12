import {createHash,verify,createPublicKey} from 'node:crypto';
export function verifyWorkerRequest(headers,raw,key,now=Date.now()){
 try{
  const ts=headers.get('x-vorlen-timestamp'),nonce=headers.get('x-vorlen-nonce'),signature=headers.get('x-vorlen-signature');
  if(!key||!/^\d{13}$/.test(ts||'')||Math.abs(now-Number(ts))>60000||!/^[-a-f0-9]{36}$/i.test(nonce||'')||!signature||signature.length>200)return null;
  const message=ts+'\n'+nonce+'\n'+createHash('sha256').update(raw).digest('hex');
  const pk=createPublicKey(key);if(pk.asymmetricKeyType!=='ed25519')return null;
  return verify(null,Buffer.from(message),pk,Buffer.from(signature,'base64'))?nonce:null;
 }catch{return null;}
}
