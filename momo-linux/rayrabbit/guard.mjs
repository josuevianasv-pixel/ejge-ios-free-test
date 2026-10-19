import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
export const isQACode = p => /^momo-linux\/rayrabbit\/(?:guard|guard-selftest|verify-source)\.mjs$/i.test(p);
export const isGameSensitive = p => /^(?:www\/(?:engine-local|bill-acceptor-runtime|accounting-runtime|handpay-runtime|startup-guard-runtime)\.js|server-local\.ps1|CRITICAL_SHA256\.txt|native\/|RUN[^/]*\.bat|config\/)/i.test(p);
export function checkChanges(input){
 const changed=[...new Set(input.map(x=>x.replaceAll('\\','/')))];
 const relevant=changed.filter(p=>isQACode(p)||isGameSensitive(p));
 const spec=changed.some(p=>/^momo-linux\/rayrabbit\/contracts\.md$/i.test(p)||/^openspec\/changes\/[^/]+\/(?:proposal|spec)\.md$/i.test(p));
 const test=changed.some(p=>/^momo-linux\/rayrabbit\/guard-selftest\.mjs$/i.test(p)||/^tests\/.*(?:test|spec)\.(?:js|mjs)$/i.test(p));
 const violations=[];
 if(relevant.length&&!spec) violations.push('Agregar o actualizar un contrato/especificacion para los cambios de codigo sensibles.');
 if(relevant.length&&!test) violations.push('Agregar o actualizar pruebas para los cambios de codigo sensibles.');
 return {relevant, hasSpec:spec, hasTest:test, violations, pass:violations.length===0};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const base=process.env.BASE_SHA||process.argv.find(s=>s.startsWith('--base='))?.slice(7);
 if(!base){console.error('BASE_SHA requerido; no se declara PASS sin comparar commits');process.exit(2);}
 try{
  const changed=execFileSync('git',['diff','--name-only',base+'...HEAD'],{cwd:ROOT,encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean);
  const r=checkChanges(changed);console.log(JSON.stringify(r));if(!r.pass)process.exitCode=1;
 }catch(e){console.error('FAIL al comparar cambios:',e.message);process.exitCode=2;}
}
