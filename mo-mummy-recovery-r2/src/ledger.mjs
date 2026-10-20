// LAB ONLY: demo wagering units, not the proprietary Mo Mummy paytable.
export const INITIAL=Object.freeze({version:1,revision:0,balance:10000,round:null,history:{},spins:0});
const copy=o=>structuredClone(o);
function idOk(id){if(typeof id!=="string"||!/^[a-zA-Z0-9_-]{8,96}$/.test(id))throw Error("INVALID_ROUND_ID");}
export function randBelow(max,cr=globalThis.crypto){if(!Number.isSafeInteger(max)||max<1||max>0x100000000)throw Error("INVALID_RNG_RANGE");const span=0x100000000,limit=span-span%max,a=new Uint32Array(1);let x;do{cr.getRandomValues(a);x=a[0];}while(x>=limit);return x%max;}
export function demoOutcome(cr=globalThis.crypto){const roll=randBelow(10000,cr);return {kind:"LAB_SPIN",roll,award:roll<5?2000:roll<100?200:roll<1100?50:0,unit:"TEST_CREDIT"};}
export function play(state,id,bet,cr=globalThis.crypto){
 idOk(id);if(!Number.isSafeInteger(bet)||bet<1||bet>10000)throw Error("INVALID_BET");
 const s=copy(state),old=s.history[id];
 if(old){if(old.bet!==bet)throw Error("IDEMPOTENCY_CONFLICT");return {changed:false,state:s,response:copy(old.response)};}
 if(s.round)throw Error("PENDING_ROUND");
 if(s.balance<bet)throw Error("INSUFFICIENT_FUNDS");
 if(Object.keys(s.history).length>=50000)throw Error("LEDGER_CAPACITY_REACHED");
 const outcome=demoOutcome(cr),result={id,bet,outcome,balanceAfter:s.balance-bet+outcome.award,status:"PENDING_ACK"};
 s.balance=result.balanceAfter;s.round=result;s.spins++;s.revision++;s.history[id]={bet,response:copy(result)};
 return {changed:true,state:s,response:copy(result)};
}
export function ack(state,id){
 idOk(id);const s=copy(state),rec=s.history[id];if(!rec)throw Error("UNKNOWN_ROUND");
 if(s.round&&s.round.id!==id)throw Error("ROUND_MISMATCH");
 if(s.round){s.round=null;s.revision++;rec.response.status="ACKNOWLEDGED";return {changed:true,state:s,response:{id,status:"ACKNOWLEDGED",balance:s.balance}};}
 return {changed:false,state:s,response:{id,status:"ACKNOWLEDGED",balance:s.balance}};
}
export function status(s){return {revision:s.revision,balance:s.balance,spins:s.spins,pending:s.round?copy(s.round):null,mode:"LAB_ONLY"};}
