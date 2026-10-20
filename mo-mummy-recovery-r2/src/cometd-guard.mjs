// LAB: deterministic CometD validation, not a gambling outcome generator.
const CHANNELS=new Set(["/meta/handshake","/meta/connect","/meta/subscribe"]);
export const MONETARY_EVENTS=new Set(["spin","freespin","cashcollect","mightycashspin","pick"]);
export function validateMessage(message,{handshaken=false,clientId=null}={}){
 if(!message||typeof message!=="object"||Array.isArray(message))return {ok:false,error:"INVALID_MESSAGE"};
 const ch=message.channel;
 if(typeof ch!=="string")return {ok:false,error:"MISSING_CHANNEL"};
 if(ch==="/meta/handshake"){
  if(!Array.isArray(message.supportedConnectionTypes)||!message.supportedConnectionTypes.includes("websocket"))return {ok:false,error:"UNSUPPORTED_TRANSPORT"};
  return {ok:true,kind:"handshake"};
 }
 if(!handshaken)return {ok:false,error:"HANDSHAKE_REQUIRED"};
 if(message.clientId!==clientId)return {ok:false,error:"INVALID_CLIENT_ID"};
 if(ch==="/meta/connect")return {ok:true,kind:"connect"};
 if(ch==="/meta/subscribe"){
  if(typeof message.subscription!=="string"||!message.subscription.startsWith("/"))return {ok:false,error:"INVALID_SUBSCRIPTION"};
  return {ok:true,kind:"subscribe"};
 }
 if(ch.startsWith("/service/")){
  const event=message.data?.event;
  if(typeof event!=="string"||!event)return {ok:false,error:"MISSING_EVENT"};
  if(!MONETARY_EVENTS.has(event))return {ok:false,error:"UNKNOWN_EVENT"};
  // CometD's message.id and per-connection correlation IDs are not stable round IDs.
  // Client integration must supply durable roundId for retry/reconnection.
  const roundId=message.data?.roundId;
  if(typeof roundId!=="string"||!/^[A-Za-z0-9_-]{8,96}$/.test(roundId))return {ok:false,error:"STABLE_ROUND_ID_REQUIRED"};
  return {ok:true,kind:"monetary",event,roundId};
 }
 return {ok:false,error:"UNKNOWN_CHANNEL"};
}
export function replayResultOrError(replay,event){
 // Never silently rewind the original recording or fabricate an empty success.
 const result=replay.next(event);
 if(result==null)return {ok:false,error:"REPLAY_EXHAUSTED_OR_UNKNOWN_EVENT"};
 return {ok:true,result};
}
