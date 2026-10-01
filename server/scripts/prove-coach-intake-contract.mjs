import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes, randomUUID, createHash } from 'node:crypto';

const control = '/Users/user/.codex/tmp/bam-sales-coach-qa-control';
const privateQa = JSON.parse(await readFile(`${control}/private-qa.json`, 'utf8'));
const base = 'https://coach-api-qa.up.railway.app';
const email = 'crm-proof@example.test';
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
try {
  const token = await authorize();
  const instructions = await call(token, 'get_coach_instructions');
  const local = await readFile(new URL('../../sales-coach/skill/SKILL.md', import.meta.url));
  assert.equal(instructions.version, createHash('sha256').update(local).digest('hex'));
  checks.push('deployed centrally fetched instructions equal latest source hash');
  const source = await call(token, 'retain_source', { sourceKey: `uuid-new-account-proof:${randomUUID()}`, text: 'Synthetic verification: create one new isolated QA company with its reserved UUID; no outbound action.', kind: 'synthetic-test' });
  const before = await call(token, 'coach_status');
  const args = { accountId: 'invalid-qa-company-slug', object: 'company', values: { name: `QA UUID contract ${randomUUID().slice(0,8)}` }, sourceIds: [source.id], estimatedErrorCost: 'low', highlyConsequential: false, reason: 'Isolated synthetic UUID identity contract proof.' };
  const response = await fetchBounded(`${base}/coach/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${token}` }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'crm_propose_change', arguments: args } }) });
  assert.equal(response.status, 200);
  const raw = await response.text(), line = raw.split('\n').find(line => line.startsWith('data:'));
  const denied = JSON.parse(line ? line.slice(5) : raw); assert.equal(denied.result.isError, true);
  assert.equal((await call(token,'coach_status')).changes.length, before.changes.length);
  checks.push('invalid slug rejected by real HTTPS tool schema before proposal persistence');
  const accountId = randomUUID();
  const created = await call(token, 'crm_propose_change', { ...args, accountId });
  assert.equal(created.state, 'applied'); assert.equal(created.recordId, accountId);
  const readback = await call(token, 'crm_read', { object: 'company', id: accountId });
  assert.equal(readback.records[0].id, accountId); assert.equal(readback.records[0].name, args.values.name);
  checks.push('new UUID company created and read back through real isolated Twenty');
  const replay = await call(token, 'crm_propose_change', { ...args, accountId });
  assert.equal(replay.id, created.id); assert.equal(replay.recordId, accountId);
  checks.push('new-company replay preserves same proposal and record identity');
  const proof = { at: new Date().toISOString(), status: 'passed', url: base, context: 'crm-proof', instructionSHA256: instructions.version, accountId, proposalId: created.id, sourceId: source.id, checks };
  await writeFile(new URL('../../sales-coach/evidence/hosted-qa/intake-contract-proof.json',import.meta.url),JSON.stringify(proof,null,2)+'\n');
  console.log(JSON.stringify(proof,null,2));
} catch(error) { console.error(JSON.stringify({ status: 'failed', checks, error: error.message })); process.exitCode=1; }
