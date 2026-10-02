import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createSetupHandlers } from '../dist/setup.js';
import { accountHome, accountHelp } from '../dist/auth-page.js';

async function fixture(t, dependencies) {
  const app = express();
  const handlers = createSetupHandlers(dependencies);
  app.get('/', accountHome);
  app.get('/account/help', accountHelp);
  app.get('/setup', handlers.get);
  app.post('/setup', express.urlencoded({ extended: false }), handlers.post);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { get: path => fetch(`${base}${path}`), post: body => fetch(`${base}/setup`, { method: 'POST', body: new URLSearchParams(body) }) };
}

test('permanent account page supplies configured endpoint and honest recovery', async t => {
  const f = await fixture(t, {});
  const home = await f.get('/');
  assert.equal(home.status, 200);
  const html = await home.text();
  assert.match(html, /Settings → Connectors/);
  assert.match(html, /name="viewport"/);
  assert.equal(home.headers.get('cache-control'), 'no-store');
  assert.match(home.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.match(home.headers.get('content-security-policy'), /form-action 'self'/);
  const help = await (await f.get('/account/help')).text();
  assert.match(help, /ask your Business OS team administrator/);
  assert.doesNotMatch(help, /email has been sent/);
});

test('setup validates link, escapes token and account, and never trusts reflected query errors', async t => {
  const f = await fixture(t, { inspectInvite: async token => token === 'used' ? { ok: false, error: 'This setup link has already been used.' } : { ok: true, email: '<img src=x onerror=alert(1)>@example.test' }, consumeInvite: async () => { throw Error('must not consume during GET'); } });
  assert.equal((await f.get('/setup')).status, 400);
  const used = await f.get('/setup?token=used');
  assert.equal(used.status, 400);
  assert.doesNotMatch(await used.text(), /<form/);
  const html = await (await f.get('/setup?token=%22%3E%3Cscript%3E&error=attacker')).text();
  assert.match(html, /&lt;img/);
  assert.match(html, /&quot;&gt;&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>|onerror="|attacker/);
  assert.match(html, /autocomplete="new-password"/);
});

test('password confirmation and bcrypt byte limit reject before credential mutation', async t => {
  let consumed = 0;
  const f = await fixture(t, { inspectInvite: async () => ({ ok: true, email: 'exec@example.test' }), consumeInvite: async () => { consumed++; return { ok: true, email: 'exec@example.test' }; } });
  for (const [password, confirmation, message] of [['short', 'short', 'at least 8'], ['a-password', 'different', 'do not match'], ['😀'.repeat(19), '😀'.repeat(19), 'at most 72']]) {
    const result = await f.post({ token: 'fixture', password, confirmation });
    assert.equal(result.status, 400);
    assert.match(await result.text(), new RegExp(message));
  }
  assert.equal(consumed, 0);
  const success = await f.post({ token: 'fixture', password: 'valid-password', confirmation: 'valid-password' });
  assert.equal(success.status, 200);
  assert.match(await success.text(), /Password set/);
  assert.equal(consumed, 1);
});

test('database unavailability offers retry without disclosing internals', async t => {
  const f = await fixture(t, { inspectInvite: async () => { throw Error('private database hostname'); }, consumeInvite: async () => { throw Error('private database hostname'); } });
  for (const result of [await f.get('/setup?token=fixture'), await f.post({ token: 'fixture', password: 'valid-password', confirmation: 'valid-password' })]) {
    assert.equal(result.status, 503);
    const html = await result.text();
    assert.match(html, /Try your setup link again/);
    assert.doesNotMatch(html, /private database hostname/);
  }
});
