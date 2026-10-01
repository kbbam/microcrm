import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { TwentyAdapter } from '../twenty.mjs';

const company='00000000-0000-4000-a000-000000000001';
const other='00000000-0000-4000-a000-000000000002';
const task='00000000-0000-4000-a000-000000000003';
const rev='2026-09-30T00:00:00.000Z';
const sqlLike=(text,pattern)=>{
  let regex='';
  for(let i=0;i<pattern.length;i++){
    const character=pattern[i];
    if(character==='\\'&&i+1<pattern.length) regex+=pattern[++i].replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    else regex+=character==='%'?'.*':character==='_'?'.':character.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  }
  return new RegExp(`^${regex}$`,'i').test(text??'');
};
const matches=(row,f)=>!f||Object.entries(f).every(([key,value])=>key==='and'?value.every(x=>matches(row,x)):key==='or'?value.some(x=>matches(row,x)):'ilike'in value?sqlLike(row[key],value.ilike):'in'in value?value.in.includes(row[key]):'eq'in value?row[key]===value.eq:matches(row[key]??{},value));
async function fixture(t,{badStage=false,race=false,failAttach=false,scopeMode='accounts'}={}) {
  const records={companies:[{id:company,name:'Synthetic account',updatedAt:rev},{id:other,name:'Outside pilot',updatedAt:rev}],people:[],opportunities:[],notes:[],tasks:[{id:task,title:'Human task',updatedAt:rev}],taskTargets:[{id:other,targetCompanyId:company,taskId:task,updatedAt:rev}],noteTargets:[],messages:[],calendarEvents:[],messageThreadTargets:[],calendarEventTargets:[]};
  const calls=[]; let attachmentFailed=false;
  const plural={Company:'companies',Person:'people',Opportunity:'opportunities',Note:'notes',Task:'tasks',NoteTarget:'noteTargets',TaskTarget:'taskTargets'};
  const server=createServer(async(req,res)=>{
    let text='';for await(const c of req)text+=c;
    const {query,variables:v}=JSON.parse(text);calls.push({query,variables:v}); let data;
    if(query.includes('__type')) data={stage:{enumValues:(badStage?['NEW']:['APPROACHING','ENGAGED','COMMERCIAL','WON','LOST']).map(name=>({name}))},query:{fields:Object.values(plural).map(name=>({name}))},mutation:{fields:[]}};
    else if(query.startsWith('query')) {
      const p=query.match(/\{(\w+)\(filter:/)[1];const all=(records[p]??[]).filter(r=>matches(p==='messageParticipants'?{...r,message:records.messages.find(m=>m.id===r.messageId)}:r,v.filter));const slice=all.slice(v.offset??0,(v.offset??0)+v.limit);
      data={[p]:{edges:slice.map(node=>({node})),totalCount:all.length,pageInfo:{hasNextPage:(v.offset??0)+v.limit<all.length,endCursor:null}}};
    }else if(query.includes('CoachPatch')) {
      const p=query.match(/\{update(\w+)\(/)[1];const key=p[0].toLowerCase()+p.slice(1);
      if(race)(records[key]??[]).filter(r=>r.id===task).forEach(r=>{r.title='Intervening human edit';r.updatedAt='2026-09-30T01:00:00.000Z';});
      const changed=(records[key]??[]).filter(r=>matches(r,v.filter));changed.forEach(r=>Object.assign(r,v.data,{updatedAt:'2026-09-30T02:00:00.000Z'}));data={['update'+p]:changed};
    }else{
      const type=query.match(/\{create(\w+)\(/)[1];
      if(type==='NoteTarget'&&failAttach&&!attachmentFailed){attachmentFailed=true;res.end(JSON.stringify({errors:[{message:'synthetic attachment failure'}]}));return;}
      const record={...v.data,updatedAt:rev};records[plural[type]].push(record);data={['create'+type]:record};
    }
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data}));
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
  const adapter=new TwentyAdapter({baseUrl:`http://127.0.0.1:${server.address().port}`,apiKey:'synthetic-only',scopeCompanyIds:scopeMode==='accounts'?[company]:[],scopeMode,writeEnabled:true,externalEffectsReviewed:true});
  return {adapter,records,calls};
}
test('account scope, scoped task targets and pagination coverage',async t=>{
  const {adapter,records}=await fixture(t);assert.deepEqual((await adapter.read({object:'company'})).records.map(r=>r.id),[company]);
  await assert.rejects(adapter.read({object:'company',companyId:other}),{code:'OUT_OF_SCOPE'});
  assert.equal((await adapter.read({object:'task'})).records[0].title,'Human task');
  records.companies.push({id:company,name:'page two',updatedAt:rev});
  const first=await adapter.read({object:'company',limit:1});assert.equal(first.coverage.complete,false);assert.equal(first.coverage.hasNextPage,true);
  assert.equal((await adapter.read({object:'company',limit:1,offset:1})).coverage.complete,false);
});

test('named email and participant filters stay inside account scope and do not turn substring wildcards into broader access',async t=>{
  const {adapter,records,calls}=await fixture(t);
  records.messageThreadTargets.push({id:company,targetCompanyId:company,messageThreadId:task},{id:other,targetCompanyId:other,messageThreadId:other});
  records.messages.push({id:company,messageThreadId:task,subject:'Trial 100%_confirmed',text:'Authorized source'},
    {id:other,messageThreadId:other,subject:'Trial 100%_confirmed',text:'Outside source'},
    {id:task,messageThreadId:task,subject:'Trial 100xconfirmed',text:'Different literal substring'});
  records.messageParticipants=[{id:company,messageId:company,handle:'anna@example.test'},{id:other,messageId:other,handle:'outside@example.test'},{id:task,messageId:task,handle:'other-message@example.test'}];
  const found=await adapter.read({object:'message',subjectContains:'100%_confirmed'});
  assert.deepEqual(found.records.map(r=>r.id),[company]);
  assert.equal(found.coverage.requestedSubset.subjectContains,'100%_confirmed');
  assert.equal(found.coverage.sourceCapabilities.mailboxSynchronization,'unverified');
  assert.equal((await adapter.read({object:'message',messageThreadId:other})).records.length,0);
  assert.equal((await adapter.read({object:'messageParticipant',messageThreadId:other})).records.length,0);
  const participants=await adapter.read({object:'messageParticipant',messageThreadId:task,messageId:company});
  assert.deepEqual(participants.records.map(r=>r.handle),['anna@example.test']);
  const discovery=calls.filter(c=>c.query.includes('messages(')&&c.query.includes('node{id}'));
  assert(discovery.length>0,'participant scope discovers identifiers without fetching bodies');
  const before=calls.length;
  for(const args of [{object:'company',subjectContains:'trial'},{object:'calendarEvent',messageThreadId:task},{object:'message',messageId:company},{object:'message',subjectContains:'   '}])
    await assert.rejects(adapter.read(args),{code:'INVALID_FILTER'});
  assert.equal(calls.length,before,'invalid selector fails before provider access');
});

test('workspace email thread and message participant intersection narrows the provider query',async t=>{
  const {adapter,records}=await fixture(t,{scopeMode:'workspace'});
  records.messages.push({id:company,messageThreadId:task,subject:'QA trial'},{id:other,messageThreadId:other,subject:'Other'});
  records.messageParticipants=[{id:company,messageId:company},{id:other,messageId:other}];
  assert.deepEqual((await adapter.read({object:'message',subjectContains:'qa TRIAL'})).records.map(r=>r.id),[company]);
  assert.deepEqual((await adapter.read({object:'messageParticipant',messageThreadId:task})).records.map(r=>r.id),[company]);
  assert.equal((await adapter.read({object:'messageParticipant',messageThreadId:task,messageId:other})).records.length,0);
});
test('writes require two deployment flags and bounded permitted fields',async t=>{
  const {adapter,calls}=await fixture(t);adapter.writeEnabled=false;
  await assert.rejects(adapter.update({object:'task',id:task,values:{title:'x'},expectedUpdatedAt:rev}),{code:'WRITES_DISABLED'});
  adapter.writeEnabled=true;adapter.externalEffectsReviewed=false;
  await assert.rejects(adapter.create({object:'company',values:{id:company,name:'x'}}),{code:'WRITES_DISABLED'});
  adapter.externalEffectsReviewed=true;
  await assert.rejects(adapter.update({object:'task',id:task,values:{deletedAt:rev},expectedUpdatedAt:rev}),{code:'FORBIDDEN_FIELD'});
  await assert.rejects(adapter.create({object:'messages',values:{id:task,text:'send'}}),{code:'READ_ONLY_OBJECT'});
  assert.equal(calls.length,0);
});
test('successful atomic patch and readback; stale baseline never overwrites human',async t=>{
  const {adapter,records}=await fixture(t);
  const updated=await adapter.update({object:'task',id:task,values:{title:'Coach task'},expectedUpdatedAt:rev});assert.equal(updated.record.title,'Coach task');assert.equal(updated.before.title,'Human task');
  await assert.rejects(adapter.update({object:'task',id:task,values:{title:'Stale'},expectedUpdatedAt:rev}),{code:'CONFLICT'});assert.equal(records.tasks[0].title,'Coach task');
});
test('concurrent edit between read and patch is protected by server-side revision filter',async t=>{
  const {adapter,records}=await fixture(t,{race:true});
  await assert.rejects(adapter.update({object:'task',id:task,values:{title:'Stale'},expectedUpdatedAt:rev}),{code:'CONFLICT'});
  assert.equal(records.tasks[0].title,'Intervening human edit');
});
test('Won is soft judgment without signature/order gate; incompatible native stages fail closed',async t=>{
  const {adapter}=await fixture(t);
  const r=await adapter.create({object:'opportunity',values:{id:task,companyId:company,name:'Synthetic pursuit',stage:'WON'}});assert.equal(r.record.stage,'WON');
  const bad=await fixture(t,{badStage:true});await assert.rejects(bad.adapter.create({object:'opportunity',values:{id:task,companyId:company,stage:'WON'}}),{code:'PIPELINE_SETUP_REQUIRED'});
});
test('note create attaches to account; interrupted target creation retries stable IDs without duplicates',async t=>{
  const {adapter,records}=await fixture(t,{failAttach:true});
  const proposal={object:'note',values:{id:task,companyId:company,title:'Evidence',bodyV2:{markdown:'Source context remains in durable account files.'}}};
  await assert.rejects(adapter.create(proposal),{code:'CRM_SCHEMA_OR_ACCESS'});
  const r=await adapter.create(proposal);assert.equal(r.record.id,task);assert.equal(records.notes.length,1);assert.equal(records.noteTargets.length,1);
  await adapter.create(proposal);assert.equal(records.notes.length,1);assert.equal(records.noteTargets.length,1);
});
test('scope is mandatory even for reads; arbitrary object/template injection rejected',async t=>{
  const {adapter}=await fixture(t);await assert.rejects(adapter.read({object:'messages){sendEmail'}),{code:'UNSUPPORTED_OBJECT'});
  adapter.scope=[];await assert.rejects(adapter.read({object:'company'}),{code:'SCOPE_REQUIRED'});
});
test('account communications follow targets, and participant reads remain in scope',async t=>{
  const {adapter,records}=await fixture(t);
  records.messageThreadTargets.push({id:other,targetCompanyId:company,messageThreadId:task});
  records.messages.push({id:other,messageThreadId:task,text:'Account source'},{id:task,messageThreadId:other,text:'Other source'});
  records.messageParticipants=[{id:company,messageId:other,handle:'synthetic@example.invalid'},{id:other,messageId:task,handle:'outside@example.invalid'}];
  assert.deepEqual((await adapter.read({object:'message'})).records.map(r=>r.text),['Account source']);
  assert.deepEqual((await adapter.read({object:'messageParticipant'})).records.map(r=>r.handle),['synthetic@example.invalid']);
});
test('protected message fields are unavailable evidence, distinct from empty, absent and readable content', async t => {
  const {adapter,records}=await fixture(t,{scopeMode:'workspace'});
  const restricted='FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED';
  records.messages=[
    {id:company,subject:'Visible subject',text:restricted,messageThreadId:task},
    {id:other,subject:restricted,text:'Genuine customer text',messageThreadId:task},
    {id:task,subject:'Empty body',text:'',messageThreadId:task},
    {id:'00000000-0000-4000-a000-000000000004',subject:'Absent body',text:null,messageThreadId:task},
  ];
  const result=await adapter.read({object:'message'});
  assert.equal(result.records[0].text,null);
  assert.deepEqual(result.records[0].contentAvailability.text,{status:'restricted',reason:'additional-permissions-required'});
  assert.equal(result.records[0].subject,'Visible subject');
  assert.equal(result.records[1].subject,null);
  assert.equal(result.records[1].text,'Genuine customer text');
  assert.equal(result.records[1].contentAvailability.text.status,'available');
  assert.equal(result.records[2].text,'');
  assert.equal(result.records[2].contentAvailability.text.status,'empty');
  assert.equal(result.records[3].contentAvailability.text.status,'notProvided');
  assert.equal(JSON.stringify(result).includes(restricted),false);
  assert.equal(records.messages[0].text,restricted,'sanitize the returned projection without altering provider records');
  assert.equal(result.coverage.complete,true,'all records were paginated, independent of content access');
  assert.equal(result.coverage.contentAccessUnrestricted,false);
  assert.equal(result.coverage.contentAvailability.restrictedRecordCount,2);
  assert.deepEqual(result.coverage.contentAvailability.fields.text,{available:1,empty:1,notProvided:1,restricted:1});
  assert.equal(result.coverage.sourceCapabilities.body,'plain-text-when-authorized');
  assert.match(result.coverage.warning,/withheld.*additional permissions/);
});
test('calendar and participant restriction sentinels are not returned as event or identity facts', async t => {
  const {adapter,records}=await fixture(t,{scopeMode:'workspace'});
  const restricted='FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED';
  records.calendarEvents=[{id:task,title:restricted,description:'Actual meeting description',location:restricted,startsAt:'2026-10-05T12:00:00Z',isCanceled:false}];
  records.calendarEventParticipants=[{id:other,calendarEventId:task,displayName:restricted,handle:'buyer@example.invalid'}];
  const event=await adapter.read({object:'calendarEvent'});
  assert.equal(event.records[0].title,null);
  assert.equal(event.records[0].location,null);
  assert.equal(event.records[0].description,'Actual meeting description');
  assert.equal(event.records[0].contentAvailability.isCanceled.status,'available','false is not an absent value');
  assert.equal(event.coverage.contentAccessUnrestricted,false);
  const participant=await adapter.read({object:'calendarEventParticipant'});
  assert.equal(participant.records[0].displayName,null);
  assert.equal(participant.records[0].handle,'buyer@example.invalid');
  assert.equal(participant.coverage.contentAccessUnrestricted,false);
  assert.equal(JSON.stringify([event,participant]).includes(restricted),false);
});
test('readable content is preserved exactly and content access is separate from page coverage', async t => {
  const {adapter,records}=await fixture(t,{scopeMode:'workspace'});
  const body='Actual text mentioning FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED as part of a sentence.\nSecond line.';
  records.messages=[{id:company,subject:'Visible',text:body},{id:other,subject:'Second',text:'Another body'}];
  const result=await adapter.read({object:'message',limit:1});
  assert.equal(result.records[0].text,body,'only the exact provider sentinel is interpreted as restricted');
  assert.equal(result.coverage.complete,false);
  assert.equal(result.coverage.contentAccessUnrestricted,true);
  assert.equal(result.coverage.contentAvailability.restrictedRecordCount,0);
  assert.equal(result.coverage.warning,undefined);
});
test('bounded relationship discovery discloses incomplete context coverage',async t=>{
  const {adapter,records}=await fixture(t);
  records.noteTargets=Array.from({length:1001},(_,i)=>({id:other,targetCompanyId:company,noteId:task}));
  records.notes=[{id:task,title:'Linked evidence'}];
  const r=await adapter.read({object:'note',limit:1});assert.equal(r.records.length,1);assert.equal(r.coverage.complete,false);assert.equal(r.coverage.scopeComplete,false);assert.match(r.coverage.warning,/partial/);
});
test('trusted isolated workspace mode reconstructs a new account and its related CRM projections',async t=>{
  const {adapter,records}=await fixture(t,{scopeMode:'workspace'});
  const newCompany='00000000-0000-4000-a000-000000000010';
  const noteId='00000000-0000-4000-a000-000000000011';
  const taskId='00000000-0000-4000-a000-000000000012';
  const opportunityId='00000000-0000-4000-a000-000000000013';
  assert.equal((await adapter.create({object:'company',values:{id:newCompany,name:'Reconstructed synthetic account'}})).record.id,newCompany);
  await adapter.create({object:'note',values:{id:noteId,companyId:newCompany,title:'Sourced reconstruction',bodyV2:{markdown:'Synthetic evidence'}}});
  await adapter.create({object:'task',values:{id:taskId,companyId:newCompany,title:'Prepare synthetic discussion'}});
  await adapter.create({object:'opportunity',values:{id:opportunityId,companyId:newCompany,name:'Distinct synthetic pursuit',stage:'APPROACHING'}});
  for(const [object,id] of [['note',noteId],['task',taskId],['opportunity',opportunityId]]) assert.deepEqual((await adapter.read({object,companyId:newCompany})).records.map(r=>r.id),[id]);
  assert.equal((await adapter.read({object:'company',id:newCompany})).records[0].name,'Reconstructed synthetic account');
  adapter.writeEnabled=false;await assert.rejects(adapter.create({object:'company',values:{id:newCompany,name:'x'}}),{code:'WRITES_DISABLED'});
  adapter.writeEnabled=true;adapter.externalEffectsReviewed=false;await assert.rejects(adapter.create({object:'company',values:{id:newCompany,name:'x'}}),{code:'WRITES_DISABLED'});
});
test('default account scope refuses an unreserved new account ID',async t=>{
  const {adapter}=await fixture(t);await assert.rejects(adapter.create({object:'company',values:{id:task,name:'Unapproved new account'}}),{code:'OUT_OF_SCOPE'});
});
test('person email writes require separate trusted automation review; ordinary fields remain available',async t=>{
  const {adapter}=await fixture(t);
  const emails={primaryEmail:'synthetic@example.invalid',additionalEmails:[]};
  await assert.rejects(adapter.values('person',{emails},false),{code:'UNREVIEWED_EXTERNAL_EFFECT'});
  assert.deepEqual(await adapter.values('person',{name:{firstName:'Synthetic',lastName:'Person'},jobTitle:'Buyer'},false),{name:{firstName:'Synthetic',lastName:'Person'},jobTitle:'Buyer'});
  adapter.allowPersonEmailWrites=true;
  assert.deepEqual(await adapter.values('person',{emails},false),{emails});
});


test('provider rich-text defaults permit interrupted creation retry without treating changed supplied text as identical', async t => {
  const {adapter,records}=await fixture(t,{failAttach:true});
  const values={id:task,companyId:company,title:'Synthetic note',bodyV2:{markdown:'Keep the exact supplied text.'}};
  await assert.rejects(adapter.create({object:'note',values}),{code:'CRM_SCHEMA_OR_ACCESS'});
  records.notes[0].bodyV2={blocknote:null,markdown:'Keep the exact supplied text.'};
  const recovered=await adapter.create({object:'note',values});
  assert.equal(recovered.record.bodyV2.markdown,values.bodyV2.markdown);
  assert.equal(records.notes.length,1);
  assert.equal(records.noteTargets.length,1);
  await assert.rejects(adapter.create({object:'note',values:{...values,bodyV2:{markdown:'Different supplied text.'}}}),{code:'ID_COLLISION'});
  assert.equal(records.notes.length,1);
});
