import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createGateway } from '../hosted.mjs';
import { CoachService } from '../service.mjs';

const unpack = result => {
  assert(!result.isError, result.content?.[0]?.text);
  return JSON.parse(result.content[0].text);
};

async function fixture(t, { configs, serviceFactory, principalOverrides } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'coach-hosted-'));
  configs ??= { pilot: { contextDir: './context', executiveId: 'exec@example.test', actor: { id: 'config-admin', role: 'admin' } } };
  for (const [key, config] of Object.entries(configs)) await writeFile(join(root, `${key}.json`), JSON.stringify(config));
  const instructionsPath = join(root, 'instructions.md');
  await writeFile(instructionsPath, 'Help the executive. Preserve originals.');
  let gateway;
  const principals = {
    exec: { id: 'exec@example.test', role: 'executive', contextKey: 'pilot' },
    other: { id: 'other@example.test', role: 'executive', contextKey: 'pilot' },
    leader: { id: 'leader@example.test', role: 'leader', contextKey: 'pilot' },
    ...principalOverrides,
  };
  const http = createServer(async (req, res) => {
    if (req.url.startsWith('/coach/evidence/upload/')) return gateway.handleUpload(req, res);
    if (req.url.startsWith('/coach/evidence/download/')) return gateway.handleDownload(req, res);
    const principal = principals[req.headers.authorization?.replace('Bearer ', '')];
    if (!principal) { res.writeHead(401); res.end(); return; }
    if (req.url.startsWith('/coach/evidence/')) return gateway.handleEvidence(req, res, principal);
    if (req.method === 'POST') {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      req.body = JSON.parse(Buffer.concat(chunks).toString());
    }
    return gateway.handle(req, res, principal);
  });
  await new Promise(resolve => http.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${http.address().port}`;
  gateway = createGateway({ configRoot: root, publicUrl: base, instructionsPath, serviceFactory });
  t.after(async () => { http.closeAllConnections(); await new Promise(resolve => http.close(resolve)); await rm(root, { recursive: true, force: true }); });
  async function client(token) {
    const client = new Client({ name: 'synthetic-android-workflow', version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/coach/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
    }));
    t.after(() => client.close());
    return client;
  }
  return { root, gateway, base, client, instructionsPath };
}

test('hosted HTTP workflow preserves one file, links transcription and overlapping pursuits, reloads context and enforces retrieval identity', async t => {
  const { client, base } = await fixture(t);
  const exec = await client('exec');
  const status = unpack(await exec.callTool({ name: 'coach_status', arguments: {} }));
  assert.equal(status.actor.id, 'exec@example.test');
  assert.equal(status.actor.role, 'executive'); // Config-admin cannot override authenticated access.
  assert.equal(status.actorAuthority, 'authenticated-business-os-access');
  assert(!(await exec.listTools()).tools.some(tool => tool.name === 'leader_report'));
  const original = Buffer.alloc(440487); for (let i = 0; i < original.length; i++) original[i] = i % 251;
  const expectedSha256 = createHash('sha256').update(original).digest('hex');
  const upload = unpack(await exec.callTool({ name: 'prepare_evidence_upload', arguments: {
    accountId: 'northstar', filename: 'mobile-screenshot.png', mimeType: 'image/png', expectedSize: original.length, expectedSha256,
  } }));
  const response = await fetch(upload.uploadUrl, { method: 'PUT', headers: { 'Content-Type': upload.contentType }, body: original });
  assert.equal(response.status, 201);
  const receipt = await response.json();
  assert.equal(receipt.evidence.sha256, expectedSha256);
  const transcription = unpack(await exec.callTool({ name: 'retain_evidence_transcription', arguments: {
    evidenceId: upload.evidenceId, text: 'Repeat order delivery Monday. Separate trial quantities still unclear.',
  } }));
  assert.equal(transcription.representation, 'transcription');
  assert.equal(transcription.metadata.status, 'original-preserved');
  await exec.callTool({ name: 'update_account_context', arguments: {
    accountId: 'northstar', title: 'Northstar', entries: [{ kind: 'commitment', text: 'Delivery date asserted by counterpart; trial still provisional.',
      status: 'human-account', sourceIds: [transcription.id],
      association: { scope: 'opportunities', opportunityIds: ['repeat-order', 'trial'] },
      sourceRefs: [{ sourceId: transcription.id, messageId: 'message-1', passage: { start: 0, end: 34 } }],
    }],
  } }).then(unpack);
  const fresh = await client('exec');
  const context = unpack(await fresh.callTool({ name: 'get_account_context', arguments: { accountId: 'northstar', refresh: false } }));
  assert.equal(context.sources[0].evidenceId, upload.evidenceId);
  assert.deepEqual(context.account.entries[0].association.opportunityIds, ['repeat-order', 'trial']);
  const path = `${base}/coach/evidence/pilot/${upload.evidenceId}`;
  assert.equal((await fetch(path)).status, 401);
  assert.equal((await fetch(path, { headers: { Authorization: 'Bearer other' } })).status, 403);
  const downloaded = Buffer.from(await (await fetch(path, { headers: { Authorization: 'Bearer exec' } })).arrayBuffer());
  assert.deepEqual(downloaded, original);
  const download = unpack(await fresh.callTool({ name: 'request_original_download', arguments: { evidenceId: upload.evidenceId } }));
  const sandboxDownloaded = Buffer.from(await (await fetch(download.downloadUrl)).arrayBuffer());
  assert.deepEqual(sandboxDownloaded, original);
  await assert.rejects(client('other')); // Derived context is protected consistently with original evidence.
  const leader = await client('leader');
  const report = unpack(await leader.callTool({ name: 'leader_report', arguments: {} }));
  assert.equal(report.accounts[0].entries[0].sourceIds[0], transcription.id);
  assert.equal((await fetch(path, { headers: { Authorization: 'Bearer leader' } })).status, 200);
});

test('existing conversation retrieves changed central instructions with a new version', async t => {
  const { client, instructionsPath } = await fixture(t);
  const exec = await client('exec');
  const first = unpack(await exec.callTool({ name: 'get_coach_instructions', arguments: {} }));
  await writeFile(instructionsPath, 'Updated instruction: name the proposed CRM operation.');
  const next = unpack(await exec.callTool({ name: 'get_coach_instructions', arguments: {} }));
  assert.notEqual(first.version, next.version);
  assert.match(next.instructions, /proposed CRM operation/);
});

test('consequential change exposes a human review link and no agent approval tool', async t => {
  const { client, base } = await fixture(t);
  const exec = await client('exec');
  const source = unpack(await exec.callTool({ name: 'retain_source', arguments: {
    sourceKey: 'synthetic:trial', text: 'Executive reports a trial request requiring review.',
  } }));
  const change = unpack(await exec.callTool({ name: 'crm_propose_change', arguments: {
    accountId: 'd7bc31cb-7e3b-4e86-97dd-f99716e241e3', object: 'task', values: { title: 'Review trial terms' },
    sourceIds: [source.id], estimatedErrorCost: 'high', highlyConsequential: false,
    reason: 'Incorrect terms could misdirect the executive.',
  } }));
  assert.equal(change.state, 'awaiting-confirmation');
  assert.equal(change.reviewUrl, `${base}/coach/review/pilot/${change.id}`);
  const status = unpack(await exec.callTool({ name: 'coach_status', arguments: {} }));
  assert.equal(status.changes[0].reviewUrl, change.reviewUrl);
  assert(!(await exec.listTools()).tools.some(tool => /confirm|approve/.test(tool.name)));
});

test('gateway refuses path traversal and unrecognized role instead of granting config actor', async t => {
  const { gateway } = await fixture(t);
  await assert.rejects(gateway.buildServer({ id: 'exec@example.test', role: 'executive', contextKey: '../pilot' }), /Authorized/);
  await assert.rejects(gateway.buildServer({ id: 'exec@example.test', role: 'owner', contextKey: 'pilot' }), /Authorized/);
});

test('one typed context call binds exact executive words to interpretations without granting file or CRM write authority', async t => {
  const { client } = await fixture(t);
  const exec = await client('exec');
  const instructions = unpack(await exec.callTool({ name: 'get_coach_instructions', arguments: {} }));
  assert.equal(instructions.identity.id, 'exec@example.test');
  assert.equal(instructions.crmConfigured, false);
  const receipt = unpack(await exec.callTool({ name: 'update_account_context', arguments: {
    accountId: 'buyer', title: 'Buyer', submittedSource: { text: 'Anna asked for a trial; quantities are still unclear.' },
    entries: [{ id: 'trial', kind: 'gap', text: 'Trial quantity unknown.', status: 'unknown', association: { scope: 'provisional' } }],
  } }));
  assert.equal(receipt.entries[0].revision, 1);
  assert.equal(receipt.originalFilePreserved, false);
  const source = unpack(await exec.callTool({ name: 'get_source', arguments: { sourceId: receipt.sourceId } }));
  assert.equal(source.text, 'Anna asked for a trial; quantities are still unclear.');
  assert.equal(source.actor.id, 'exec@example.test');
  const context = unpack(await exec.callTool({ name: 'get_account_context', arguments: { accountId: 'buyer', brief: true } }));
  assert.equal(context.account.entries[0].sourceIds[0], receipt.sourceId);
  assert.equal(Object.keys(context.account.crm).length, 0);
  assert.equal(context.sources[0].text, undefined);
  const invalid = await exec.callTool({ name: 'update_account_context', arguments: {
    accountId: 'buyer', submittedSource: { sourceKey: 'forged-file', text: 'File', representation: 'transcription', evidenceId: 'fake' },
    entries: [{ kind: 'note', text: 'File', status: 'fact' }],
  } });
  assert.equal(invalid.isError, true);
  const denied = await exec.callTool({ name: 'update_account_context', arguments: { accountId: 'buyer', entries: [{ kind: 'note', text: 'No source', status: 'fact' }] } });
  assert.equal(denied.isError, true);
});

test('configuration reload keeps queued old and fresh actor writes on the same context queue', async t => {
  const { gateway } = await fixture(t);
  const principal = { id: 'exec@example.test', role: 'executive', contextKey: 'pilot' };
  const old = await gateway.getActor(principal);
  let releaseFirst, releaseSecond, firstStarted, secondStarted;
  const firstGate = new Promise(done => { releaseFirst = done; });
  const secondGate = new Promise(done => { releaseSecond = done; });
  const firstReady = new Promise(done => { firstStarted = done; });
  const secondReady = new Promise(done => { secondStarted = done; });
  t.after(() => { releaseFirst(); releaseSecond(); });
  const first = old.service.serial(async () => { firstStarted(); await firstGate; });
  await firstReady;
  const reload = gateway.reloadContext('pilot');
  await new Promise(done => setImmediate(done));
  let secondActive = false;
  const second = old.service.serial(async () => { secondActive = true; secondStarted(); await secondGate; secondActive = false; });
  releaseFirst();
  await secondReady;
  await reload;
  const fresh = await gateway.getActor(principal);
  assert.notEqual(fresh.service, old.service, 'Reload refreshes the configuration/service view');
  let freshStarted = false;
  const freshWrite = fresh.service.serial(async () => { freshStarted = true; assert.equal(secondActive, false); });
  await new Promise(done => setImmediate(done));
  assert.equal(freshStarted, false, 'A new actor view waits for writes queued while reload was waiting');
  releaseSecond();
  await Promise.all([first, second, freshWrite]);
});

test('mapped leader context refresh joins the executive write queue through the real HTTP tool', async t => {
  let releaseRefresh, refreshStarted;
  const refreshGate = new Promise(done => { releaseRefresh = done; });
  const refreshReady = new Promise(done => { refreshStarted = done; });
  t.after(() => releaseRefresh());
  const serviceFactory = async (path, actor) => {
    const config = JSON.parse(await readFile(path, 'utf8'));
    const service = await new CoachService({ contextDir: resolve(dirname(path), config.contextDir), actor }).init();
    if (actor.role === 'leader' && config.executiveId === 'exec@example.test') {
      const context = service.context.bind(service);
      service.context = async args => { refreshStarted(); await refreshGate; return context(args); };
    }
    return service;
  };
  const { gateway, client } = await fixture(t, {
    configs: {
      pilot: { contextDir: './exec-context', executiveId: 'exec@example.test' },
      team: { contextDir: './team-context', executiveId: 'leader@example.test', leaderContextKeys: ['pilot'] },
    },
    serviceFactory,
    principalOverrides: { leader: { id: 'leader@example.test', role: 'leader', contextKey: 'team' } },
  });
  const leader = await client('leader');
  const refreshing = leader.callTool({ name: 'get_account_context', arguments: { contextKey: 'pilot', accountId: 'buyer', refresh: true } });
  await refreshReady;
  const executive = await gateway.getActor({ id: 'exec@example.test', role: 'executive', contextKey: 'pilot' });
  let executiveWriteStarted = false;
  const executiveWrite = executive.service.serial(async () => { executiveWriteStarted = true; });
  await new Promise(done => setImmediate(done));
  assert.equal(executiveWriteStarted, false, 'Leader refresh may write current CRM context, so concurrent executive writes must wait');
  releaseRefresh();
  unpack(await refreshing);
  await executiveWrite;
  assert.equal(executiveWriteStarted, true);
});

async function sourceFixture(t) {
  let calls = 0, failure, syncedAt = '2026-10-02T03:28:00Z';
  const { client } = await fixture(t, {
    configs: { pilot: { contextDir: './context', executiveId: 'exec@example.test', sourceConnection: { status: 'awaiting-source-sync', receipt: { verifiedAt: '2026-10-02T03:00:00Z' } } } },
    serviceFactory: async (path, actor) => {
      const config = JSON.parse(await readFile(path, 'utf8'));
      const adapter = { scopeMode: 'assigned', baseUrl: 'https://crm.example.test', messageChannelIds: ['mail'], calendarChannelIds: ['calendar'],
        resolveSourceChannels: async () => {
          calls++; if (failure) throw Object.assign(new Error('private-provider-detail'), { code: failure });
          const channel = id => ({ id, authFailed: false, isSyncEnabled: true, syncedAt, syncStatus: 'FETCH_PENDING', syncStage: 'MESSAGES' });
          return { checkedAt: '2026-10-02T04:00:00Z', messageChannels: [channel('mail')], calendarChannels: [channel('calendar')] };
        } };
      return new CoachService({ actor, adapter, contextDir: resolve(dirname(path), config.contextDir) }).init();
    }
  });
  return { exec: await client('exec'), calls: () => calls, fail: code => failure = code, setSync: value => syncedAt = value };
}

test('hosted status and instructions verify connected channels independently of empty retained evidence and stale receipt', async t => {
  const f = await sourceFixture(t);
  const instructions = unpack(await f.exec.callTool({ name: 'get_coach_instructions', arguments: {} }));
  const status = unpack(await f.exec.callTool({ name: 'coach_status', arguments: {} }));
  assert.deepEqual(status.sources, []);
  assert.equal(status.sourceConfiguration.status, 'connected');
  assert.equal(status.sourceConfiguration.receiptStatus, 'source-sync-observed');
  assert.equal(status.sourceConfiguration.email.lastSyncedAt, '2026-10-02T03:28:00.000Z');
  assert.equal(status.sourceConfiguration.verifiedAt, '2026-10-02T03:00:00Z');
  assert.equal(status.sourceConfiguration.checkedAt, '2026-10-02T04:00:00Z');
  assert.equal(status.sourceConfiguration.contentCoverageVerified, false);
  assert.deepEqual(status.sourceConfiguration, instructions.sourceConfiguration);
  assert.equal(f.calls(), 2, 'Each explicit setup/status check is live');
  assert.equal(status.permissionPreflight.phase, 'permissions-unverified');
  assert.deepEqual(status.permissionPreflight, instructions.permissionPreflight);
});

test('setup readiness reports unknown on provider failure, required authorization on revocation, and pending sync separately from connected', async t => {
  const f = await sourceFixture(t);
  f.fail('SOURCE_OWNERSHIP_UNAVAILABLE');
  const unavailable = unpack(await f.exec.callTool({ name: 'coach_status', arguments: {} }));
  assert.equal(unavailable.sourceConfiguration.status, 'verification-unavailable');
  assert.equal(unavailable.sourceConfiguration.checkedAt, null);
  assert.doesNotMatch(JSON.stringify(unavailable), /private-provider-detail/);
  f.fail('SOURCE_OWNERSHIP_REVOKED');
  const revoked = unpack(await f.exec.callTool({ name: 'get_coach_instructions', arguments: {} }));
  assert.equal(revoked.sourceConfiguration.status, 'authorization-required');
  f.fail(undefined); f.setSync(null);
  const pending = unpack(await f.exec.callTool({ name: 'coach_status', arguments: {} }));
  assert.equal(pending.sourceConfiguration.status, 'connected');
  assert.equal(pending.sourceConfiguration.email.status, 'awaiting-sync');
  assert.equal(pending.sourceConfiguration.email.lastSyncedAt, null);
});
