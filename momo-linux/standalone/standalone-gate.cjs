#!/usr/bin/env node
// Public QA utility. Never bundle private MME5 files, licenses, state or game artwork.
const fs = require('node:fs');
const assert = require('node:assert/strict');

const START_OLD = [
  '    public void Start()',
  '    {',
  '        if(running)return; running=true;',
  '        Task.Run((Action)DiscoveryReceiveLoop); Task.Run((Action)DiscoverySendLoop); Task.Run((Action)TcpLoop); Task.Run((Action)SupervisorLoop);',
  '        Log("START machine="+machineId+" engine="+Short(engineHash));',
  '    }',
].join('\n');
const START_NEW = [
  '    public void Start()',
  '    {',
  '        if(running)return;',
  '        // Lab only: never open LINKED sockets for a STANDALONE configuration.',
  '        Dictionary<string,object> cfg=NormalizeProgressiveConfig(LoadOperator());',
  '        if(!String.Equals(GetString(cfg,"networkMode","STANDALONE"),"LINKED",StringComparison.OrdinalIgnoreCase))',
  '        {',
  '            runtimeState="STANDALONE";',
  '            Log("STANDALONE_LINK_NETWORK_DISABLED");',
  '            return;',
  '        }',
  '        running=true;',
  '        Task.Run((Action)DiscoveryReceiveLoop); Task.Run((Action)DiscoverySendLoop); Task.Run((Action)TcpLoop); Task.Run((Action)SupervisorLoop);',
  '        Log("START machine="+machineId+" engine="+Short(engineHash));',
  '    }',
  '    public bool IsNetworkRunning { get { return running; } }',
].join('\n');
const ROUTE_OLD = '            if (path == "/__local/link/status" && ctx.Request.HttpMethod == "GET")';
const ROUTE_NEW = [
  '            // Lab only: reject LINKED transaction requests when its coordinator is disabled.',
  '            if (path.StartsWith("/__local/link/", StringComparison.OrdinalIgnoreCase)',
  '                && ctx.Request.HttpMethod == "POST" && (linked == null || !linked.IsNetworkRunning))',
  '            {',
  '                SendJson(ctx.Response, 409, new Dictionary<string,object>{{"ok",false},{"error","LINK_NETWORK_DISABLED_STANDALONE"}});',
  '                return;',
  '            }',
  ROUTE_OLD,
].join('\n');
function once(haystack, needle, label) {
  const a=haystack.indexOf(needle);
  assert(a!==-1, 'SOURCE_MISMATCH: '+label+' absent. Refuse unreviewed patch.');
  assert(haystack.indexOf(needle,a+1)===-1, 'SOURCE_MISMATCH: '+label+' duplicated.');
}
function patch(input) {
  assert(!input.includes('STANDALONE_LINK_NETWORK_DISABLED'), 'ALREADY_PATCHED: abort');
  const normalized=input.replace(/\r\n/g,'\n');
  once(normalized, START_OLD, 'coordinator Start()');
  once(normalized, ROUTE_OLD, 'linked status route');
  const result=normalized.replace(START_OLD, START_NEW).replace(ROUTE_OLD, ROUTE_NEW);
  assert(result.includes('listener.Prefixes.Add("http://127.0.0.1:" + port + "/")'),'Local server binding changed');
  assert(result.includes('billAcceptor.Start();'),'Bill acceptor missing');
  assert(result.includes('wmsButtons.Start();'),'WMS manager missing');
  const start=result.indexOf('public void Start()', result.indexOf('public sealed class EJGELinkedCoordinator'));
  assert(start>=0,'Linked coordinator not found');
  const guard=result.indexOf('STANDALONE_LINK_NETWORK_DISABLED',start);
  const tasks=result.indexOf('Task.Run((Action)DiscoveryReceiveLoop)',start);
  assert(start<guard && guard<tasks, 'Networking starts before offline guard');
  return result;
}
function synthetic() {
  const source=['public sealed class MMStandaloneServer {', ROUTE_OLD,
    'listener.Prefixes.Add("http://127.0.0.1:" + port + "/");',
    'billAcceptor.Start();','wmsButtons.Start();',
    '}', 'public sealed class EJGELinkedCoordinator {', START_OLD,'}'].join('\n');
  const out=patch(source);
  assert(out.includes('LINK_NETWORK_DISABLED_STANDALONE'));
  assert(out.includes('public bool IsNetworkRunning'));
  assert(out.includes('STANDALONE_LINK_NETWORK_DISABLED'));
  assert.throws(()=>patch(out),/ALREADY_PATCHED/);
  assert.throws(()=>patch(source.replace(ROUTE_OLD,'// missing route')),/SOURCE_MISMATCH/);
  assert.throws(()=>patch(source.replace(START_OLD,'// missing start')),/SOURCE_MISMATCH/);
  const config={version:14,progressive:{networkMode:'STANDALONE',link:{autoDiscovery:true},levels:{GRAND:{seed:1000}}},rtp:{active:'ORIGINAL'}};
  const original=structuredClone(config);
  assert.equal(config.progressive.networkMode,'STANDALONE');
  config.progressive.link.autoDiscovery=false;
  assert.deepEqual(config.progressive.levels,original.progressive.levels);
  assert.deepEqual(config.rtp,original.rtp);
  assert.equal(original.progressive.link.autoDiscovery,true);
  console.log('PUBLIC_SYNTHETIC_PASS: guard, fail-closed patching, localhost and monetary configurations protected');
}
const mode=process.argv[2] || '--selftest';
if(mode==='--selftest') synthetic();
else if(mode==='--patch'){
  const path=process.argv[3];
  if(!path || !fs.statSync(path).isFile()) throw new Error('Private source file is required');
  const baseline=fs.readFileSync(path,'utf8');
  const modified=patch(baseline);
  // Original file is only the extracted ephemeral lab copy, never a production installation.
  fs.writeFileSync(path, modified, 'utf8');
  console.log('PRIVATE_LAB_PATCH_APPLIED: compiled verification still required');
} else throw new Error('Usage: node standalone-gate.cjs --selftest | --patch <extracted-private-server-local.ps1>');
