import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createGateway } from '../hosted.mjs';

const unpack = result => {
  assert(!result.isError, result.content?.[0]?.text);
  return JSON.parse(result.content[0].text);
};

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'coach-hosted-'));
  await writeFile(join(root, 'pilot.json'), JSON.stringify({ contextDir: './context', executiveId: 'exec@example.test', actor: { id: 'config-admin', role: 'admin' } }));
  const instructionsPath = join(root, 'instructions.md');
  await writeFile(instructionsPath, 'Help the executive. Preserve originals.');
  let gateway;
  const principals = {
    exec: { id: 'exec@example.test', role: 'executive', contextKey: 'pilot' },
    other: { id: 'other@example.test', role: 'executive', contextKey: 'pilot' },
    leader: { id: 'leader@example.test', role: 'leader', contextKey: 'pilot' },
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
  gateway = createGateway({ configRoot: root, publicUrl: base, instructionsPath });
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
    accountId: 'northstar', object: 'task', values: { title: 'Review trial terms' },
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
