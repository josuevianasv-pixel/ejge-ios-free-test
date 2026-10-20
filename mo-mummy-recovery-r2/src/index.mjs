import {INITIAL,play,ack,status} from "./ledger.mjs";
const json=(v,code=200)=>new Response(JSON.stringify(v),{status:code,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
export class MachineLedger {
 constructor(ctx,env){this.ctx=ctx;this.env=env;}
 async fetch(req){
  if(req.method!=="POST")return json({error:"METHOD_NOT_ALLOWED"},405);
  let body;try{body=await req.json();}catch{return json({error:"INVALID_JSON"},400);}
  const op=new URL(req.url).pathname;
  try {
   const out=await this.ctx.storage.transaction(async tx=>{
    const state=(await tx.get("state"))??structuredClone(INITIAL);
    if(op==="/status")return status(state);
    let r;if(op==="/play")r=play(state,body.roundId,body.bet);
    else if(op==="/ack")r=ack(state,body.roundId);
    else throw Error("UNKNOWN_OPERATION");
    if(r.changed)await tx.put("state",r.state);
    return r.response;
   });return json(out);
  }catch(e){const error=String(e?.message||"INTERNAL_ERROR");const known=["INVALID_ROUND_ID","INVALID_BET","IDEMPOTENCY_CONFLICT","PENDING_ROUND","INSUFFICIENT_FUNDS","LEDGER_CAPACITY_REACHED","UNKNOWN_ROUND","ROUND_MISMATCH","UNKNOWN_OPERATION"];return json({error:known.includes(error)?error:"STORAGE_OR_SERVER_ERROR"},known.includes(error)?409:503);}
 }
}
export default {async fetch(request,env){
 const u=new URL(request.url);
 if(!u.pathname.startsWith("/__ejge_rng_lab/"))return env.ASSETS?env.ASSETS.fetch(request):new Response("Not found",{status:404});
 if(request.method!=="POST")return json({error:"METHOD_NOT_ALLOWED"},405);
 if(!env.LAB_API_KEY||request.headers.get("authorization")!==`Bearer ${env.LAB_API_KEY}`)return json({error:"UNAUTHORIZED"},401);
 let body;try{body=await request.json();}catch{return json({error:"INVALID_JSON"},400);}
 if(typeof body.machineId!=="string"||!/^[a-zA-Z0-9_-]{4,80}$/.test(body.machineId))return json({error:"INVALID_MACHINE_ID"},400);
 const sub=u.pathname.slice("/__ejge_rng_lab".length);
 if(!["/play","/ack","/status"].includes(sub))return json({error:"NOT_FOUND"},404);
 if(!env.MACHINE_LEDGER)return json({error:"MISSING_DURABLE_OBJECT_BINDING"},503);
 return env.MACHINE_LEDGER.get(env.MACHINE_LEDGER.idFromName(body.machineId)).fetch(new Request(new URL(sub,request.url),{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)}));
}};
