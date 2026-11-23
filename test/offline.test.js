"use strict";
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createClient, retryDelay } = require('../src/client');
const { TokenBucket, bucketFor } = require('../src/ratelimit');
const { buildDatasetRequest, datasetOutput, DATASET_SOURCE, DATASET_TOOLS } = require('../src/datasets');
const { SINGSTAT_TOOLS, SINGSTAT_SOURCE, buildSingstatRequest, singstatOutput } = require('../src/singstat');
const stSearch = require('./fixtures/singstat-search.json');
const stMeta = require('./fixtures/singstat-metadata.json');
const stTable = require('./fixtures/singstat-tabledata.json');
const { ONEMAP_TOOLS, ONEMAP_SOURCE, buildOnemapRequest, onemapOutput } = require('../src/onemap');
const omSearch = require('./fixtures/onemap-search.json');
const omNames = require('./fixtures/onemap-planning-names.json');
const { SOURCES } = require('../src/sources');
const nea4day = require('./fixtures/nea-4day-forecast.json');
const ltaCams = require('./fixtures/lta-traffic-images.json');
const pubFlood = require('./fixtures/pub-flood-alerts.json');
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
test('one paced retry on transient timeout, then success',async()=> {
 let calls=0;const b=fakeBucket();
 const c=createClient({fetchImpl:async()=>{calls++;if(calls===1){const e=new Error('aborted');e.name='AbortError';throw e;}return response(rows);},getBucket:()=>b});
 await c.request(src,'https://data.gov.sg/a');assert.equal(calls,2);assert.equal(b.calls,2);
});
test('persistent timeout fails after two attempts, never cached',async()=> {
 let calls=0;
 const c=createClient({fetchImpl:async()=>{calls++;const e=new Error('aborted');e.name='AbortError';throw e;},getBucket:()=>fakeBucket()});
 await assert.rejects(c.request(src,'https://data.gov.sg/a'),/timed out/);assert.equal(calls,2);assert.equal(c.cacheSize(),0);
});
test('upstream StatusCode error body is rejected and not cached',async()=> {
 const c=createClient({fetchImpl:async()=>response({StatusCode:404,Message:'Resource not found',Data:null}),getBucket:()=>fakeBucket()});
 await assert.rejects(c.request(src,'https://data.gov.sg/a'),/StatusCode 404/);assert.equal(c.cacheSize(),0);
});
test('API failure body is not cached',async()=> {
 const c=createClient({fetchImpl:async()=>response({success:false}),getBucket:()=>fakeBucket()});
 await assert.rejects(c.request(src,'https://data.gov.sg/a'),/unsuccessful/);assert.equal(c.cacheSize(),0);
});
test('redirects are forbidden',async()=> {
 const c=createClient({fetchImpl:async(url,opts)=>{assert.equal(opts.redirect,'error');return response(rows);},getBucket:()=>fakeBucket()});await c.request(src,'https://data.gov.sg/a');
});
test('source headers are sent but never part of the cache key',async()=> {
 let seen;const c=createClient({fetchImpl:async(url,opts)=>{seen=opts.headers;return response(rows);},getBucket:()=>fakeBucket()});
 const authedSrc={...src,headers:()=>({authorization:'secret-token'})};
 await c.request(authedSrc,'https://www.onemap.gov.sg/x');assert.equal(seen.authorization,'secret-token');
 const again=await c.request(authedSrc,'https://www.onemap.gov.sg/x');assert.equal(again.cached,true);
});
test('large payloads are rejected',async()=> {
 const c=createClient({fetchImpl:async()=>response({v:'x'.repeat(2100000)}),getBucket:()=>fakeBucket()});await assert.rejects(c.request(src,'https://data.gov.sg/a'),/2 MiB/);
});

// --- SingStat Table Builder ---

test('three SingStat tools have strict schemas',()=> {
 assert.equal(SINGSTAT_TOOLS.length,3);
 for(const t of SINGSTAT_TOOLS) assert.equal(t.inputSchema.additionalProperties,false);
 assert.equal(SINGSTAT_SOURCE.host,'tablebuilder.singstat.gov.sg');
 assert.deepEqual(SINGSTAT_SOURCE.bucket,{capacity:20,windowMs:60000});
});
test('search request encodes keyword and defaults to all',()=> {
 const u=new URL(buildSingstatRequest('sg_singstat_search',{keyword:'population & 人口'}).url);
 assert.equal(u.origin,'https://tablebuilder.singstat.gov.sg');
 assert.equal(u.searchParams.get('keyword'),'population & 人口');
 assert.equal(u.searchParams.get('searchOption'),'all');
});
test('resource IDs cannot become arbitrary paths',()=> {
 for(const resource_id of ['https://evil.invalid','../auth','M650681?a=b','M650681/x','',null,'M650681 '.repeat(10)]) assert.throws(()=>buildSingstatRequest('sg_singstat_metadata',{resource_id}));
});
test('table request bounds limit/offset and whitelists sort',()=> {
 const u=new URL(buildSingstatRequest('sg_singstat_table',{resource_id:'M650681'}).url);
 assert.equal(u.searchParams.get('limit'),'100');assert.equal(u.searchParams.get('offset'),'0');
 for(const limit of [0,501,1.5,'5',null]) assert.throws(()=>buildSingstatRequest('sg_singstat_table',{resource_id:'M650681',limit}));
 assert.throws(()=>buildSingstatRequest('sg_singstat_table',{resource_id:'M650681',sort_by:'value; drop'}));
 assert.equal(new URL(buildSingstatRequest('sg_singstat_table',{resource_id:'M650681',sort_by:'value desc'}).url).searchParams.get('sortBy'),'value desc');
});
test('time and value filters are character-restricted',()=> {
 for(const time_filter of ['2024;ls','2024\n2025','']) assert.throws(()=>buildSingstatRequest('sg_singstat_table',{resource_id:'M650681',time_filter}));
 assert.equal(new URL(buildSingstatRequest('sg_singstat_table',{resource_id:'M650681',time_filter:'2024 1Q,2024 2Q'}).url).searchParams.get('timeFilter'),'2024 1Q,2024 2Q');
 for(const between of ['1;2','1,2,3','abc']) assert.throws(()=>buildSingstatRequest('sg_singstat_table',{resource_id:'M650681',between}));
});
test('unknown SingStat arguments rejected',()=> {
 for(const a of [null,[],{keyword:'x',url:'https://evil.invalid'},{resource_id:'M650681',cursor:'abc'}]) assert.throws(()=>buildSingstatRequest('sg_singstat_search',a)&&buildSingstatRequest('sg_singstat_table',a));
 assert.throws(()=>buildSingstatRequest('sg_singstat_search',{keyword:'x',search_option:'everything'}));
});
test('search fixture yields capped record list',()=> {
 const r=singstatOutput(stSearch,{kind:'search'});assert.equal(r.records.length,3);assert.equal(r.truncated,false);assert.equal(r.records[0].id,'M650681');
});
test('metadata fixture yields coverage and rows without data values',()=> {
 const r=singstatOutput(stMeta,{kind:'metadata'});assert.equal(r.resource_id,'M650681');assert.equal(r.coverage.end,'2025');assert.equal(r.rows.length,6);assert.equal(r.rows[0].columns,undefined);
});
test('table fixture yields series rows with columns',()=> {
 const r=singstatOutput(stTable,{kind:'table',offset:0,limit:3});assert.equal(r.rows.length,1);assert.equal(r.rows[0].columns[0].key,'1986');assert.equal(r.truncated,false);
});
test('table output truncation keeps valid JSON',()=> {
 const body={StatusCode:200,Data:{id:'X',row:Array.from({length:50},()=>({seriesNo:'1',rowText:'x'.repeat(1000),columns:[]}))}};
 const r=singstatOutput(body,{kind:'table',offset:0,limit:50});assert.equal(r.truncated,true);assert.ok(r.rows.length<50);assert.doesNotThrow(()=>JSON.parse(JSON.stringify(r)));
});
test('SingStat error status is rejected, not parsed',()=> {
 assert.throws(()=>singstatOutput({StatusCode:404,Message:'not found',Data:null},{kind:'metadata'}),/shape/);
});

// --- OneMap (token-authenticated) ---

test('two OneMap tools have strict schemas and tokened source',()=> {
 assert.equal(ONEMAP_TOOLS.length,2);
 for(const t of ONEMAP_TOOLS) assert.equal(t.inputSchema.additionalProperties,false);
 assert.equal(ONEMAP_SOURCE.host,'www.onemap.gov.sg');
 assert.deepEqual(ONEMAP_SOURCE.bucket,{capacity:30,windowMs:60000});
 assert.equal(typeof ONEMAP_SOURCE.headers,'function');
});
test('OneMap source refuses to send without a token',()=> {
 const saved=process.env.ONEMAP_TOKEN;delete process.env.ONEMAP_TOKEN;
 assert.throws(()=>ONEMAP_SOURCE.headers(),/ONEMAP_TOKEN/);
 process.env.ONEMAP_TOKEN='test-token';
 assert.deepEqual(ONEMAP_SOURCE.headers(),{authorization:'test-token'});
 if(saved===undefined) delete process.env.ONEMAP_TOKEN; else process.env.ONEMAP_TOKEN=saved;
});
test('OneMap search URL uses official path with fixed flags',()=> {
 const u=new URL(buildOnemapRequest('sg_onemap_search',{query:'Revenue House & 307987'}).url);
 assert.equal(u.origin+ u.pathname,'https://www.onemap.gov.sg/api/common/elastic/search');
 assert.equal(u.searchParams.get('searchVal'),'Revenue House & 307987');
 assert.equal(u.searchParams.get('returnGeom'),'Y');assert.equal(u.searchParams.get('pageNum'),'1');
});
test('OneMap argument validation',()=> {
 for(const a of [null,[],{query:''},{query:'x'.repeat(201)},{query:'a\nb'},{query:'x',page:0},{query:'x',page:1.5},{query:'x',token:'abc'}]) assert.throws(()=>buildOnemapRequest('sg_onemap_search',a));
 for(const year of ['2020','abc',2019]) assert.throws(()=>buildOnemapRequest('sg_onemap_planning_areas',{year}));
 assert.equal(new URL(buildOnemapRequest('sg_onemap_planning_areas',{year:'2019'}).url).searchParams.get('year'),'2019');
 assert.equal(new URL(buildOnemapRequest('sg_onemap_planning_areas',{}).url).searchParams.get('year'),null);
});
test('OneMap search fixture yields one geocoded address',()=> {
 const r=onemapOutput(omSearch,{kind:'search'});
 assert.equal(r.found,1);assert.equal(r.results.length,1);
 assert.equal(r.results[0].postal,'200640');assert.ok(Number(r.results[0].latitude)>1.3&&Number(r.results[0].latitude)<1.31);
});
test('OneMap planning-area fixture yields sorted names',()=> {
 const r=onemapOutput(omNames,{kind:'names'});
 assert.equal(r.count,55);assert.ok(r.planning_areas.includes('BEDOK'));
 assert.deepEqual([...r.planning_areas].sort(),r.planning_areas);
});
test('OneMap error bodies and bad shapes are rejected',()=> {
 assert.throws(()=>onemapOutput({error:'Invalid token'},{kind:'search'}),/OneMap error/);
 assert.throws(()=>onemapOutput({found:'1',results:{}},{kind:'search'}),/shape/);
 assert.throws(()=>onemapOutput({SearchResults:{}},{kind:'names'}),/shape/);
});

// --- Iteration 5: legacy v1 additions (NEA 4-day outlook, LTA traffic cameras) ---

test('new v1 sources share the conservative legacy bucket',()=> {
 for(const id of ['sg_weather_forecast_4day','sg_traffic_images']) {
  const s=SOURCES[id];assert.ok(s,id);assert.equal(s.host,'api.data.gov.sg');
  assert.deepEqual(s.bucket,{capacity:5,windowMs:10000});assert.equal(s.dateParam,true);
 }
});
test('4-day forecast fixture has four daily outlooks',()=> {
 const f=nea4day.items[0].forecasts;assert.equal(f.length,4);
 assert.ok(f[0].forecast&&f[0].temperature.high>=f[0].temperature.low);
});
test('traffic camera fixture has located image links',()=> {
 const cams=ltaCams.items[0].cameras;assert.ok(cams.length>0);
 for(const c of cams){assert.ok(c.camera_id&&c.image.startsWith('https://'));assert.ok(c.location.latitude>1.2&&c.location.latitude<1.5);}
});

// --- Iteration 6: PUB flood alerts (v2 real-time /weather/flood-alerts) ---

test('flood alerts source uses the v2 keyless bucket and 2-minute cache',()=> {
 const s=SOURCES.sg_flood_alerts;assert.ok(s);assert.equal(s.host,'api-open.data.gov.sg');
 assert.deepEqual(s.bucket,{capacity:5,windowMs:10000});assert.equal(s.ttlMs,2*60*1000);
 assert.equal(s.dateParam,true);assert.ok(s.url.endsWith('/weather/flood-alerts'));
});
test('flood alerts fixture has the v2 envelope and a records list',()=> {
 assert.equal(pubFlood.code,0);assert.ok(pubFlood.data&&Array.isArray(pubFlood.data.records));
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
  const init=await rpc('initialize',{protocolVersion:'2024-11-05'});assert.equal(init.result.serverInfo.version,'0.6.0');
  const list=await rpc('tools/list');assert.equal(list.result.tools.length,24);
  const bad=await rpc('tools/call',{name:'sg_dataset_rows',arguments:{dataset_id:'https://evil.invalid'}});assert.equal(bad.result.isError,true);
  const stats=await rpc('tools/call',{name:'sg_rate_limit_status'});assert.deepEqual(JSON.parse(stats.result.content[0].text).buckets,{});
 }finally{child.kill();}
});
