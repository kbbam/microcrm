import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
if (!process.env.DATABASE_URL) throw Error('DATABASE_URL must point to an isolated test Postgres database.');
process.env.LOCAL_INSECURE_DB = '1';
process.env.COACH_ENABLED = '1';
// Isolate this file’s schema from concurrently running CRM integration tests.
const databaseUrl = new URL(process.env.DATABASE_URL);
databaseUrl.searchParams.set('options', '-c search_path=auth_account_test');
process.env.DATABASE_URL = databaseUrl.toString();
const { pool, initSchema } = await import('../dist/db.js');
const { createInvite, consumeInvite, inspectInvite, verifyLogin } = await import('../dist/users.js');
before(async () => { await pool.query('CREATE SCHEMA IF NOT EXISTS auth_account_test'); await initSchema(); });
after(() => pool.end());
const email = () => `auth-${crypto.randomUUID()}@example.test`;

test('simultaneous use of one setup link changes credentials once', async () => {
  const account = email();
  const token = await createInvite(account);
  const results = await Promise.all([consumeInvite(token, 'first-valid-password'), consumeInvite(token, 'second-valid-password')]);
  assert.equal(results.filter(result => result.ok).length, 1);
  const firstWon = results[0].ok;
  assert.equal(await verifyLogin(account, firstWon ? 'first-valid-password' : 'second-valid-password'), true);
  assert.equal(await verifyLogin(account, firstWon ? 'second-valid-password' : 'first-valid-password'), false);
  assert.equal((await inspectInvite(token)).ok, false);
});

test('successful reset invalidates all other personal setup links without changing roles', async () => {
  const account = email();
  const earlier = await createInvite(account);
  const current = await createInvite(account);
  await pool.query("INSERT INTO coach_access(email,role,context_key,enabled) VALUES($1,'executive','isolated_auth_test',true)",[account]);
  await pool.query("INSERT INTO oidc_models(model,id,payload) VALUES ('RefreshToken',$1,$2)",[crypto.randomUUID(),{accountId:account}]);
  assert.equal((await consumeInvite(current, 'current-valid-password')).ok, true);
  assert.equal((await pool.query("SELECT count(*)::int AS count FROM oidc_models WHERE payload->>'accountId'=$1",[account])).rows[0].count,0);
  assert.equal((await consumeInvite(earlier, 'older-valid-password')).ok, false);
  assert.equal(await verifyLogin(account, 'current-valid-password'), true);
  assert.equal(await verifyLogin(account, 'older-valid-password'), false);
  const { rows } = await pool.query('SELECT status FROM users WHERE email=$1', [account]);
  assert.equal(rows[0].status, 'active');
  assert.deepEqual((await pool.query('SELECT role,context_key,enabled FROM coach_access WHERE email=$1',[account])).rows[0],{role:'executive',context_key:'isolated_auth_test',enabled:true});
});

test('expired and used links cannot change an active password', async () => {
  const account = email();
  const setup = await createInvite(account);
  await consumeInvite(setup, 'initial-valid-password');
  const expired = await createInvite(account);
  await pool.query(`UPDATE invites SET expires_at=now()-interval '1 second' WHERE token=$1`, [expired]);
  assert.equal((await consumeInvite(expired, 'expired-valid-password')).ok, false);
  assert.equal((await consumeInvite(setup, 'used-valid-password')).ok, false);
  assert.equal(await verifyLogin(account, 'initial-valid-password'), true);
});
