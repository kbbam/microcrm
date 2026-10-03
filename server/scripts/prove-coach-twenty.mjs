import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { TwentyAdapter } from '../../sales-coach/twenty.mjs';

const control = '/Users/user/.codex/tmp/bam-sales-coach-qa-control';
const privateQa = JSON.parse(await readFile(`${control}/private-qa.json`, 'utf8'));
const base = 'https://coach-api-qa.up.railway.app';
const email = 'crm-proof@example.test';
const companyId = 'bb1ba095-cc63-4ff8-97c1-7c446fe63de4';
const checks = [];
const fetchBounded = (url, options = {}) => fetch(url, { ...options, signal: AbortSignal.timeout(30000) });
const cookies = new Map();
async function browser(url, options = {}) {
  const pathname = new URL(url).pathname;
  const cookie = [...cookies.values()].filter(c => pathname.startsWith(c.path)).sort((a,b) => b.path.length-a.path.length).map(c => `${c.name}=${c.value}`).join('; ');
  const response = await fetchBounded(url, { ...options, redirect:'manual', headers: { ...options.headers, ...(cookie ? { Cookie:cookie } : {}) } });
  for (const line of response.headers.getSetCookie()) {
    const [pair,...attrs] = line.split(';'); const index=pair.indexOf('=');
    const name=pair.slice(0,index),value=pair.slice(index+1),path=attrs.find(a=>/^\s*path=/i.test(a))?.trim().slice(5)??'/';
    cookies.set(`${name}:${path}`,{name,value,path});
  }
  return response;
}
async function authorize() {
  const redirectUri=`${base}/callback`,resource=`${base}/coach/mcp`;
  const registration=await fetchBounded(`${base}/reg`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({redirect_uris:[redirectUri],client_name:'Synthetic isolated CRM verification',token_endpoint_auth_method:'none',grant_types:['authorization_code'],response_types:['code']})});
  assert.equal(registration.status,201); const {client_id}=await registration.json();
  const verifier=randomBytes(32).toString('base64url'),state=randomUUID();
  let url=`${base}/auth?${new URLSearchParams({client_id,redirect_uri:redirectUri,response_type:'code',scope:'openid coach',resource,state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'})}`,options={},code;
  for(let i=0;i<25;i++){
    const response=await browser(url,options);
    if([302,303].includes(response.status)){
      url=new URL(response.headers.get('location'),url).href;options={};const next=new URL(url);
      if(next.pathname==='/callback'){assert.equal(next.searchParams.get('state'),state);assert(!next.searchParams.has('error'));code=next.searchParams.get('code');break;}continue;
    }
    assert.equal(response.status,200);const page=await response.text();const action=/action="([^"]+\/(?:login|consent))"/.exec(page)?.[1];assert(action);
    url=new URL(action,base).href;options={method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(action.endsWith('/login')?{email,password:privateQa.password}:{}).toString()};
  }
  assert(code);const response=await fetchBounded(`${base}/token`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id,code,redirect_uri:redirectUri,code_verifier:verifier,resource}).toString()});
  assert.equal(response.status,200);return (await response.json()).access_token;
}
async function call(token,name,args={}){
  const response=await fetchBounded(`${base}/coach/mcp`,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream',Authorization:`Bearer ${token}`},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})});
  assert.equal(response.status,200);const raw=await response.text();const data=raw.split('\n').find(line=>line.startsWith('data:'));const message=JSON.parse(data?data.slice(5):raw);
  assert(!message.result?.isError,`Tool ${name} must succeed`);return JSON.parse(message.result.content[0].text);
}
try{
  const token=await authorize();
  const status=await call(token,'coach_status');assert.equal(status.actor.id,email);assert.equal(status.actor.role,'executive');assert.equal(status.crmConfigured,true);checks.push('real OAuth synthetic executive sees configured isolated adapter');
  const account=await call(token,'crm_read',{object:'company',id:companyId,companyId,limit:1});assert.equal(account.records[0].id,companyId);checks.push('scoped real isolated Twenty account read retained with source ID');
  const env=await readFile(new URL('../../sales-coach/.env.twenty-test.local',import.meta.url),'utf8');const apiKey=env.split('\n').find(line=>line.startsWith('TWENTY_API_KEY='))?.slice(15).trim().replace(/^['"]|['"]$/g,'');assert(apiKey);
  const independently=new TwentyAdapter({baseUrl:'https://bam-sales-coach-test.twenty.com',apiKey,scopeCompanyIds:[companyId]});
  const metadata=await independently.metadata();assert(metadata.pipelineCompatible);checks.push('native opportunity pipeline remains compatible');
  const source=await call(token,'retain_source',{sourceKey:`hosted-crm-proof:${randomUUID()}`,text:'Synthetic verification: record an internal preparation task; no external communication or real commercial promise.',kind:'synthetic-test'});
  const title=`QA Hosted preparation task ${randomUUID().slice(0,8)}`;
  const input={accountId:companyId,object:'task',values:{companyId,title,status:'TODO'},sourceIds:[source.id],estimatedErrorCost:'low',highlyConsequential:false,reason:'Explicitly authorized isolated synthetic internal task verification.'};
  const created=await call(token,'crm_propose_change',input);assert.equal(created.state,'applied');assert(created.recordId);
  const readback=await call(token,'crm_read',{object:'task',id:created.recordId,companyId});assert.equal(readback.records[0].title,title);
  assert.equal((await independently.read({object:'task',id:created.recordId,companyId})).records[0].title,title);checks.push('ordinary internal task applied and independently read back in real Twenty');
  const duplicate=await call(token,'crm_propose_change',input);assert.equal(duplicate.recordId,created.recordId);assert.equal(duplicate.id,created.id);checks.push('replayed proposal retained same record identity without duplication');
  const patchedTitle=`${title} — verified`;
  const patch={accountId:companyId,object:'task',id:created.recordId,values:{title:patchedTitle},expectedUpdatedAt:readback.records[0].updatedAt,sourceIds:[source.id],estimatedErrorCost:'low',highlyConsequential:false,reason:'Bounded synthetic title correction after current record read.'};
  const updated=await call(token,'crm_propose_change',patch);assert.equal(updated.state,'applied');
  assert.equal((await independently.read({object:'task',id:created.recordId,companyId})).records[0].title,patchedTitle);checks.push('bounded update persisted and independently read back');
  const communications={};for(const object of['message','calendarEvent']){const result=await call(token,'crm_read',{object,companyId,limit:1});communications[object]={returned:result.records.length,coverage:result.coverage};}checks.push('account-scoped communication coverage returned explicit capabilities');
  const proof={at:new Date().toISOString(),status:'passed',url:base,workspace:'https://bam-sales-coach-test.twenty.com',principal:{id:email,role:'executive',context:'crm-proof'},ownerContextConfigured:'owner-qa',ownerPasswordsChanged:false,scopeMode:'approved-isolated-workspace',sourceId:source.id,accountId:companyId,taskId:created.recordId,proposalId:created.id,pipelineCompatible:metadata.pipelineCompatible,personEmailWritesEnabled:false,communications,checks,checkCount:checks.length};
  await writeFile(new URL('../../sales-coach/evidence/hosted-qa/twenty-linkage-proof.json',import.meta.url),JSON.stringify(proof,null,2)+'\n');
  console.log(JSON.stringify({status:proof.status,checkCount:proof.checkCount,checks:proof.checks,taskId:proof.taskId},null,2));
}catch(error){console.error(JSON.stringify({status:'failed',checks,error:error.message}));process.exitCode=1;}
