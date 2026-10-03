import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir, writeFile, mkdir, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, request } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { EvidenceUploadStore } from '../evidence-upload.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function fixture(t, options = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'coach-evidence-'));
  let store = await new EvidenceUploadStore(dir, options).init();
  const server = createServer(async (req, res) => { if (!await store.handleUpload(req, res) && !await store.handleDownload(req, res)) { res.writeHead(404); res.end(); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await rm(dir, { recursive: true, force: true }); });
  return { dir, base, get store() { return store; }, restart: async () => { store = await new EvidenceUploadStore(dir, options).init(); } };
}
const input = bytes => ({ ownerId: 'exec@example.test', accountId: 'northstar', sourceIds: ['text-1'], filename: 'screenshot.png', mimeType: 'image/png', expectedSize: bytes.length, expectedSha256: hash(bytes) });
async function put(url, bytes) { const response = await fetch(url, { method: 'PUT', body: bytes }); return { status: response.status, body: await response.json() }; }

test('expired address renews the same evidence after restart without another user upload', async t => {
  let now = Date.now();
  const f = await fixture(t, { ttlMs: 100, now: () => now });
  const bytes = Buffer.from('original already attached in the conversation');
  const first = await f.store.createUpload(input(bytes), f.base);
  now += 101;
  await f.restart();
  assert.equal((await put(first.uploadUrl, bytes)).status, 410);
  await assert.rejects(f.store.renewUpload(first.evidenceId, { id: 'other@example.test', role: 'executive' }, f.base), /authorized scope/);
  const renewed = await f.store.renewUpload(first.evidenceId, { id: 'exec@example.test', role: 'executive' }, f.base);
  assert.equal(renewed.evidenceId, first.evidenceId);
  assert.notEqual(renewed.uploadUrl, first.uploadUrl);
  assert.equal((await put(renewed.uploadUrl, bytes)).status, 201);
  const recovered = await f.store.renewUpload(first.evidenceId, { id: 'exec@example.test', role: 'executive' }, f.base);
  assert.equal(recovered.alreadyPreserved, true);
  assert.equal(recovered.evidence.sha256, hash(bytes));
  assert.equal((await readdir(join(f.dir, 'originals'))).length, 1);
});

test('real HTTP streams original bytes; atomic original survives restart; identical receipt retries', async t => {
  const f = await fixture(t);
  const bytes = randomBytes(440487);
  const ticket = await f.store.createUpload(input(bytes), f.base);
  const response = await put(ticket.uploadUrl, bytes);
  assert.equal(response.status, 201);
  assert.equal(response.body.evidence.id, ticket.evidenceId);
  assert.equal(response.body.evidence.sha256, hash(bytes));
  await f.restart();
  const retained = await f.store.readOriginal(ticket.evidenceId, { id: 'exec@example.test', role: 'executive' });
  assert.deepEqual(retained.bytes, bytes);
  assert.equal(retained.metadata.accountId, 'northstar');
  assert.deepEqual(retained.metadata.sourceIds, ['text-1']);
  const retry = await put(ticket.uploadUrl, bytes);
  assert.equal(retry.status, 200);
  assert.equal(retry.body.duplicate, true);
  assert.equal((await readdir(join(f.dir, 'originals'))).length, 1);
  assert.equal((await fetch(`${f.base}/evidence/${ticket.evidenceId}`)).status, 404);
  await assert.rejects(f.store.readOriginal(ticket.evidenceId, { id: 'exec-2', role: 'executive' }), /denied/);
  await assert.rejects(f.store.readOriginal(ticket.evidenceId, null), /Authenticated/);
  assert.deepEqual((await f.store.readOriginal(ticket.evidenceId, { id: 'lead', role: 'leader' })).bytes, bytes);
});

test('checksum and short-size failures never publish evidence and capability can retry', async t => {
  const f = await fixture(t);
  const bytes = Buffer.from('correct original');
  const ticket = await f.store.createUpload(input(bytes), f.base);
  assert.equal((await put(ticket.uploadUrl, Buffer.alloc(bytes.length))).status, 422);
  assert.equal((await put(ticket.uploadUrl, bytes.subarray(1))).status, 422);
  assert.deepEqual(await readdir(join(f.dir, 'originals')), []);
  assert.deepEqual(await readdir(join(f.dir, 'staging')), []);
  assert.equal((await put(ticket.uploadUrl, bytes)).status, 201);
  assert.equal((await put(ticket.uploadUrl, Buffer.alloc(bytes.length))).status, 422);
  assert.deepEqual((await f.store.readOriginal(ticket.evidenceId, { id: 'exec@example.test', role: 'executive' })).bytes, bytes);
});

test('expired capability denied after restart, unknown capability denied, methods restricted', async t => {
  let now = 1000;
  const f = await fixture(t, { now: () => now, ttlMs: 100 });
  const bytes = Buffer.from('fixture');
  const ticket = await f.store.createUpload(input(bytes), f.base);
  now = 1100;
  await f.restart();
  assert.equal((await put(ticket.uploadUrl, bytes)).status, 410);
  assert.equal((await put(`${f.base}/evidence/uploads/${'a'.repeat(43)}`, bytes)).status, 404);
  assert.equal((await fetch(ticket.uploadUrl)).status, 405);
});

test('chunked over-limit bodies cannot create original', async t => {
  const f = await fixture(t, { maxBytes: 16 });
  const ticket = await f.store.createUpload(input(Buffer.from('small')), f.base);
  const status = await new Promise((resolve, reject) => {
    const req = request(ticket.uploadUrl, { method: 'PUT', headers: { 'Transfer-Encoding': 'chunked' } }, res => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    req.on('error', reject);
    req.write(Buffer.alloc(20));
    req.end();
  });
  assert.equal(status, 413);
  assert.deepEqual(await readdir(join(f.dir, 'originals')), []);
});

test('identical bytes submitted twice preserve distinct evidence occurrences; retrieval detects corruption', async t => {
  const f = await fixture(t);
  const bytes = Buffer.from('same image, different observation');
  const first = await f.store.createUpload(input(bytes), f.base);
  const second = await f.store.createUpload({ ...input(bytes), sourceIds: ['text-2'] }, f.base);
  await put(first.uploadUrl, bytes);
  await put(second.uploadUrl, bytes);
  assert.notEqual(first.evidenceId, second.evidenceId);
  assert.equal((await readdir(join(f.dir, 'originals'))).length, 2);
  await writeFile(join(f.dir, 'originals', first.evidenceId, 'original'), 'damaged');
  await assert.rejects(f.store.readOriginal(first.evidenceId, { id: 'exec@example.test', role: 'executive' }), /integrity/);
});


test('restart recovers interrupted lock and contextual route remains capability scoped', async t => {
  const f = await fixture(t, { uploadPath: '/coach/evidence/upload/context-1' });
  const bytes = Buffer.from('recover original');
  const ticket = await f.store.createUpload(input(bytes), f.base);
  const token = new URL(ticket.uploadUrl).pathname.split('/').at(-1);
  const lock = join(f.dir, 'locks', hash(token));
  await mkdir(lock);
  await writeFile(join(lock, 'owner.json'), JSON.stringify({ pid: 2147483647 }));
  await f.restart();
  assert.equal((await put(ticket.uploadUrl, bytes)).status, 201);
  const next = await f.store.createUpload(input(bytes), f.base);
  const nextLock = join(f.dir, 'locks', hash(new URL(next.uploadUrl).pathname.split('/').at(-1)));
  await mkdir(nextLock);
  assert.equal((await put(next.uploadUrl, bytes)).status, 409);
  await utimes(nextLock, new Date(0), new Date(0));
  await f.restart();
  assert.equal((await put(next.uploadUrl, bytes)).status, 201);
});


test('authorized short-lived download preserves exact bytes, supports retry, rejects other actors and expires', async t => {
  let now = 1000;
  const f = await fixture(t, { now: () => now, downloadTtlMs: 100, downloadPath: '/coach/evidence/download/context-1' });
  const bytes = randomBytes(440487);
  const ticket = await f.store.createUpload(input(bytes), f.base);
  await put(ticket.uploadUrl, bytes);
  await assert.rejects(f.store.createDownload(ticket.evidenceId, { id: 'other@example.test', role: 'executive' }, f.base), /denied/);
  await assert.rejects(f.store.createDownload(ticket.evidenceId, null, f.base), /Authenticated/);
  assert.deepEqual(await readdir(join(f.dir, 'downloads')), []);
  const download = await f.store.createDownload(ticket.evidenceId, { id: 'exec@example.test', role: 'executive' }, f.base);
  assert.equal(download.sha256, hash(bytes));
  assert.equal(download.size, bytes.length);
  const token = new URL(download.downloadUrl).pathname.split('/').at(-1);
  const files = await readdir(join(f.dir, 'downloads'));
  assert.deepEqual(files, [`${hash(token)}.json`]);
  const diskGrant = await import('node:fs/promises').then(fs => fs.readFile(join(f.dir, 'downloads', files[0]), 'utf8'));
  assert.equal(diskGrant.includes(token), false);
  await f.restart();
  for (let i = 0; i < 2; i++) {
    const response = await fetch(download.downloadUrl);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('content-length'), String(bytes.length));
    assert.equal(response.headers.get('content-type'), 'image/png');
    assert.ok(response.headers.get('content-disposition').startsWith('attachment;'));
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
  }
  assert.equal((await fetch(`${f.base}/coach/evidence/download/context-1/${ticket.evidenceId}`)).status, 404);
  assert.equal((await fetch(download.downloadUrl, { method: 'POST' })).status, 405);
  now = 1100;
  assert.equal((await fetch(download.downloadUrl)).status, 410);
});

test('download integrity failure hides local paths and never returns damaged original', async t => {
  const f = await fixture(t);
  const bytes = Buffer.from('original');
  const ticket = await f.store.createUpload(input(bytes), f.base);
  await put(ticket.uploadUrl, bytes);
  const download = await f.store.createDownload(ticket.evidenceId, { id: 'leader@example.test', role: 'leader' }, f.base);
  await writeFile(join(f.dir, 'originals', ticket.evidenceId, 'original'), 'corrupted');
  const response = await fetch(download.downloadUrl);
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: 'Original download failed' });
  assert.throws(() => new EvidenceUploadStore(f.dir, { downloadTtlMs: 300001 }), /five minutes/);
});
