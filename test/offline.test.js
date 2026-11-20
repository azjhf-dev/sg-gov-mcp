"use strict";
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createClient, retryDelay } = require('../src/client');
const { TokenBucket, bucketFor } = require('../src/ratelimit');
const { buildDatasetRequest, datasetOutput, DATASET_SOURCE, DATASET_TOOLS } = require('../src/datasets');
const rows = require('./fixtures/hdb-rows.json');
const filtered = require('./fixtures/hdb-filtered.json');
const id = 'd_8b84c4ee58e3cfc0ece0d773c8ca6abc';
const src = { ...DATASET_SOURCE, ttlMs:100 };
const args = { dataset_id:id };
const response = (body, status=200, headers={}) => new Response(JSON.stringify(body), {status,headers});
function fakeBucket() { return { calls:0, delays:[], async acquire(){this.calls++;}, defer(ms){this.delays.push(ms);} }; }

test('two dataset tools have strict schemas',()=> {
 assert.equal(DATASET_TOOLS.length,2);
 for(const t of DATASET_TOOLS) assert.equal(t.inputSchema.additionalProperties,false);
});
test('default row request is bounded and uses official host',()=> {
 const r=buildDatasetRequest('sg_dataset_rows',args);const u=new URL(r.url);
 assert.equal(u.origin,'https://data.gov.sg');assert.equal(u.searchParams.get('limit'),'20');assert.equal(u.searchParams.get('offset'),'0');
});
test('schema request uses one row, not broken limit=0',()=>assert.equal(new URL(buildDatasetRequest('sg_dataset_schema',args).url).searchParams.get('limit'),'1'));
test('dataset IDs cannot become arbitrary URLs',()=> {
 for(const dataset_id of ['https://evil.invalid','../auth','d_'+ 'a'.repeat(31),'d_'+'a'.repeat(32)+'?a=b',null]) assert.throws(()=>buildDatasetRequest('sg_dataset_rows',{dataset_id}));
});
test('invalid limits and offsets fail before fetch',()=> {
 for(const limit of [0,51,1.1,'2',null]) assert.throws(()=>buildDatasetRequest('sg_dataset_rows',{...args,limit}));
 for(const offset of [-1,1.5,1000001,'0']) assert.throws(()=>buildDatasetRequest('sg_dataset_rows',{...args,offset}));
});
test('unknown and malformed arguments rejected',()=> {
 for(const a of [null,[],{...args,url:'https://evil.invalid'},{...args,filters:[]},{...args,filters:{a:{b:1}}},{...args,fields:['a,b']},{...args,sort:2}]) assert.throws(()=>buildDatasetRequest('sg_dataset_rows',a));
 assert.throws(()=>buildDatasetRequest('sg_dataset_schema',{...args,limit:2}));
});
test('filters, projection, sorting and Unicode are URL-encoded',()=> {
 const a={...args,filters:{town:'ANG MO KIO',label:'新加坡 & x=1'},fields:['town','resale_price'],sort:'month desc'};
 const u=new URL(buildDatasetRequest('sg_dataset_rows',a).url);
 assert.deepEqual(JSON.parse(u.searchParams.get('filters')),a.filters);assert.equal(u.searchParams.get('sort'),'month desc');assert.equal(u.searchParams.get('fields'),'town,resale_price');
});
test('real captured HDB fixture yields fields, rows and next offset',()=> {
 const r=datasetOutput(rows,{offset:0,limit:2});assert.equal(r.records.length,2);assert.equal(r.next_offset,2);assert.ok(r.fields.some(f=>f.id==='resale_price'));
});
test('schema output excludes row contents',()=> {
 const r=datasetOutput(rows,{schema:true});assert.equal(r.records,undefined);assert.ok(r.total>0);
});
test('filtered fixture preserves projection and pagination',()=> {
 const r=datasetOutput(filtered,{offset:0,limit:2});assert.equal(r.records[0].town,'ANG MO KIO');assert.equal(r.next_offset,2);
});
test('last page has null next offset',()=>assert.equal(datasetOutput({...rows,result:{...rows.result,total:2}},{offset:0,limit:2}).next_offset,null));
test('output truncation preserves valid JSON and no skipped rows',()=> {
 const body={success:true,result:{fields:[],records:Array.from({length:10},()=>({a:'a'.repeat(2000)})),total:10}};
 const r=datasetOutput(body,{offset:0,limit:10});assert.equal(r.truncated,true);assert.equal(r.next_offset,r.records.length);assert.ok(r.records.length<10);assert.doesNotThrow(()=>JSON.parse(JSON.stringify(r)));
});
test('oversized single rows require projection instead of skipping',()=>assert.throws(()=>datasetOutput({success:true,result:{fields:[],records:[{a:'a'.repeat(15000)}]}},{offset:0,limit:1}),/select fewer/));
test('unexpected datastore body is an error',()=>assert.throws(()=>datasetOutput({headers:{}},{schema:true}),/shape/));
test('Retry-After supports seconds, HTTP date and minimum fallback',()=> {
 assert.equal(retryDelay(null),10500);assert.equal(retryDelay('2'),10500);assert.equal(retryDelay('30'),30000);
 assert.equal(retryDelay('Fri, 20 Nov 2026 01:01:00 GMT',Date.parse('2026-11-20T01:00:00Z')),60000);
});
test('sliding window waits beyond capacity',async()=> {
 let now=0;const waits=[];const b=new TokenBucket({capacity:2,windowMs:10000,now:()=>now,sleep:async ms=>{waits.push(ms);now+=ms;}});
 await b.acquire();await b.acquire();await b.acquire();assert.deepEqual(waits,[10025]);assert.equal(b.stats().usedInWindow,1);
});
test('cooldown is shared and cannot be shortened',async()=> {
 let now=0;const b=new TokenBucket({capacity:3,windowMs:10000,now:()=>now,sleep:async ms=>{now+=ms;}});
 b.defer(30000);b.defer(1000);await b.acquire();assert.equal(now,30000);
});
test('same quota key shares bucket',()=>assert.equal(bucketFor('test-shared',src.bucket),bucketFor('test-shared',src.bucket)));
test('cache avoids a second request and expires',async()=> {
 let now=0,calls=0;const c=createClient({fetchImpl:async()=>{calls++;return response(rows);},getBucket:()=>fakeBucket(),now:()=>now});
 assert.equal((await c.request(src,'https://data.gov.sg/a')).cached,false);assert.equal((await c.request(src,'https://data.gov.sg/a')).cached,true);
 now=101;await c.request(src,'https://data.gov.sg/a');assert.equal(calls,2);
});
test('concurrent identical requests coalesce',async()=> {
 let calls=0;const c=createClient({fetchImpl:async()=>{calls++;await new Promise(r=>setImmediate(r));return response(rows);},getBucket:()=>fakeBucket()});
 await Promise.all(Array.from({length:12},()=>c.request(src,'https://data.gov.sg/a')));assert.equal(calls,1);
});
test('429 honors header and retries once using same bucket',async()=> {
 let calls=0;const b=fakeBucket();const c=createClient({fetchImpl:async()=>++calls===1?response({},429,{'retry-after':'30'}):response(rows),getBucket:()=>b});
 await c.request(src,'https://data.gov.sg/a');assert.equal(calls,2);assert.deepEqual(b.delays,[30000]);assert.equal(b.calls,2);
});
test('persistent 429 stops after two attempts and retains cooldown',async()=> {
 let calls=0;const b=fakeBucket();const c=createClient({fetchImpl:async()=>{calls++;return response({},429);},getBucket:()=>b});
 await assert.rejects(c.request(src,'https://data.gov.sg/a'),/exhausted/);assert.equal(calls,2);assert.equal(b.delays.length,2);
});
test('long Retry-After fails without sleeping or retrying',async()=> {
 let calls=0;const b=fakeBucket();const c=createClient({fetchImpl:async()=>{calls++;return response({},429,{'retry-after':'600'});},getBucket:()=>b});
 await assert.rejects(c.request(src,'https://data.gov.sg/a'),/long Retry-After/);assert.equal(calls,1);assert.deepEqual(b.delays,[600000]);
});
test('403 is terminal, never retried or cached',async()=> {
 let calls=0;const c=createClient({fetchImpl:async()=>{calls++;return response({},403);},getBucket:()=>fakeBucket()});
 await assert.rejects(c.request(src,'https://data.gov.sg/a'),/403/);assert.equal(calls,1);assert.equal(c.cacheSize(),0);
});
test('API failure body is not cached',async()=> {
 const c=createClient({fetchImpl:async()=>response({success:false}),getBucket:()=>fakeBucket()});
 await assert.rejects(c.request(src,'https://data.gov.sg/a'),/unsuccessful/);assert.equal(c.cacheSize(),0);
});
test('redirects are forbidden',async()=> {
 const c=createClient({fetchImpl:async(url,opts)=>{assert.equal(opts.redirect,'error');return response(rows);},getBucket:()=>fakeBucket()});await c.request(src,'https://data.gov.sg/a');
});
test('large payloads are rejected',async()=> {
 const c=createClient({fetchImpl:async()=>response({v:'x'.repeat(2100000)}),getBucket:()=>fakeBucket()});await assert.rejects(c.request(src,'https://data.gov.sg/a'),/2 MiB/);
});

test('offline stdio handshake, discovery and invalid calls need no upstream',async()=> {
 const {spawn}=require('node:child_process');
 const child=spawn(process.execPath,[require('node:path').join(__dirname,'../src/server.js')],{stdio:['pipe','pipe','pipe']});
 let buffer='',serial=0;const pending=new Map();
 child.stdout.on('data',chunk=>{
  buffer+=chunk;let i;
  while((i=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,i);buffer=buffer.slice(i+1);const msg=JSON.parse(line);const p=pending.get(msg.id);if(p){pending.delete(msg.id);p(msg);}}
 });
 const rpc=(method,params)=>new Promise((resolve,reject)=>{
  const n=++serial;const timeout=setTimeout(()=>reject(new Error('stdio timeout')),3000);
  pending.set(n,msg=>{clearTimeout(timeout);resolve(msg);});
  child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:n,method,params})+'\n');
 });
 try{
  const init=await rpc('initialize',{protocolVersion:'2024-11-05'});assert.equal(init.result.serverInfo.version,'0.2.0');
  const list=await rpc('tools/list');assert.equal(list.result.tools.length,16);
  const bad=await rpc('tools/call',{name:'sg_dataset_rows',arguments:{dataset_id:'https://evil.invalid'}});assert.equal(bad.result.isError,true);
  const stats=await rpc('tools/call',{name:'sg_rate_limit_status'});assert.deepEqual(JSON.parse(stats.result.content[0].text).buckets,{});
 }finally{child.kill();}
});
