import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createHash } from 'node:crypto';
import { createTwentySourceConnectionHandlers, createTwentySourceConfigStore, verifyTwentySourceReceipt } from '../dist/twenty-source-connection.js';
import { mkdtemp, writeFile, readFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const expected = { email: 'executive@example.test', workspaceId: id(1), memberId: id(2) };
const data = () => ({ currentUser: { id:id(3), email:expected.email, disabled:false, currentWorkspace:{id:expected.workspaceId}, workspaceMember:{id:expected.memberId,userEmail:expected.email,userWorkspaceId:id(4)},currentUserWorkspace:{id:id(4)} }, myConnectedAccounts:[{id:id(5),handle:expected.email,provider:'google',userWorkspaceId:id(4),archivedAt:null,authFailedAt:null}], myMessageChannels:[{id:id(6),connectedAccountId:id(5),handle:expected.email,isSyncEnabled:true,syncedAt:null,syncStatus:'NOT_SYNCED',syncStage:'FULL'}],myCalendarChannels:[] });

async function fixture(t, { retainAuthorization = false } = {}) {
  let time = Date.parse('2026-10-02T01:00:00Z'), grant = {id:expected.email,role:'executive',contextKey:'production'}, expectedGrant=expected, payload=data(), receipt=null;
  const calls=[];
  let savedAuthorization;
  const app=express(), server=app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${server.address().port}`, origin='https://crm.example.test';
  const handlers=createTwentySourceConnectionHandlers({publicUrl:base,twentyBaseUrl:origin,clientId:id(7),now:()=>time,
    readBrowserSession:async req=>req.headers.cookie?.includes('session=valid') ? {id:'session-one',accountId:expected.email}:req.headers.cookie?.includes('session=other')?{id:'session-two',accountId:expected.email}:null,
    createBrowserSession:async (accountId,res)=>{res.cookie('session','valid');return{id:'session-one',accountId};},
    resolvePrincipal:async()=>grant,expectedIdentity:async()=>expectedGrant,verifyPassword:async (email,password)=>email===expected.email&&password==='fixture-password',
    saveReceipt:async(_principal,value)=>{receipt=value;},readReceipt:async()=>receipt,render:view=>JSON.stringify(view),
    ...(retainAuthorization ? { saveAuthorization: async (principal, receipt, tokens) => { savedAuthorization = { principal, receipt, tokens }; } } : {}),
    fetch:async(url,options={})=>{
      calls.push({url,options});
      if(url.endsWith('/.well-known/oauth-authorization-server'))return Response.json({issuer:origin,authorization_endpoint:origin+'/authorize',token_endpoint:origin+'/oauth/token',revocation_endpoint:origin+'/oauth/revoke',code_challenge_methods_supported:['S256']});
      if(url.endsWith('/oauth/token'))return Response.json({access_token:'fixture-access',refresh_token:'fixture-refresh',token_type:'Bearer',expires_in:3600});
      if(url.endsWith('/metadata'))return Response.json({data:payload});
      if(url.endsWith('/oauth/revoke'))return Response.json({});
      throw new Error('unexpected provider route');
    },
  });
  app.get('/account/twenty/connect',handlers.connect);app.get('/account/twenty/callback',handlers.callback);app.get('/account/twenty/status',handlers.status);app.get('/account/twenty/login',handlers.loginGet);app.post('/account/twenty/login',express.urlencoded({extended:false}),handlers.loginPost);
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const req=(path,options={})=>fetch(base+path,{redirect:'manual',...options});
  const start=async()=>new URL((await req('/account/twenty/connect',{headers:{Cookie:'session=valid'}})).headers.get('location'));
  const finish=(url,query={},session='valid')=>req('/account/twenty/callback?'+new URLSearchParams({state:url.searchParams.get('state'),code:'fixture-code',iss:origin,...query}),{headers:{Cookie:'session='+session}});
  return {base,req,start,finish,calls,receipt:()=>receipt,savedAuthorization:()=>savedAuthorization,setData:v=>payload=v,setGrant:v=>grant=v,setExpected:v=>expectedGrant=v,advance:()=>time+=600001};
}

test('source-login allows the provider redirect while ordinary source pages retain local-form restrictions',async t=>{
  const f=await fixture(t);
  const login=await f.req('/account/twenty/login');
  assert.doesNotMatch(login.headers.get('content-security-policy'),/form-action/);
  assert.match(login.headers.get('content-security-policy'),/default-src 'none'/);
  assert.match(login.headers.get('content-security-policy'),/frame-ancestors 'none'/);
  const status=await f.req('/account/twenty/status',{headers:{Cookie:'session=valid'}});
  assert.match(status.headers.get('content-security-policy'),/form-action 'self'/);
});

test('receipt verifies exact caller identity and owned-channel foreign keys without copying credentials',()=>{
  const result=verifyTwentySourceReceipt(data(),expected,'2026-10-02T01:00:00Z');
  assert.deepEqual(result.messageChannelIds,[id(6)]);assert.deepEqual(result.calendarChannelIds,[]);
  assert.equal(result.messageChannels[0].syncedAt,null);
  for(const mutate of [d=>d.currentUser.email='other@example.test',d=>d.currentUser.currentWorkspace.id=id(99),d=>d.currentUser.workspaceMember.id=id(99),d=>d.myMessageChannels[0].connectedAccountId=id(99),d=>d.currentUser.disabled=true]){const d=data();mutate(d);assert.throws(()=>verifyTwentySourceReceipt(d,expected,'now'));}
  const shared=data();shared.myConnectedAccounts[0].userWorkspaceId=id(99);assert.deepEqual(verifyTwentySourceReceipt(shared,expected,'now').messageChannelIds,[]);
  const none=data();none.myConnectedAccounts=[];none.myMessageChannels=[];assert.deepEqual(verifyTwentySourceReceipt(none,expected,'now').messageChannelIds,[]);
});

test('one browser-authorized PKCE exchange saves a credential-free receipt, revokes tokens and refuses replay',async t=>{
  const f=await fixture(t),url=await f.start();
  assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert.equal(url.searchParams.get('scope'),'api profile');
  assert.equal(url.searchParams.get('redirect_uri'),f.base+'/account/twenty/callback');
  const finish=await f.finish(url);assert.equal(finish.status,303);
  // Final token cleanup runs after the callback sends its response.
  await new Promise(resolve=>setImmediate(resolve));
  const exchange=JSON.parse(f.calls.find(c=>c.url.endsWith('/oauth/token')).options.body);
  assert.equal(createHash('sha256').update(exchange.code_verifier).digest('base64url'),url.searchParams.get('code_challenge'));
  assert.ok(f.receipt());assert.doesNotMatch(JSON.stringify(f.receipt()),/fixture-access|fixture-refresh|verifier|password/);
  assert.equal(f.calls.filter(c=>c.url.endsWith('/oauth/revoke')).length,2);
  assert.equal((await f.finish(url)).status,403);assert.equal(f.calls.filter(c=>c.url.endsWith('/oauth/token')).length,1);
  const status=await f.req('/account/twenty/status',{headers:{Cookie:'session=valid'}});assert.equal((await status.json()).receipt.messageChannels[0].syncStatus,'NOT_SYNCED');
});

test('successful persistent source setup keeps authorization only in the server callback and exposes no tokens',async t=>{
  const f=await fixture(t,{retainAuthorization:true});assert.equal((await f.finish(await f.start())).status,303);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.savedAuthorization().principal.id,expected.email);assert.equal(f.savedAuthorization().tokens.refresh_token,'fixture-refresh');assert.equal(f.calls.filter(c=>c.url.endsWith('/oauth/revoke')).length,0);
  const status=await f.req('/account/twenty/status',{headers:{Cookie:'session=valid'}});assert.doesNotMatch(await status.text(),/fixture-access|fixture-refresh|code_verifier/);
});

test('wrong session, wrong issuer, changed authority and expired state grant no source access',async t=>{
  const f=await fixture(t);let url=await f.start();
  assert.equal((await f.finish(url,{},'other')).status,403);assert.equal(f.receipt(),null);
  assert.equal((await f.finish(url,{iss:'https://attacker.example'})).status,403);
  assert.equal(f.calls.filter(c=>c.url.endsWith('/oauth/token')).length,0);
  url=await f.start();f.setGrant(null);assert.equal((await f.finish(url)).status,403);assert.equal(f.receipt(),null);
  f.setGrant({id:expected.email,role:'executive',contextKey:'production'});url=await f.start();f.advance();assert.equal((await f.finish(url)).status,403);
});

test('metadata ownership failure revokes exchanged tokens and preserves previous authority',async t=>{
  const f=await fixture(t),d=data();d.myMessageChannels[0].connectedAccountId=id(99);f.setData(d);
  assert.equal((await f.finish(await f.start())).status,403);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.receipt(),null);assert.equal(f.calls.filter(c=>c.url.endsWith('/oauth/revoke')).length,2);
});

test('branded central sign-in requires same-origin nonce and browser session; bearer cannot bootstrap',async t=>{
  const f=await fixture(t);
  assert.equal((await f.req('/account/twenty/connect')).headers.get('location'),'/account/twenty/login');
  assert.equal((await f.req('/account/twenty/connect',{headers:{Authorization:'Bearer model-access'}})).status,403);
  const login=await f.req('/account/twenty/login'),body=await login.json(),cookies=login.headers.get('set-cookie').split(';')[0];
  const submit=(origin)=>f.req('/account/twenty/login',{method:'POST',headers:{Cookie:cookies,Origin:origin,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrf:body.csrf,email:expected.email,password:'fixture-password'})});
  assert.equal((await submit('https://attacker.example')).status,403);
  const approved=await submit(f.base);assert.equal(approved.status,303);assert.match(approved.headers.get('set-cookie'),/session=valid/);
  assert.equal(f.calls.length,0);
});

test('wrong-password retry stays in the login form with a new nonce and no credential exposure',async t=>{
  const f=await fixture(t),login=await f.req('/account/twenty/login'),body=await login.json();
  const response=await f.req('/account/twenty/login',{method:'POST',headers:{Cookie:login.headers.get('set-cookie').split(';')[0],Origin:f.base,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrf:body.csrf,email:expected.email,password:'incorrect-private-password'})});
  assert.equal(response.status,401);const retry=await response.json();assert.equal(retry.kind,'login');assert.equal(retry.email,expected.email);assert.notEqual(retry.csrf,body.csrf);assert.doesNotMatch(JSON.stringify(retry),/incorrect-private-password/);
});

test('verified source config persists atomically across restart, reloads actor context, and rejects changed trusted identity',async t=>{
  const root=await mkdtemp(join(tmpdir(),'twenty-source-config-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const principal={id:expected.email,role:'executive',contextKey:'production'},file=join(root,'production.json');
  const config={executiveId:expected.email,contextDir:'../context',unrelated:'preserved',twenty:{baseUrl:'https://crm.example.test',scopeMode:'assigned',assignment:{memberId:expected.memberId},messageChannelIds:[],calendarChannelIds:[]},sourceConnection:{expectedEmail:expected.email,verifiedWorkspaceId:expected.workspaceId,status:'awaiting-executive-connection'}};
  await writeFile(file,JSON.stringify(config));const reloads=[];
  const store=createTwentySourceConfigStore(root,'https://crm.example.test',async key=>{const stored=JSON.parse(await readFile(file,'utf8'));assert.deepEqual(stored.twenty.messageChannelIds,[id(6)]);reloads.push(key);});
  assert.deepEqual(await store.expectedIdentity(principal),expected);
  const receipt=verifyTwentySourceReceipt(data(),expected,'2026-10-02T01:00:00Z');await store.saveReceipt(principal,receipt);
  assert.deepEqual(reloads,['production']);assert.equal((await stat(file)).mode&0o777,0o600);
  const saved=JSON.parse(await readFile(file,'utf8'));assert.equal(saved.unrelated,'preserved');assert.equal(saved.sourceConnection.status,'awaiting-source-sync');
  const restart=createTwentySourceConfigStore(root,'https://crm.example.test',async()=>{});assert.deepEqual(await restart.readReceipt(principal),receipt);
  await assert.rejects(()=>store.expectedIdentity({...principal,role:'admin'}));await assert.rejects(()=>store.expectedIdentity({...principal,contextKey:'../escape'}));
  saved.twenty.assignment.memberId=id(99);await writeFile(file,JSON.stringify(saved));
  assert.equal(await restart.readReceipt(principal),null);await assert.rejects(()=>store.saveReceipt(principal,receipt));assert.equal(reloads.length,1);
});
