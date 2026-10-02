import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

if (!process.env.DATABASE_URL) throw Error('DATABASE_URL must point to an isolated test Postgres database.');

test('public MCP consent survives restart and access expiry; refresh rotates with exact audience and revocation', async t => {
  const base = 'http://127.0.0.1:8092';
  const url = new URL(process.env.DATABASE_URL);
  url.searchParams.set('options', '-c search_path=auth_oauth_test');
  const pool = new pg.Pool({connectionString:url.toString(),ssl:false});
  await pool.query('CREATE SCHEMA IF NOT EXISTS auth_oauth_test');
  const jwk = crypto.generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({format:'jwk'});
  Object.assign(jwk,{kid:'isolated-auth-test',alg:'RS256',use:'sig'});
  let child;
  const start = async () => {
    child = spawn(process.execPath,[fileURLToPath(new URL('../dist/index.js',import.meta.url))],{cwd:fileURLToPath(new URL('..',import.meta.url)),env:{...process.env,DATABASE_URL:url.toString(),LOCAL_INSECURE_DB:'1',COACH_ENABLED:'1',PUBLIC_URL:base,PORT:'8092',COOKIE_SECRET:'isolated-lifecycle-test-only',OIDC_JWKS:JSON.stringify({keys:[jwk]})},stdio:['ignore','pipe','pipe']});
    await new Promise((resolve,reject) => {
      let logs='';const timer=setTimeout(()=>reject(Error('Isolated OAuth server did not start.')),10000);
      child.stdout.on('data',chunk=>{logs+=chunk;if(logs.includes('listening on')){clearTimeout(timer);resolve();}});
      child.once('exit',()=>{clearTimeout(timer);reject(Error('Isolated OAuth server exited before listening.'));});
    });
  };
  const stop = async () => { if(child && child.exitCode===null){child.kill('SIGTERM');await once(child,'exit');} };
  t.after(async()=>{await stop();await pool.end();});
  await start();
  const email=`oauth-${crypto.randomUUID()}@example.test`;
  const password='isolated-lifecycle-password';
  const bcrypt=await import('bcryptjs');
  await pool.query("INSERT INTO users(email,status,password_hash) VALUES($1,'active',$2)",[email,await bcrypt.default.hash(password,4)]);
  const registration=await fetch(base+'/reg',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_name:'Isolated public MCP client',redirect_uris:[base+'/fixture-callback'],grant_types:['authorization_code','refresh_token'],response_types:['code'],token_endpoint_auth_method:'none'})});
  assert.equal(registration.status,201);
  const client=await registration.json();
  const verifier=crypto.randomBytes(32).toString('base64url');
  const cookieJar=new Map();
  const request=async(path,options={})=>{
    const response=await fetch(new URL(path,base),{redirect:'manual',...options,headers:{Cookie:[...cookieJar].map(([k,v])=>`${k}=${v}`).join('; '),...(options.headers??{})}});
    for(const cookie of response.headers.getSetCookie()){const pair=cookie.split(';')[0];const split=pair.indexOf('=');cookieJar.set(pair.slice(0,split),pair.slice(split+1));}
    return response;
  };
  const follow=async response=>{
    while([302,303].includes(response.status)){
      const next=new URL(response.headers.get('location'),base);
      if(next.pathname==='/fixture-callback')return {callback:next};
      response=await request(next.href);
    }
    return {response,html:await response.text()};
  };
  const authorize=base+'/auth?'+new URLSearchParams({client_id:client.client_id,redirect_uri:base+'/fixture-callback',response_type:'code',scope:'coach',resource:base+'/coach/mcp',code_challenge:crypto.createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',state:'isolated-state'});
  const unregistered=new URL(authorize);
  unregistered.searchParams.set('redirect_uri','https://unregistered.example.test/callback');
  const rejected=await request(unregistered.href);
  assert.equal(rejected.status,400);
  assert.equal(rejected.headers.get('location'),null);
  let state=await follow(await request(authorize));
  assert.match(state.html,/Sign in to Business OS/);
  assert.doesNotMatch(state.response.headers.get('content-security-policy'),/form-action/);
  assert.match(state.response.headers.get('content-security-policy'),/default-src 'none'/);
  let action=state.html.match(/<form method="post" action="([^"]+)\/login"/)[1]+'/login';
  state=await follow(await request(action,{method:'POST',body:new URLSearchParams({email,password})}));
  assert.match(state.html,/Connect this app/);
  assert.doesNotMatch(state.response.headers.get('content-security-policy'),/form-action/);
  assert.match(state.response.headers.get('content-security-policy'),/frame-ancestors 'none'/);
  action=state.html.match(/<form method="post" action="([^"]+)\/consent"/)[1]+'/consent';
  state=await follow(await request(action,{method:'POST',body:new URLSearchParams()}));
  assert.equal(state.callback.searchParams.get('state'),'isolated-state');
  const metadata=await (await fetch(base+'/.well-known/openid-configuration')).json();
  const token=async fields=>{const response=await fetch(metadata.token_endpoint,{method:'POST',body:new URLSearchParams({client_id:client.client_id,resource:base+'/coach/mcp',...fields})});return {status:response.status,body:await response.json()};};
  let issued=await token({grant_type:'authorization_code',code:state.callback.searchParams.get('code'),code_verifier:verifier,redirect_uri:base+'/fixture-callback'});
  assert.equal(issued.status,200);
  assert.equal(issued.body.scope,'coach');
  assert.equal(typeof issued.body.refresh_token,'string');
  const oldRefresh=issued.body.refresh_token;
  const access=async(path,value)=>fetch(base+path,{headers:{Authorization:'Bearer '+value}});
  assert.equal((await access('/coach/mcp',issued.body.access_token)).status,405);
  assert.equal((await access('/mcp',issued.body.access_token)).status,403);
  await pool.query("UPDATE oidc_models SET expires_at=now()-interval '1 second' WHERE model='AccessToken' AND payload->>'accountId'=$1",[email]);
  assert.equal((await access('/coach/mcp',issued.body.access_token)).status,401);
  await stop();await start();
  issued=await token({grant_type:'refresh_token',refresh_token:oldRefresh});
  assert.equal(issued.status,200);
  assert.equal(issued.body.scope,'coach');
  assert.notEqual(issued.body.refresh_token,oldRefresh);
  assert.equal((await access('/coach/mcp',issued.body.access_token)).status,405);
  assert.equal((await access('/mcp',issued.body.access_token)).status,403);
  const refreshRecord=await pool.query("SELECT grant_id FROM oidc_models WHERE model='RefreshToken' AND payload->>'accountId'=$1 ORDER BY consumed_at NULLS FIRST",[email]);
  assert.ok(refreshRecord.rows[0].grant_id);
  // The same adapter deletion used for admin grant revocation must stop rotation.
  await pool.query('DELETE FROM oidc_models WHERE grant_id=$1 OR (model=\'Grant\' AND id=$1)',[refreshRecord.rows[0].grant_id]);
  assert.equal((await token({grant_type:'refresh_token',refresh_token:issued.body.refresh_token})).status,400);
  assert.equal((await access('/coach/mcp',issued.body.access_token)).status,401);
});
