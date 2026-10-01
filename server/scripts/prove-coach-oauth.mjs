import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import pg from 'pg';
import bcrypt from 'bcryptjs';

// Explicit opt-in proof; no production URL, credentials or database is used.
const directory = await mkdtemp(join(tmpdir(), 'coach-oauth-proof-'));
const container = `coach-oauth-proof-${randomUUID().slice(0, 8)}`;
const remote = process.env.COACH_QA_REMOTE_PROOF ? JSON.parse(await readFile(process.env.COACH_QA_REMOTE_PROOF, 'utf8')) : null;
if (remote) {
  assert.equal(remote.base, 'https://coach-api-qa.up.railway.app');
  assert.equal(remote.project, 'f3f4649b-fa76-4293-a6d3-e4fa3fe27c70');
  assert.equal(remote.environment, '6846e7c4-54ca-445d-a07e-6432366a0ce5');
  assert.equal(remote.service, 'da71343e-b263-4715-948f-20b03e755c5b');
  assert(['localhost', '127.0.0.1'].includes(new URL(remote.databaseUrl).hostname));
}
const password = remote?.password ?? randomBytes(20).toString('hex');
const checks = [];
const browserSessions = new Map();
let processHandle, pool, logs = '';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const socket = createServer();
await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
const port = socket.address().port;
await new Promise(resolve => socket.close(resolve));
const base = remote?.base ?? `http://127.0.0.1:${port}`;
const coach = `${base}/coach/mcp`;
const crm = `${base}/mcp`;
const user = 'executive@example.test';

async function waitReady() {
  for (let i = 0; i < 100; i++) {
    if (processHandle?.exitCode != null) throw new Error('Isolated server exited before readiness');
    try { if ((await fetch(`${base}/readyz`)).ok) return; } catch {}
    await delay(100);
  }
  throw new Error('Isolated server readiness timed out');
}
function startServer(databaseUrl) {
  if (remote) return;
  processHandle = spawn(process.execPath, ['dist/index.js'], { cwd: new URL('../', import.meta.url), env: {
    PATH: process.env.PATH, DATABASE_URL: databaseUrl, LOCAL_INSECURE_DB: '1', PUBLIC_URL: base,
    PORT: String(port), COACH_ENABLED: '1', COACH_CONFIG_ROOT: directory,
    COOKIE_SECRET: randomBytes(32).toString('hex'),
  }, stdio: ['ignore', 'pipe', 'pipe'] });
  processHandle.stdout.on('data', chunk => { logs += chunk; });
  processHandle.stderr.on('data', chunk => { logs += chunk; });
}
async function stopServer() {
  if (!processHandle || processHandle.exitCode != null) return;
  const exited = new Promise(resolve => processHandle.once('exit', resolve));
  processHandle.kill('SIGTERM'); await exited;
}
async function restartServer(databaseUrl) {
  if (remote) {
    const target = ['--project', remote.project, '--environment', remote.environment, '--service', remote.service];
    const marker = () => {
      const result = execFileSync('railway', ['ssh', ...target, 'node -e "console.log(require(\'fs\').readFileSync(\'/proc/1/stat\',\'utf8\').split(\' \')[21])"'], { encoding: 'utf8', timeout: 20000 });
      const value = result.split('\n').find(line => /^\d+$/.test(line.trim()));
      assert(value, 'QA container process marker required'); return value.trim();
    };
    const before = marker();
    const deployments = JSON.parse(execFileSync('railway', ['deployment', 'list', ...target, '--json'], { encoding: 'utf8', timeout: 20000 }));
    const deployed = deployments.find(item => item.status === 'SUCCESS'); assert(deployed);
    const restarted = JSON.parse(execFileSync('railway', ['api', 'mutation($id: String!){deploymentRestart(id:$id)}', '--variables', JSON.stringify({ id: deployed.id })], { encoding: 'utf8', timeout: 20000 }));
    assert.equal(restarted.data?.deploymentRestart ?? restarted.deploymentRestart, true);
    let changed = false;
    for (let attempt = 0; attempt < 8; attempt++) {
      await delay(2000);
      try { if (marker() !== before) { changed = true; break; } } catch {}
    }
    assert(changed, 'QA container must actually restart, not merely accept a restart request');
    await waitReady();
  } else { await stopServer(); startServer(databaseUrl); await waitReady(); }
}
async function token(resource, email = user) {
  const registration = await fetch(`${base}/reg`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
    client_name: 'Isolated coach proof', redirect_uris: [`${base}/callback`], token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'],
  }) });
  assert.equal(registration.status, 201);
  const { client_id } = await registration.json();
  const verifier = randomBytes(32).toString('base64url');
  const state = randomUUID();
  const authorize = new URL(`${base}/auth`);
  authorize.search = new URLSearchParams({ client_id, redirect_uri: `${base}/callback`, response_type: 'code',
    scope: `openid ${resource === coach ? 'coach' : 'mcp'}`, resource, state,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' }).toString();
  const cookies = new Map();
  async function request(url, options = {}) {
    const parsed = new URL(url);
    const header = [...cookies.values()].filter(c => parsed.pathname.startsWith(c.path)).sort((a, b) => b.path.length - a.path.length).map(c => `${c.name}=${c.value}`).join('; ');
    const res = await fetch(url, { ...options, redirect: 'manual', headers: { ...options.headers, ...(header ? { Cookie: header } : {}) } });
    for (const line of res.headers.getSetCookie()) {
      const [pair, ...attributes] = line.split(';'); const index = pair.indexOf('=');
      const name = pair.slice(0, index), value = pair.slice(index + 1);
      const path = attributes.find(a => /^\s*path=/i.test(a))?.trim().slice(5) ?? '/';
      cookies.set(`${name}:${path}`, { name, value, path });
    }
    return res;
  }
  let current = authorize.href, options = {}, code;
  for (let i = 0; i < 25; i++) {
    const res = await request(current, options);
    if ([302, 303].includes(res.status)) {
      current = new URL(res.headers.get('location'), current).href; options = {};
      const next = new URL(current);
      if (next.pathname === '/callback') {
        assert.equal(next.searchParams.get('state'), state);
        assert(!next.searchParams.has('error'), next.searchParams.get('error'));
        code = next.searchParams.get('code'); break;
      }
      continue;
    }
    const body = await res.text();
    assert.equal(res.status, 200, 'OAuth interaction must return a rendered form');
    const action = /action="([^"]+\/(?:login|consent))"/.exec(body)?.[1];
    assert(action, 'OAuth flow must offer login or consent');
    current = new URL(action, base).href;
    options = { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body:
      new URLSearchParams(action.endsWith('/login') ? { email, password } : {}).toString() };
  }
  assert(code, 'OAuth flow must return an authorization code');
  const response = await fetch(`${base}/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({
    grant_type: 'authorization_code', client_id, code, redirect_uri: `${base}/callback`, code_verifier: verifier, resource,
  }).toString() });
  assert.equal(response.status, 200, 'PKCE token exchange must succeed');
  const value = await response.json(); assert(value.access_token);
  browserSessions.set(value.access_token, request);
  return value.access_token;
}
async function rpc(accessToken, endpoint = coach, method = 'tools/call', params = { name: 'coach_status', arguments: {} }) {
  return fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
}
async function status(accessToken) {
  return call(accessToken, 'coach_status', {});
}
async function call(accessToken, name, args) {
  const response = await rpc(accessToken, coach, 'tools/call', { name, arguments: args });
  if (response.status !== 200) throw new Error(`Coach status HTTP ${response.status}: ${await response.text()}`);
  const raw = await response.text();
  const message = raw.startsWith('event:') || raw.startsWith('data:') ? JSON.parse(raw.split('\n').find(line => line.startsWith('data:')).slice(5)) : JSON.parse(raw);
  assert(!message.result?.isError, 'Coach status call must succeed');
  return JSON.parse(message.result.content[0].text);
}
try {
  let databaseUrl = remote?.databaseUrl;
  if (!remote) {
    execFileSync('docker', ['run', '-d', '--rm', '--name', container, '-e', `POSTGRES_PASSWORD=${password}`, '-e', 'POSTGRES_DB=coach_test', '-p', '127.0.0.1::5432', 'postgres:17-alpine'], { stdio: 'pipe' });
    const mapping = execFileSync('docker', ['port', container, '5432/tcp'], { encoding: 'utf8' }).trim();
    const dbPort = mapping.split(':').at(-1);
    databaseUrl = `postgresql://postgres:${password}@127.0.0.1:${dbPort}/coach_test`;
  }
  pool = new pg.Pool({ connectionString: databaseUrl, ...(remote ? { ssl: { rejectUnauthorized: false } } : {}) });
  let databaseReady = false;
  for (let i = 0; i < 100; i++) { try { await pool.query('SELECT 1'); databaseReady = true; break; } catch { await delay(100); } }
  assert(databaseReady, 'Disposable Postgres must become ready');
  await writeFile(join(directory, 'pilot.json'), JSON.stringify({ contextDir: './context', executiveId: user }));
  startServer(databaseUrl); await waitReady();
  const hash = await bcrypt.hash(password, 4);
  await pool.query("INSERT INTO users(email,password_hash,status) VALUES ($1,$3,'active'),($2,$3,'active') ON CONFLICT(email) DO UPDATE SET password_hash=EXCLUDED.password_hash,status='active'", [user, 'unmapped@example.test', hash]);
  await pool.query("INSERT INTO coach_access(email,role,context_key,enabled) VALUES ($1,'executive','pilot',TRUE) ON CONFLICT(email) DO UPDATE SET role='executive',context_key='pilot',enabled=TRUE", [user]);
  const discovery = await (await fetch(`${base}/.well-known/oauth-protected-resource/coach/mcp`)).json();
  assert.equal(discovery.resource, coach); checks.push('coach resource discovery');
  const coachToken = await token(coach);
  const observed = await status(coachToken);
  assert.equal(observed.actor.id, user); assert.equal(observed.actor.role, 'executive'); checks.push('actual registration + PKCE + login + consent + coach token + DB principal');
  const largeSource = await call(coachToken, 'retain_source', { sourceKey: `synthetic-large:${randomUUID()}`, text: 'x'.repeat(160000), representation: 'transcription' });
  assert.equal(largeSource.text.length, 160000); checks.push('160000-character transcription accepted through authenticated coach JSON route');
  const original = Buffer.alloc(440487, 37);
  const sha256 = createHash('sha256').update(original).digest('hex');
  const upload = await call(coachToken, 'prepare_evidence_upload', { filename: 'synthetic-original.bin', mimeType: 'application/octet-stream', expectedSize: original.length, expectedSha256: sha256 });
  const saved = await fetch(upload.uploadUrl, { method: 'PUT', body: original, headers: { 'Content-Type': upload.contentType } });
  assert.equal(saved.status, 201);
  assert.equal((await saved.json()).evidence.sha256, sha256);
  const transcription = await call(coachToken, 'retain_evidence_transcription', { evidenceId: upload.evidenceId, text: 'Synthetic transcription only.' });
  assert.equal(transcription.evidenceId, upload.evidenceId);
  const download = await call(coachToken, 'request_original_download', { evidenceId: upload.evidenceId });
  const recovered = await fetch(download.downloadUrl);
  assert.equal(recovered.status, 200);
  assert.deepEqual(Buffer.from(await recovered.arrayBuffer()), original);
  checks.push('actual OAuth tool → raw upload → linked transcription → scoped original download with byte equality');
  const proposal = await call(coachToken, 'crm_propose_change', {
    accountId: 'northstar', object: 'task', values: { title: `Verify trial delivery commitment ${randomUUID().slice(0, 8)}` },
    sourceIds: [transcription.id], estimatedErrorCost: 'high', highlyConsequential: true,
    reason: 'Synthetic commitment verification requires executive confirmation.',
  });
  assert.equal(proposal.state, 'awaiting-confirmation');
  const browser = browserSessions.get(coachToken);
  const review = await browser(proposal.reviewUrl);
  assert.equal(review.status, 200);
  const page = await review.text();
  assert(page.includes('Apply change'), 'OIDC browser session should access review without bearer or repeat login');
  const fields = {};
  for (const [, name, value] of page.matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)">/g)) fields[name] = value;
  assert(fields.csrf && fields.digest && fields.expires);
  const applied = await browser(proposal.reviewUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: base }, body: new URLSearchParams({ ...fields, decision: 'approve' }).toString() });
  assert.equal(applied.status, 303);
  const decided = (await status(coachToken)).changes.find(change => change.id === proposal.id);
  assert.equal(decided.confirmedBy.id, user);
  assert.equal(decided.state, 'blocked');
  assert.equal(decided.errorCode, 'NOT_CONFIGURED');
  assert.equal(decided.reviewedSnapshot.reviewedBy.id, user);
  checks.push('actual OIDC browser session reviews and confirms exact proposal without CLI; absent CRM remains blocked');
  const fallbackCookies = new Map();
  async function freshBrowser(url, options = {}) {
    const response = await fetch(url, { ...options, redirect: 'manual', headers: { ...options.headers, Cookie: [...fallbackCookies.values()].join('; ') } });
    for (const line of response.headers.getSetCookie()) { const pair = line.split(';')[0]; fallbackCookies.set(pair.split('=')[0], pair); }
    return response;
  }
  const signedOutPage = await (await freshBrowser(proposal.reviewUrl)).text();
  assert(signedOutPage.includes('Sign in to review'));
  const nonce = /name="csrf" value="([^"]+)"/.exec(signedOutPage)?.[1]; assert(nonce);
  const loginResponse = await freshBrowser(`${proposal.reviewUrl}/login`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: base }, body: new URLSearchParams({ csrf: nonce, email: user, password }).toString() });
  assert.equal(loginResponse.status, 303);
  const signedInReview = await (await freshBrowser(proposal.reviewUrl)).text();
  assert(signedInReview.includes(user)); assert(signedInReview.includes('Change could not be applied'));
  checks.push('fresh mobile-browser fallback login opens persisted review using real synthetic credentials');
  const crmToken = await token(crm);
  assert.equal((await rpc(crmToken)).status, 403); checks.push('real CRM audience token denied coach');
  assert.equal((await rpc(coachToken, crm, 'tools/list', {})).status, 403); checks.push('real coach audience token denied CRM');
  const unmapped = await token(coach, 'unmapped@example.test');
  assert.equal((await rpc(unmapped)).status, 403); checks.push('authenticated but unmapped user denied');
  await pool.query('UPDATE coach_access SET enabled=FALSE WHERE email=$1', [user]);
  assert.equal((await rpc(coachToken)).status, 403); checks.push('grant disablement takes effect for existing token');
  await pool.query('UPDATE coach_access SET enabled=TRUE WHERE email=$1', [user]);
  await pool.query("UPDATE users SET status='invited' WHERE email=$1", [user]);
  assert.equal((await rpc(coachToken)).status, 403); checks.push('inactive user denied despite valid token and enabled mapping');
  await pool.query("UPDATE users SET status='active' WHERE email=$1", [user]);
  await restartServer(databaseUrl);
  assert.equal((await status(coachToken)).actor.id, user); checks.push('token and mapping survive process restart');
  const afterRestart = await call(coachToken, 'request_original_download', { evidenceId: upload.evidenceId });
  assert.deepEqual(Buffer.from(await (await fetch(afterRestart.downloadUrl)).arrayBuffer()), original);
  checks.push('preserved original retrievable after process restart');
  console.log(JSON.stringify({ status: 'passed', isolated: true, ...(remote ? { url: base, project: remote.project, environment: remote.environment } : {}), checks, checkCount: checks.length }, null, 2));
} catch (error) {
  // Never dump OAuth responses, tokens, cookie jars or environment variables.
  console.error(JSON.stringify({ status: 'failed', checks, error: error.message }));
  process.exitCode = 1;
} finally {
  await stopServer(); if (pool) await pool.end();
  if (!remote) { try { execFileSync('docker', ['rm', '-f', container], { stdio: 'pipe' }); } catch {} }
  await rm(directory, { recursive: true, force: true });
}
