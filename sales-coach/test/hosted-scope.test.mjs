import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createGateway } from '../hosted.mjs';
import { CoachService } from '../service.mjs';

const unpack = result => {
  assert(!result.isError, result.content?.[0]?.text);
  return JSON.parse(result.content[0].text);
};

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'coach-hosted-scope-'));
  const configs = {
    exec: { contextDir: './exec-store', executiveId: 'exec@example.test', enforceRetainedScope: true },
    other: { contextDir: './other-store', executiveId: 'other@example.test', enforceRetainedScope: true },
    admin: { contextDir: './admin-store', executiveId: 'admin@example.test', leaderContextKeys: ['exec'] },
  };
  for (const [key, config] of Object.entries(configs)) await writeFile(join(root, `${key}.json`), JSON.stringify(config));
  const instructionsPath = join(root, 'instructions.md');
  await writeFile(instructionsPath, 'Retain evidence; obey current account scope.');
  const allowed = new Map([['exec@example.test', new Set(['alpha', 'beta'])], ['other@example.test', new Set(['other-buyer'])]]);
  const unavailable = new Set();
  const principals = {
    exec: { id: 'exec@example.test', role: 'executive', contextKey: 'exec' },
    other: { id: 'other@example.test', role: 'executive', contextKey: 'other' },
    admin: { id: 'admin@example.test', role: 'admin', contextKey: 'admin' },
  };
  const central = new Map(Object.values(principals).map(principal => [principal.id, { ...principal }]));
  const serviceFactory = async (path, actor) => {
    const config = JSON.parse(await readFile(path, 'utf8'));
    return new CoachService({ contextDir: resolve(dirname(path), config.contextDir), actor,
      enforceRetainedScope: config.enforceRetainedScope ?? false,
      authorizeAccount: async accountId => {
        if (unavailable.has(actor.id)) throw new Error('Current scope provider unavailable');
        // An executive config's adapter keeps its executive assignment scope,
        // regardless of the authenticated actor reading that config. The host's
        // explicit leader mapping grants a separate retained-context read view.
        return allowed.get(config.executiveId)?.has(accountId) === true;
      },
    }).init();
  };
  let gateway;
  const http = createServer(async (req, res) => {
    if (req.url.startsWith('/coach/evidence/upload/')) return gateway.handleUpload(req, res);
    if (req.url.startsWith('/coach/evidence/download/')) return gateway.handleDownload(req, res);
    const identity = principals[req.headers.authorization?.replace('Bearer ', '')];
    const principal = identity && central.get(identity.id);
    if (!principal) { res.writeHead(401); res.end(); return; }
    if (req.url.startsWith('/coach/evidence/')) return gateway.handleEvidence(req, res, principal);
    if (req.method === 'POST') {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      req.body = JSON.parse(Buffer.concat(chunks).toString());
    }
    return gateway.handle(req, res, principal);
  });
  await new Promise(done => http.listen(0, '127.0.0.1', done));
  const base = `http://127.0.0.1:${http.address().port}`;
  gateway = createGateway({ configRoot: root, publicUrl: base, instructionsPath, serviceFactory, resolvePrincipal: async id => central.get(id) ?? null });
  const clients = [];
  t.after(async () => {
    await Promise.all(clients.map(client => client.close()));
    http.closeAllConnections();
    await new Promise(done => http.close(done));
    await rm(root, { recursive: true, force: true });
  });
  const client = async token => {
    const client = new Client({ name: 'production-scope-http-proof', version: '1' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/coach/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
    clients.push(client);
    return client;
  };
  const raw = (contextKey, evidenceId, token) => fetch(`${base}/coach/evidence/${contextKey}/${evidenceId}`, { headers: { Authorization: `Bearer ${token}` } });
  return { client, base, raw, allowed, unavailable, central, gateway };
}

async function upload(client, args = {}) {
  const original = Buffer.from('Synthetic original retained-scope verification.');
  const created = unpack(await client.callTool({ name: 'prepare_evidence_upload', arguments: {
    filename: 'synthetic.txt', mimeType: 'text/plain', expectedSize: original.length,
    expectedSha256: createHash('sha256').update(original).digest('hex'), ...args,
  } }));
  const response = await fetch(created.uploadUrl, { method: 'PUT', headers: { 'Content-Type': created.contentType }, body: original });
  assert.equal(response.status, 201);
  assert.equal((await response.json()).evidence.sha256, createHash('sha256').update(original).digest('hex'));
  return { evidenceId: created.evidenceId, original };
}

test('current account revocation blocks hosted evidence metadata, renewal, downloads and authenticated original bytes', async t => {
  const { client, raw, allowed, unavailable } = await fixture(t);
  const exec = await client('exec');
  const evidence = await upload(exec, { accountId: 'alpha' });
  const before = await raw('exec', evidence.evidenceId, 'exec');
  assert.equal(before.status, 200); assert.deepEqual(Buffer.from(await before.arrayBuffer()), evidence.original);
  assert.equal(unpack(await exec.callTool({ name: 'get_evidence', arguments: { evidenceId: evidence.evidenceId } })).status, 'original-preserved');
  const existingDownload = unpack(await exec.callTool({ name: 'request_original_download', arguments: { evidenceId: evidence.evidenceId } }));
  const pending = unpack(await exec.callTool({ name: 'prepare_evidence_upload', arguments: {
    accountId: 'alpha', filename: 'pending.txt', mimeType: 'text/plain', expectedSize: evidence.original.length,
    expectedSha256: createHash('sha256').update(evidence.original).digest('hex'),
  } }));
  allowed.get('exec@example.test').delete('alpha');
  for (const name of ['get_evidence', 'renew_evidence_upload', 'request_original_download']) {
    const denied = await exec.callTool({ name, arguments: { evidenceId: evidence.evidenceId } });
    assert.equal(denied.isError, true, name);
    assert(!denied.content[0].text.includes('downloadUrl'), name);
    assert(!denied.content[0].text.includes('sha256'), name);
  }
  assert.notEqual((await raw('exec', evidence.evidenceId, 'exec')).status, 200);
  assert.notEqual((await fetch(existingDownload.downloadUrl)).status, 200, 'Issued download capability sees immediate revocation');
  const pendingUpload = await fetch(pending.uploadUrl, { method: 'PUT', headers: { 'Content-Type': pending.contentType }, body: evidence.original });
  assert.notEqual(pendingUpload.status, 201, 'Issued upload capability cannot retain newly revoked evidence');
  const rejected = await exec.callTool({ name: 'prepare_evidence_upload', arguments: {
    accountId: 'alpha', filename: 'denied.txt', mimeType: 'text/plain', expectedSize: 1, expectedSha256: 'a'.repeat(64),
  } });
  assert.equal(rejected.isError, true);
  allowed.get('exec@example.test').add('alpha');
  unavailable.add('exec@example.test');
  assert.equal((await exec.callTool({ name: 'get_evidence', arguments: { evidenceId: evidence.evidenceId } })).isError, true);
  assert.notEqual((await raw('exec', evidence.evidenceId, 'exec')).status, 200);
});

test('source-only evidence obeys source revocation even without an evidence accountId', async t => {
  const { client, raw, allowed } = await fixture(t);
  const exec = await client('exec');
  const source = unpack(await exec.callTool({ name: 'update_account_context', arguments: {
    accountId: 'beta', submittedSource: { text: 'Beta private information.' }, entries: [{ kind: 'note', text: 'Beta private information.', status: 'human-account' }],
  } }));
  const evidence = await upload(exec, { sourceIds: [source.sourceId] });
  const receipt = unpack(await exec.callTool({ name: 'get_evidence', arguments: { evidenceId: evidence.evidenceId } }));
  assert.equal(receipt.accountId, null); assert.deepEqual(receipt.sourceIds, [source.sourceId]);
  const original = await raw('exec', evidence.evidenceId, 'exec');
  assert.equal(original.status, 200); assert.deepEqual(Buffer.from(await original.arrayBuffer()), evidence.original);
  const existingDownload = unpack(await exec.callTool({ name: 'request_original_download', arguments: { evidenceId: evidence.evidenceId } }));
  const pending = unpack(await exec.callTool({ name: 'prepare_evidence_upload', arguments: {
    sourceIds: [source.sourceId], filename: 'pending-source.txt', mimeType: 'text/plain', expectedSize: evidence.original.length,
    expectedSha256: createHash('sha256').update(evidence.original).digest('hex'),
  } }));
  allowed.get('exec@example.test').delete('beta');
  for (const name of ['get_evidence', 'renew_evidence_upload', 'request_original_download', 'retain_evidence_transcription']) {
    const denied = await exec.callTool({ name, arguments: { evidenceId: evidence.evidenceId, ...(name === 'retain_evidence_transcription' ? { text: 'Must not retain revoked information.' } : {}) } });
    assert.equal(denied.isError, true, name);
  }
  assert.notEqual((await raw('exec', evidence.evidenceId, 'exec')).status, 200);
  assert.notEqual((await fetch(existingDownload.downloadUrl)).status, 200);
  assert.notEqual((await fetch(pending.uploadUrl, { method: 'PUT', headers: { 'Content-Type': pending.contentType }, body: evidence.original })).status, 201);
});

test('separate stores expose configured executive report and originals to the leader without executive cross-context routing', async t => {
  const { client, raw, allowed } = await fixture(t);
  const exec = await client('exec'), other = await client('other'), admin = await client('admin');
  const source = unpack(await exec.callTool({ name: 'update_account_context', arguments: {
    accountId: 'alpha', title: 'Alpha', submittedSource: { text: 'Alpha delivery questions go to Anna.' }, entries: [{ kind: 'social', text: 'Delivery questions: Anna.', status: 'human-account' }],
  } }));
  unpack(await exec.callTool({ name: 'record_observation', arguments: { accountId: 'alpha', observation: 'Delivery contact retained.', sourceIds: [source.sourceId] } }));
  const evidence = await upload(exec, { accountId: 'alpha', sourceIds: [source.sourceId] });
  const report = unpack(await admin.callTool({ name: 'leader_report', arguments: {} }));
  assert.equal(report.accounts.length, 0, 'Admin store remains separate');
  assert.equal(report.executives.length, 1); assert.equal(report.executives[0].executiveId, 'exec@example.test');
  assert.equal(report.executives[0].contextKey, 'exec');
  assert.equal(report.executives[0].accounts[0].id, 'alpha');
  assert.equal(report.executives[0].observations[0].observation, 'Delivery contact retained.');
  assert(report.executives[0].sources.some(item => item.id === source.sourceId));
  assert.deepEqual(unpack(await other.callTool({ name: 'search_accounts', arguments: {} })), []);
  const leaderSource = unpack(await admin.callTool({ name: 'get_source', arguments: { contextKey: 'exec', sourceId: source.sourceId } }));
  assert.equal(leaderSource.text, 'Alpha delivery questions go to Anna.');
  const leaderEvidence = unpack(await admin.callTool({ name: 'get_evidence', arguments: { contextKey: 'exec', evidenceId: evidence.evidenceId } }));
  assert.equal(leaderEvidence.status, 'original-preserved');
  const leaderDownload = unpack(await admin.callTool({ name: 'request_original_download', arguments: { contextKey: 'exec', evidenceId: evidence.evidenceId } }));
  assert.deepEqual(Buffer.from(await (await fetch(leaderDownload.downloadUrl)).arrayBuffer()), evidence.original);
  const leaderRaw = await raw('exec', evidence.evidenceId, 'admin');
  assert.equal(leaderRaw.status, 200); assert.deepEqual(Buffer.from(await leaderRaw.arrayBuffer()), evidence.original);
  const leaderAccounts = unpack(await admin.callTool({ name: 'search_accounts', arguments: { contextKey: 'exec', query: 'Alpha' } }));
  assert.equal(leaderAccounts[0].id, 'alpha');
  const leaderContext = unpack(await admin.callTool({ name: 'get_account_context', arguments: { contextKey: 'exec', accountId: 'alpha', refresh: false } }));
  assert.equal(leaderContext.account.entries[0].text, 'Delivery questions: Anna.');
  allowed.get('exec@example.test').delete('alpha');
  assert.equal((await exec.callTool({ name: 'get_evidence', arguments: { evidenceId: evidence.evidenceId } })).isError, true);
  assert.equal(unpack(await admin.callTool({ name: 'get_evidence', arguments: { contextKey: 'exec', evidenceId: evidence.evidenceId } })).status, 'original-preserved');
  const leaderAfterRevocation = unpack(await admin.callTool({ name: 'request_original_download', arguments: { contextKey: 'exec', evidenceId: evidence.evidenceId } }));
  assert.equal((await fetch(leaderAfterRevocation.downloadUrl)).status, 200, 'Explicit mapped leader reads retain their own authority');
  assert.equal((await raw('exec', evidence.evidenceId, 'admin')).status, 200);
  for (const person of [exec, other]) {
    const contextKey = person === exec ? 'other' : 'exec';
    assert.equal((await person.callTool({ name: 'get_source', arguments: { contextKey, sourceId: source.sourceId } })).isError, true);
    assert.equal((await person.callTool({ name: 'get_evidence', arguments: { contextKey, evidenceId: evidence.evidenceId } })).isError, true);
  }
  assert.notEqual((await raw('exec', evidence.evidenceId, 'other')).status, 200);
  assert.equal((await admin.callTool({ name: 'get_evidence', arguments: { contextKey: 'other', evidenceId: evidence.evidenceId } })).isError, true, 'Admin cannot add an unconfigured target context');
});

test('issued evidence capabilities recheck central account enablement, role and context grants', async t => {
  const { client, central } = await fixture(t);
  const exec = await client('exec'), admin = await client('admin');
  const evidence = await upload(exec, { accountId: 'alpha' });
  const execDownload = unpack(await exec.callTool({ name: 'request_original_download', arguments: { evidenceId: evidence.evidenceId } }));
  const pending = unpack(await exec.callTool({ name: 'prepare_evidence_upload', arguments: {
    accountId: 'alpha', filename: 'central-gate.txt', mimeType: 'text/plain', expectedSize: evidence.original.length,
    expectedSha256: createHash('sha256').update(evidence.original).digest('hex'),
  } }));
  central.delete('exec@example.test');
  assert.equal((await fetch(execDownload.downloadUrl)).status, 403, 'Disabled executive cannot use an already-issued download');
  assert.equal((await fetch(pending.uploadUrl, { method: 'PUT', headers: { 'Content-Type': pending.contentType }, body: evidence.original })).status, 403);
  central.set('exec@example.test', { id: 'exec@example.test', role: 'executive', contextKey: 'exec' });
  assert.equal((await fetch(execDownload.downloadUrl)).status, 200, 'Original remains preserved after a denied request');
  const leaderDownload = unpack(await admin.callTool({ name: 'request_original_download', arguments: { contextKey: 'exec', evidenceId: evidence.evidenceId } }));
  assert.equal((await fetch(leaderDownload.downloadUrl)).status, 200);
  central.set('admin@example.test', { id: 'admin@example.test', role: 'executive', contextKey: 'admin' });
  assert.equal((await fetch(leaderDownload.downloadUrl)).status, 403, 'Revoked leader role cannot use the old grant');
  central.set('admin@example.test', { id: 'admin@example.test', role: 'admin', contextKey: 'other' });
  assert.equal((await fetch(leaderDownload.downloadUrl)).status, 403, 'New principal context cannot inherit old leader mappings');
});

test('queued HTTP tools recheck central disablement, role and context changes before retaining anything', async t => {
  const { client, central, gateway } = await fixture(t);
  const exec = await client('exec');
  const principal = { id: 'exec@example.test', role: 'executive', contextKey: 'exec' };
  const { ctx, service } = await gateway.getActor(principal);
  const changedAuthorities = [
    null,
    { ...principal, role: 'leader' },
    { ...principal, contextKey: 'other' },
  ];
  for (let index = 0; index < changedAuthorities.length; index++) {
    central.set(principal.id, principal);
    let release, began;
    const gate = new Promise(done => { release = done; });
    const ready = new Promise(done => { began = done; });
    t.after(() => release());
    const blocker = service.serial(async () => { began(); await gate; });
    await ready;
    const before = ctx.queue.pending;
    const queued = exec.callTool({ name: 'retain_source', arguments: { sourceKey: `queued:${index}`, text: 'Must not be saved after access changes.' } });
    const deadline = Date.now() + 1000;
    while (ctx.queue.pending === before && Date.now() < deadline) await new Promise(done => setTimeout(done, 2));
    assert.notEqual(ctx.queue.pending, before, 'The HTTP tool was authorized and queued before the central change');
    if (changedAuthorities[index]) central.set(principal.id, changedAuthorities[index]);
    else central.delete(principal.id);
    release();
    const result = await queued;
    await blocker;
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /Coach access changed/);
    assert.equal((await service.store.listSources()).length, 0, 'A waiting request cannot retain data under stale central authority');
  }
  central.set(principal.id, principal);
  const current = unpack(await exec.callTool({ name: 'retain_source', arguments: { sourceKey: 'current', text: 'Freshly authorized request.' } }));
  assert.equal(current.text, 'Freshly authorized request.');
});
