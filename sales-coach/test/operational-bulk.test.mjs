import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { CoachService } from '../service.mjs';
import { TwentyAdapter } from '../twenty.mjs';
import { buildServer } from '../mcp.mjs';

const id = n => `00000000-0000-4000-a000-${String(n).padStart(12,'0')}`;
const baseline = '2026-10-02T00:00:00.000Z';
const match = (row, filter) => Object.entries(filter ?? {}).every(([key,value]) => key === 'and' ? value.every(f => match(row,f)) : key === 'or' ? value.some(f => match(row,f)) : 'eq' in value ? row[key] === value.eq : 'in' in value ? value.in.includes(row[key]) : false);
async function fixture(t, role = 'executive') {
  const directory = await mkdtemp(join(tmpdir(),'coach-bulk-qa-'));
  t.after(() => rm(directory,{recursive:true,force:true}));
  const records = {
    companies: [{id:id(1),name:'QA Northstar',accountOwnerId:id(90),updatedAt:baseline},{id:id(2),name:'QA Southbank',accountOwnerId:id(90),updatedAt:baseline}],
    opportunities: [{id:id(3),name:'QA Autumn trial',companyId:id(1),ownerId:id(90),stage:'ENGAGED',updatedAt:baseline}],
    tasks: [{id:id(4),title:'QA summary',assigneeId:id(90),status:'TODO',updatedAt:baseline},{id:id(5),title:'QA follow-up',assigneeId:id(90),status:'TODO',updatedAt:baseline}],
    taskTargets: [{id:id(6),taskId:id(4),targetCompanyId:id(1)},{id:id(7),taskId:id(5),targetCompanyId:id(1)}],
    notes: [], noteTargets: [], people: []
  };
  let mutations = 0;
  const adapter = new TwentyAdapter({baseUrl:'https://isolated.invalid',apiKey:'synthetic-not-a-credential',scopeMode:'workspace',writeEnabled:true,externalEffectsReviewed:true,fetchImpl:async (_url,options) => {
    const {query,variables}=JSON.parse(options.body);
    let data;
    if(query.startsWith('query')) {
      const plural=query.match(/\{(\w+)\(filter:/)[1];
      const all=(records[plural]??[]).filter(row=>match(row,variables.filter));
      data={[plural]:{edges:all.slice(variables.offset,variables.offset+variables.limit).map(node=>({node})),totalCount:all.length,pageInfo:{hasNextPage:variables.offset+variables.limit<all.length}}};
    } else {
      assert.match(query,/CoachPatch/,'unexpected fixture operation');
      const operation=query.match(/\{(update\w+)\(/)[1];
      const plural=operation.slice(6); const key=plural[0].toLowerCase()+plural.slice(1);
      const changed=records[key].filter(row=>match(row,variables.filter));
      changed.forEach(row=>Object.assign(row,variables.data,{updatedAt:'2026-10-02T01:00:00.000Z'}));
      mutations++; data={[operation]:changed};
    }
    return {ok:true,json:async()=>({data})};
  }});
  const service=await new CoachService({contextDir:directory,actor:{id:`${role}@example.test`,role},adapter}).init();
  async function connect() {
    const server=buildServer(service); const client=new Client({name:'isolated-operational-qa',version:'1.0.0'});
    const [c,s]=InMemoryTransport.createLinkedPair(); await Promise.all([client.connect(c),server.connect(s)]);
    t.after(()=>client.close()); return client;
  }
  const client=await connect();
  const call=async(name,args)=>{const result=await client.callTool({name,arguments:args}); assert(!result.isError,result.content?.[0]?.text);return JSON.parse(result.content[0].text);};
  return {service,records,call,connect,get mutations(){return mutations;}};
}
async function evidence(name,value) {
  if(!process.env.COACH_QA_EVIDENCE_DIR)return;
  await mkdir(process.env.COACH_QA_EVIDENCE_DIR,{recursive:true});
  await writeFile(join(process.env.COACH_QA_EVIDENCE_DIR,name),JSON.stringify(value,null,2)+'\n');
}

test('MCP responsibility transfer is explicitly blocked for task, opportunity and account for executive and leader',async t=>{
  const outcomes=[];
  for(const role of ['executive','leader']) {
    const f=await fixture(t,role);
    const source=await f.call('retain_source',{sourceKey:'qa:handoff',text:'Transfer the summary task, Autumn trial opportunity and Northstar account to colleague QA Alex.'});
    const before=structuredClone(f.records);
    for(const [object,recordId,field] of [['task',id(4),'assigneeId'],['opportunity',id(3),'ownerId'],['company',id(1),'accountOwnerId']]) {
      const result=await f.call('crm_propose_change',{accountId:id(1),object,id:recordId,values:{[field]:id(91)},expectedUpdatedAt:baseline,sourceIds:[source.id],estimatedErrorCost:'low',highlyConsequential:false,reason:'Isolated capability probe, no real recipient'});
      assert.equal(result.state,'blocked'); assert.equal(result.errorCode,'FORBIDDEN_FIELD');
      outcomes.push({role,object,state:result.state,errorCode:result.errorCode});
    }
    assert.deepEqual(f.records,before); assert.equal(f.mutations,0);
  }
  await evidence('reassignment.json',{boundary:'real MCP SDK + production Twenty adapter + synthetic provider only',outcomes,providerMutations:0,featureSupported:false});
});

test('MCP bulk context batches preserve one exact transcript across accounts, retry and fresh connection',async t=>{
  const f=await fixture(t);
  const transcript=Array.from({length:105},(_,i)=>`Item ${i+1}: preserve operational detail ${i+1} for the correct account; do not treat this report as independently observed customer evidence.`).join('\n');
  const source=await f.call('retain_source',{sourceKey:'qa:bulk-transcript',kind:'executive-dictation-transcript',text:transcript});
  const makeEntry=i=>({id:`bulk-${i}`,kind:'commitment',text:`Operational detail ${i+1}`,status:'human-account',sourceIds:[source.id],association:{scope:'account'}});
  const oversized=await f.connect(); const rejected=await oversized.callTool({name:'update_account_context',arguments:{accountId:id(1),entries:Array.from({length:105},(_,i)=>makeEntry(i))}});
  assert.equal(rejected.isError,true); assert.equal((await f.service.store.account(id(1))).entries.length,0);
  const batches=[{accountId:id(1),entries:Array.from({length:100},(_,i)=>makeEntry(i))},{accountId:id(2),entries:Array.from({length:5},(_,i)=>makeEntry(i+100))}];
  for(const batch of batches) {await f.call('update_account_context',batch); await f.call('update_account_context',batch);}
  const correction=await f.call('retain_source',{sourceKey:'qa:bulk-correction',text:'Correction: operational detail 1 is due 8 October, not 6 October.'});
  await f.call('update_account_context',{accountId:id(1),entries:[{...makeEntry(0),text:correction.text,sourceIds:[correction.id]}]});
  const fresh=await f.connect();
  const read=async(name,args)=>JSON.parse((await fresh.callTool({name,arguments:args})).content[0].text);
  const original=await read('get_source',{sourceId:source.id}); assert.equal(original.text,transcript);
  const a=await read('get_account_context',{accountId:id(1),refresh:false,brief:true});
  const b=await read('get_account_context',{accountId:id(2),refresh:false,brief:true});
  assert.equal(a.account.entries.length,100); assert.equal(b.account.entries.length,5);
  assert.equal(a.account.entries.find(e=>e.id==='bulk-0').text,correction.text);
  assert.equal((await f.service.store.account(id(1))).entries.length,101);
  await evidence('bulk-contract.json',{boundary:'real MCP SDK + durable context store; interpretations supplied by test, not model extraction',submittedCharacters:transcript.length,items:105,batches:[100,5],oversizedRejectedBeforeWrite:true,retriesDuplicatedEntries:false,exactTranscriptPreserved:true,correctionHistoryRetained:true,freshConnectionRecall:true});
});

test('MCP mixed bulk changes preserve partial success, stale conflict and consequential hold without duplication',async t=>{
  const f=await fixture(t);
  const source=await f.call('retain_source',{sourceKey:'qa:bulk-actions',text:'Rename summary task. Complete follow-up. Mark trial Won only after human review.'});
  const propose=args=>f.call('crm_propose_change',{accountId:id(1),sourceIds:[source.id],estimatedErrorCost:'low',highlyConsequential:false,reason:'Synthetic bulk action',...args});
  const safe={object:'task',id:id(4),values:{title:'QA German summary'},expectedUpdatedAt:baseline};
  const applied=await propose(safe); assert.equal(applied.state,'applied');
  f.records.tasks[1].updatedAt='2026-10-02T00:30:00.000Z';
  const conflict=await propose({object:'task',id:id(5),values:{status:'DONE'},expectedUpdatedAt:baseline});assert.equal(conflict.state,'blocked');assert.equal(conflict.errorCode,'CONFLICT');
  const held=await propose({object:'opportunity',id:id(3),values:{stage:'WON'},expectedUpdatedAt:baseline,highlyConsequential:true});assert.equal(held.state,'awaiting-confirmation');
  assert.equal((await propose(safe)).state,'applied');assert.equal(f.mutations,1);
  assert.equal(f.records.tasks[0].title,'QA German summary');assert.equal(f.records.tasks[1].status,'TODO');assert.equal(f.records.opportunities[0].stage,'ENGAGED');
  await evidence('bulk-mixed-outcomes.json',{boundary:'real MCP SDK + production adapter + synthetic provider',applied:1,conflicts:1,awaitingHumanConfirmation:1,providerMutations:1,retryDuplicatedWrite:false,wholeBatchAtomic:false});
});
