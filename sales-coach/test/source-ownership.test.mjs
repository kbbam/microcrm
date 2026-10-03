import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { saveTwentySourceAuthorization, createTwentySourceOwnershipReader, createTwentySourceMetadataReader } from '../twenty-source-ownership.mjs';
import { TwentyAdapter } from '../twenty.mjs';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const expected = { email: 'executive@example.test', workspaceId: id(1), memberId: id(2) };
const data = () => ({ currentUser:{email:expected.email,disabled:false,workspaceMember:{id:expected.memberId,userEmail:expected.email,userWorkspaceId:id(3)},currentWorkspace:{id:expected.workspaceId},currentUserWorkspace:{id:id(3)}},myConnectedAccounts:[{id:id(4),userWorkspaceId:id(3),archivedAt:null}],myMessageChannels:[{id:id(5),connectedAccountId:id(4)}],myCalendarChannels:[] });
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(),'coach-source-vault-'));t.after(()=>rm(root,{recursive:true,force:true}));
  let now=Date.parse('2026-10-02T00:00:00Z'),payload=data(),failRefresh=false;
  const calls=[];
  const options={file:join(root,'exec.twenty-token.json'),baseUrl:'https://crm.example.test',clientId:id(6),encryptionKey:randomBytes(32).toString('base64'),expected,userWorkspaceId:id(3),now:()=>now,fetchImpl:async(url,init)=>{
    calls.push({url,init});
    if(url.endsWith('/oauth/token'))return failRefresh?Response.json({error:'invalid_grant',error_description:'sensitive-provider-message'},{status:400}):Response.json({access_token:'rotated-private-access',refresh_token:'rotated-private-refresh',token_type:'Bearer',expires_in:3600});
    return Response.json({data:payload});
  }};
  const tokens={access_token:'initial-private-access',refresh_token:'initial-private-refresh',token_type:'Bearer',expires_in:60};
  await saveTwentySourceAuthorization(options,tokens);
  return {options,tokens,calls,reader:createTwentySourceOwnershipReader(options),advance:()=>now+=60001,setData:d=>payload=d,failRefresh:()=>failRefresh=true};
}

test('encrypted vault survives restart without plaintext, binds exact policy and detects tampering',async t=>{
  const f=await fixture(t),bytes=await readFile(f.options.file,'utf8');
  assert.doesNotMatch(bytes,/initial-private-access|initial-private-refresh|executive@example/);assert.equal((await stat(f.options.file)).mode&0o777,0o600);
  assert.deepEqual((await createTwentySourceOwnershipReader(f.options)()).messageChannelIds,[id(5)]);
  await assert.rejects(createTwentySourceOwnershipReader({...f.options,expected:{...expected,memberId:id(99)}}),/missing or unavailable/);
  const envelope=JSON.parse(bytes);envelope.tag=Buffer.alloc(16).toString('base64');await writeFile(f.options.file,JSON.stringify(envelope));await assert.rejects(f.reader,/missing or unavailable/);
});

test('every operation checks live ownership; shared or transferred connection disappears immediately',async t=>{
  const f=await fixture(t);assert.deepEqual((await f.reader()).messageChannelIds,[id(5)]);
  const moved=data();moved.myConnectedAccounts[0].userWorkspaceId=id(99);f.setData(moved);
  assert.deepEqual((await f.reader()).messageChannelIds,[]);assert.equal(f.calls.filter(c=>c.url.endsWith('/metadata')).length,2);
  const removed=data();removed.currentUser.disabled=true;f.setData(removed);await assert.rejects(f.reader,/no longer matches/);
});

test('expired tokens rotate atomically and concurrent checks do not reuse refresh tokens',async t=>{
  const f=await fixture(t);f.advance();await Promise.all([f.reader(),f.reader()]);
  const refresh=f.calls.filter(c=>c.url.endsWith('/oauth/token'));assert.equal(refresh.length,1);assert.equal(JSON.parse(refresh[0].init.body).refresh_token,'initial-private-refresh');
  assert.equal(f.calls.filter(c=>c.url.endsWith('/metadata')).length,2);assert.ok(f.calls.filter(c=>c.url.endsWith('/metadata')).every(c=>c.init.headers.Authorization==='Bearer rotated-private-access'));
  const bytes=await readFile(f.options.file,'utf8');assert.doesNotMatch(bytes,/rotated-private/);await createTwentySourceOwnershipReader(f.options)();assert.equal(f.calls.filter(c=>c.url.endsWith('/oauth/token')).length,1);
});

test('failed refresh grants no source access and emits no credential/provider details',async t=>{
  const f=await fixture(t),before=await readFile(f.options.file,'utf8');f.advance();f.failRefresh();
  await assert.rejects(f.reader,error=>{assert.doesNotMatch(error.message,/private-|sensitive-provider/);return error.code==='SOURCE_CONNECTION_REQUIRED';});
  assert.equal(f.calls.filter(c=>c.url.endsWith('/metadata')).length,0);assert.equal(await readFile(f.options.file,'utf8'),before);
});

test('assigned adapter intersects live ownership with registered IDs; caches only within one tool',async()=>{
  let checks=0,live=[id(5)],filters=[];
  const adapter=new TwentyAdapter({baseUrl:'https://crm.example.test',apiKey:'fixture',scopeMode:'assigned',assignment:{memberId:expected.memberId,companyOwnerField:'accountOwnerId',opportunityOwnerField:'ownerId'},messageChannelIds:[id(5)],sourceOwnershipRequired:true,resolveSourceChannels:async()=>{checks++;return{messageChannelIds:[...live,id(99)],calendarChannelIds:[]};}});
  adapter.request=async(_query,variables)=>{filters.push(variables.filter);return{messageChannelMessageAssociations:{edges:[{node:{messageId:id(7)}}],pageInfo:{hasNextPage:false}}};};
  adapter.authorizationScope=new AsyncLocalStorage();
  await adapter.authorizationScope.run({providers:new Map()},async()=>{assert.deepEqual((await adapter.channelRecordIds('message')).ids,[id(7)]);await adapter.channelRecordIds('message');});
  assert.equal(checks,1);assert.deepEqual(filters[0].and[0].messageChannelId.in,[id(5)]);
  live=[];await assert.rejects(()=>adapter.channelRecordIds('message'),{code:'SOURCE_OWNERSHIP_REVOKED'});assert.equal(checks,2);assert.equal(filters.length,2);
});

test('partial channel revocation discloses the scope gap and verified no-channel receipt requires setup',async()=>{
  const options={baseUrl:'https://crm.example.test',apiKey:'fixture',scopeMode:'assigned',assignment:{memberId:expected.memberId,companyOwnerField:'accountOwnerId',opportunityOwnerField:'ownerId'},sourceOwnershipRequired:true,resolveSourceChannels:async()=>({messageChannelIds:[id(5)],calendarChannelIds:[],messageChannels:[],calendarChannels:[]})};
  const adapter=new TwentyAdapter({...options,messageChannelIds:[id(5),id(8)]});
  adapter.request=async(_query,variables)=>{assert.deepEqual(variables.filter.and[0].messageChannelId.in,[id(5)]);return{messageChannelMessageAssociations:{edges:[],pageInfo:{hasNextPage:false}}};};
  const scope=await adapter.channelRecordIds('message');assert.equal(scope.sourceSync.authorizationComplete,false);assert.equal(scope.sourceSync.registeredChannelCount,2);assert.equal(scope.sourceSync.authorizedChannelCount,1);assert.equal(scope.sourceSync.revokedChannelCount,1);
  await assert.rejects(()=>new TwentyAdapter(options).channelRecordIds('message'),{code:'SOURCE_CONNECTION_REQUIRED'});
});

test('pending assigned source setup fails explicitly instead of silently reporting an empty mailbox',async()=>{
  const adapter=new TwentyAdapter({baseUrl:'https://crm.example.test',apiKey:'fixture',scopeMode:'assigned',assignment:{memberId:expected.memberId,companyOwnerField:'accountOwnerId',opportunityOwnerField:'ownerId'},sourceOwnershipRequired:true});
  await assert.rejects(()=>adapter.channelRecordIds('message'),error=>error.code==='SOURCE_CONNECTION_REQUIRED');
});

test('source sync/auth gaps preserve readable owned history while limiting no-new-activity inference',async t=>{
  const f=await fixture(t),d=data();d.myConnectedAccounts[0].authFailedAt='2026-10-01T00:00:00Z';
  d.myMessageChannels[0]={...d.myMessageChannels[0],isSyncEnabled:false,syncedAt:'2026-10-01T00:00:00Z',syncStatus:'NOT_SYNCED',syncStage:'FULL'};f.setData(d);
  const current=await f.reader();assert.deepEqual(current.messageChannelIds,[id(5)]);assert.equal(current.messageChannels[0].authFailed,true);assert.equal(current.messageChannels[0].isSyncEnabled,false);
  const adapter=new TwentyAdapter({baseUrl:'https://crm.example.test',apiKey:'fixture',scopeMode:'assigned',assignment:{memberId:expected.memberId,companyOwnerField:'accountOwnerId',opportunityOwnerField:'ownerId'},messageChannelIds:[id(5)],sourceOwnershipRequired:true,resolveSourceChannels:f.reader});
  adapter.assignedPortfolio=async()=>({companyIds:[],visibleCompanyIds:[],opportunityIds:[],contactIds:[]});
  adapter.request=async()=>({messageChannelMessageAssociations:{edges:[{node:{messageId:id(7)}}],pageInfo:{hasNextPage:false}}});
  adapter.page=async()=>({records:[{id:id(7),text:'Owned historical message'}],coverage:{complete:true,hasNextPage:false}});
  const read=await adapter.read({object:'message'});assert.equal(read.records[0].text,'Owned historical message');assert.equal(read.coverage.currentSourceCoverageVerified,false);
  assert.equal(read.coverage.sourceSync.channels[0].syncStatus,'NOT_SYNCED');assert.equal(read.coverage.sourceSync.channels[0].syncedAt,'2026-10-01T00:00:00Z');assert.match(read.coverage.warning,/do not prove current/);
});


test('status metadata reader rotates the saved authorization and verifies ownership before returning fresh data',async t=>{
  const f=await fixture(t);f.advance();const read=createTwentySourceMetadataReader(f.options),fresh=await read();
  assert.equal(fresh.checkedAt,'2026-10-02T00:01:00.001Z');assert.deepEqual(fresh.data,data());assert.doesNotMatch(JSON.stringify(fresh),/private-access|private-refresh/);
  assert.equal(f.calls.filter(c=>c.url.endsWith('/oauth/token')).length,1);
  const wrong=data();wrong.currentUser.currentWorkspace.id=id(99);f.setData(wrong);await assert.rejects(read,e=>e.code==='SOURCE_OWNERSHIP_REVOKED');
});
