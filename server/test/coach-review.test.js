import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import { createCoachReviewHandlers } from '../dist/coach-review.js';
import { CoachService } from '../../sales-coach/service.mjs';
import { reviewProposal, decideProposal } from '../../sales-coach/confirmation.mjs';

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'coach-review-'));
  const actor = { id: 'executive@example.test', role: 'executive' };
  const principal = { ...actor, contextKey: 'pilot' };
  let grant = principal;
  let writes = 0;
  const service = await new CoachService({ contextDir: directory, actor, adapter: {
    async update({ id, values }) { writes++; return { record: { id, ...values, updatedAt: '2026-10-01T10:00:00Z' } }; },
    async create({ values }) { writes++; return { record: { ...values, updatedAt: '2026-10-01T10:00:00Z' } }; },
  } }).init();
  const source = await service.store.source({ sourceKey: 'Executive account', text: 'The buyer said the order was accepted.', kind: 'testimony' });
  await service.store.update({ accountId: 'acme', title: 'Acme Pharmacy', entries: [{ kind: 'note', text: source.text, sourceIds: [source.id], status: 'human-account' }] });
  await service.store.rememberCRM('acme', 'opportunity', { id: 'order-one', name: 'Autumn trial order', stage: 'Proposal', updatedAt: '2026-10-01T09:00:00Z' });
  await service.store.rememberCRM('acme', 'opportunity', { id: 'order-two', name: 'Spring repeat order', stage: 'Qualification', updatedAt: '2026-10-01T08:00:00Z' });
  const change = await service.propose({ accountId: 'acme', object: 'opportunity', id: 'order-one', values: { stage: 'Won' }, expectedUpdatedAt: '2026-10-01T09:00:00Z', sourceIds: [source.id], reason: 'The executive reported acceptance. Confirm the commercial outcome.', estimatedErrorCost: 'high', highlyConsequential: true });
  const app = express();
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const handlers = createCoachReviewHandlers({ publicUrl: base, enabled: () => true, getActor: async () => ({ service }),
    resolvePrincipal: async () => grant,
    readBrowserSession: async req => req.headers.cookie?.includes('fixture-session=valid') ? { id: 'signed-browser-session', accountId: actor.id } : null,
    createBrowserSession: async (id, res) => { res.cookie('fixture-session', 'valid', { httpOnly: true }); return { id: 'signed-browser-session', accountId: id }; },
    endBrowserSession: async (_req, res) => { res.clearCookie('fixture-session'); },
    verifyPassword: async (email, password) => email === actor.id && password === 'fixture-password',
  });
  app.get('/coach/review/:contextKey/:id', handlers.get);
  app.post('/coach/review/:contextKey/:id', express.urlencoded({ extended: false, limit: '16kb' }), handlers.post);
  app.post('/coach/review/:contextKey/:id/login', express.urlencoded({ extended: false, limit: '16kb' }), handlers.login);
  app.post('/coach/review/:contextKey/:id/logout', express.urlencoded({ extended: false, limit: '16kb' }), handlers.logout);
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true }); });
  const path = `/coach/review/pilot/${change.id}`;
  const request = (suffix = '', options = {}) => fetch(`${base}${path}${suffix}`, { redirect: 'manual', ...options });
  const read = async () => (await request('', { headers: { Cookie: 'fixture-session=valid' } })).text();
  const fields = html => Object.fromEntries([...html.matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)">/g)].map(match => [match[1], match[2]]));
  const submit = (body, headers = {}) => request('', { method: 'POST', headers: { Cookie: 'fixture-session=valid', Origin: base, 'Content-Type': 'application/x-www-form-urlencoded', ...headers }, body: new URLSearchParams(body) });
  return { actor, principal, source, service, change, request, read, fields, submit, base, path, writes: () => writes, setGrant: next => { grant = next; } };
}

test('review links and bearer tokens convey no browser confirmation authority', async t => {
  const f = await fixture(t);
  const publicResult = await f.request();
  const publicHtml = await publicResult.text();
  assert.match(publicHtml, /Sign in to review/);
  assert.doesNotMatch(publicHtml, /Acme Pharmacy|The buyer said|Proposed value/);
  assert.equal(publicResult.headers.get('cache-control'), 'no-store');
  assert.equal(publicResult.headers.get('referrer-policy'), 'same-origin');
  assert.match(publicResult.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal((await f.request('', { headers: { Authorization: 'Bearer model-token' } })).status, 403);
  assert.equal((await f.submit({ decision: 'approve' }, { Cookie: '' })).status, 401);
  assert.equal(f.writes(), 0);
});

test('human signs in with existing credentials and receives review session without approving', async t => {
  const f = await fixture(t);
  const response = await f.request();
  const nonceCookie = response.headers.get('set-cookie').split(';')[0];
  const csrf = f.fields(await response.text()).csrf;
  const login = await f.request('/login', { method: 'POST', headers: { Cookie: nonceCookie, Origin: f.base, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ csrf, email: f.actor.id, password: 'fixture-password' }) });
  assert.equal(login.status, 303);
  assert.match(login.headers.get('set-cookie'), /fixture-session=valid/);
  assert.equal((await f.service.store.change(f.change.id)).state, 'awaiting-confirmation');
  assert.equal(f.writes(), 0);
});

test('review shows exact values, evidence and consequences; approval applies once and persists', async t => {
  const f = await fixture(t);
  const html = await f.read();
  for (const expected of ['Acme Pharmacy', 'Autumn trial order', 'Proposal', 'Won', 'The buyer said the order was accepted.', 'highly consequential', 'Apply change', 'Reject change']) assert.ok(html.includes(expected), expected);
  assert.doesNotMatch(html, /Spring repeat order/);
  const body = { ...f.fields(html), decision: 'approve' };
  assert.equal((await f.submit(body)).status, 303);
  const applied = await f.service.store.change(f.change.id);
  assert.equal(applied.state, 'applied');
  assert.equal(applied.confirmedBy.id, f.actor.id);
  assert.equal(applied.reviewedSnapshot.previous.record.stage, 'Proposal');
  assert.equal(f.writes(), 1);
  const outcome = await f.read();
  assert.match(outcome, /Change applied/);
  assert.match(outcome, /Autumn trial order/);
  assert.doesNotMatch(outcome, /Spring repeat order/);
  assert.match(outcome, /CRM value at review/);
  assert.match(outcome, /Applied value/);
  assert.equal((await reviewProposal(f.service, f.change.id)).previous.record.stage, 'Proposal');
  assert.equal((await f.submit(body)).status, 409);
  assert.equal(f.writes(), 1);
});

test('rejection is durable and resume does not apply it', async t => {
  const f = await fixture(t);
  assert.equal((await f.submit({ ...f.fields(await f.read()), decision: 'reject' })).status, 303);
  const rejected = await f.service.store.change(f.change.id);
  assert.equal(rejected.state, 'rejected');
  assert.equal(rejected.rejectedBy.id, f.actor.id);
  await f.service.resume();
  assert.equal(f.writes(), 0);
  assert.match(await f.read(), /Change rejected/);
});

test('a created record remains described as creation after the CRM assigns its ID', async t => {
  const f = await fixture(t);
  const proposal = await f.service.propose({ accountId: 'new-pharmacy', object: 'company', values: { name: 'New Pharmacy' }, sourceIds: [f.source.id], reason: 'New identity needs review.', estimatedErrorCost: 'high', highlyConsequential: true });
  const url = `${f.base}/coach/review/pilot/${proposal.id}`;
  const html = await (await fetch(url, { headers: { Cookie: 'fixture-session=valid' } })).text();
  assert.match(html, /Create company/);
  assert.match(html, /<p class="record-name">New Pharmacy<\/p>/);
  const result = await fetch(url, { method: 'POST', redirect: 'manual', headers: { Cookie: 'fixture-session=valid', Origin: f.base, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ ...f.fields(html), decision: 'approve' }) });
  assert.equal(result.status, 303);
  const outcome = await (await fetch(url, { headers: { Cookie: 'fixture-session=valid' } })).text();
  assert.match(outcome, /Create company/);
  assert.match(outcome, /Applied value/);
  assert.doesNotMatch(outcome, /CRM value at review/);
});

test('CSRF, wrong origin, role changes and context mismatch reject before effects', async t => {
  const f = await fixture(t);
  const body = { ...f.fields(await f.read()), decision: 'approve' };
  assert.equal((await f.submit({ ...body, csrf: 'untrusted' })).status, 403);
  assert.equal((await f.submit(body, { Origin: 'https://attacker.test' })).status, 403);
  assert.equal((await f.submit(body, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  f.setGrant({ ...f.principal, role: 'leader' });
  assert.equal((await f.submit(body)).status, 403);
  f.setGrant({ ...f.principal, contextKey: 'another' });
  assert.equal((await f.submit(body)).status, 403);
  f.setGrant(null);
  assert.equal((await f.submit(body)).status, 403);
  assert.equal(f.writes(), 0);
});

test('changed proposal or evidence invalidates the exact review digest', async t => {
  const f = await fixture(t);
  const body = { ...f.fields(await f.read()), decision: 'approve' };
  await f.service.store.putChange({ ...f.change, values: { stage: 'Lost' } });
  assert.equal((await f.submit(body)).status, 409);
  const review = await reviewProposal(f.service, f.change.id);
  await f.service.store.source({ sourceKey: f.source.sourceKey, text: f.source.text, metadata: { corrected: 'uncertain acceptance' } });
  await assert.rejects(decideProposal(f.service, { id: f.change.id, digest: review.digest, decision: 'approve' }), /evidence changed/);
  assert.equal(f.writes(), 0);
});

test('current grant is checked again after queued operations', async t => {
  const f = await fixture(t);
  const body = { ...f.fields(await f.read()), decision: 'approve' };
  const originalSerial = f.service.serial.bind(f.service);
  f.service.serial = operation => originalSerial(async () => { f.setGrant(null); return operation(); });
  assert.equal((await f.submit(body)).status, 403);
  assert.equal(f.writes(), 0);
});

test('retained evidence and proposal values cannot inject HTML or form controls', async t => {
  const f = await fixture(t);
  await f.service.store.putChange({ ...f.change, reason: '<script>alert(1)</script>', values: { name: '"><input name="decision" value="approve">' } });
  const html = await f.read();
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>|<input name="decision"/);
});
