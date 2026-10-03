import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { restrictCatalog, validateMode, isolatedEnvironment, buildInvocation, acquireContextLock, COACH_TOOLS } from '../launch.mjs';

test('runtime retains inference model identity while removing built-in coding tool exposure', () => {
  const catalog = { models: [{ slug: 'configured-model', context_window: 1000, tool_mode: 'code_mode_only', apply_patch_tool_type: 'freeform', experimental_supported_tools: ['clock'] }] };
  const result = restrictCatalog(catalog);
  assert.equal(result.models[0].slug, catalog.models[0].slug);
  assert.equal(result.models[0].context_window, 1000);
  assert.equal(result.models[0].tool_mode, null);
  assert.equal(result.models[0].apply_patch_tool_type, null);
  assert.deepEqual(result.models[0].experimental_supported_tools, []);
  assert.equal(result.models[0].supports_search_tool, false);
  assert.equal(catalog.models[0].tool_mode, 'code_mode_only');
  assert.throws(() => restrictCatalog({ models: [] }));
});

test('only one active native process owns a durable context; a dead owner is recoverable', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'coach-native-lock-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const first = await acquireContextLock(directory);
  await assert.rejects(acquireContextLock(directory), /busy.*active native process/);
  await first.release();
  await mkdir(join(directory, 'native-session.lock'));
  await writeFile(join(directory, 'native-session.lock', 'owner.json'), JSON.stringify({ ownerPid: 2147483647, childPid: null, token: 'dead' }));
  const recovered = await acquireContextLock(directory);
  await assert.rejects(acquireContextLock(directory), /busy/);
  await recovered.release();
});

test('a different live OS process excludes concurrent native and human CLI work', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'coach-native-child-lock-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const moduleUrl = new URL('../launch.mjs', import.meta.url).href;
  const code = `import { acquireContextLock } from ${JSON.stringify(moduleUrl)}; const lease = await acquireContextLock(${JSON.stringify(directory)}); console.log('claimed'); process.stdin.once('data', async () => { await lease.release(); process.exit(0); }); process.stdin.resume();`;
  const child = spawn(process.execPath, ['--input-type=module', '-e', code], { stdio: ['pipe', 'pipe', 'pipe'] });
  t.after(() => child.kill('SIGTERM'));
  await new Promise((done, fail) => { child.stdout.once('data', done); child.once('error', fail); child.once('exit', code => code && fail(new Error('Lock child failed'))); });
  await assert.rejects(acquireContextLock(directory), /busy.*active native process/);
  child.stdin.end('release');
  await new Promise(done => child.once('close', done));
  const lease = await acquireContextLock(directory);
  await lease.release();
});

test('launch mode enforces the host-configured coach role independently of CRM credentials', () => {
  const config = role => ({ contextDir: 'data', actor: { id: 'human', role } });
  validateMode(config('executive'), 'coach');
  validateMode(config('admin'), 'leader');
  validateMode(config('leader'), 'leader');
  assert.throws(() => validateMode(config('executive'), 'leader'));
  assert.throws(() => validateMode(config('admin'), 'coach'));
  assert.throws(() => validateMode(config('invented'), 'leader'));
});

test('unrelated connector/API credentials and runtime overrides are not inherited', () => {
  const env = isolatedEnvironment({ HOME: '/home/test', PATH: '/bin', OPENAI_API_KEY: 'secret', COACH_CONFIG: '/untrusted', CODEX_CONFIG: 'override', GMAIL_TOKEN: 'secret' });
  assert.deepEqual(env, { HOME: '/home/test', PATH: '/bin' });
});

test('invocation isolates config and tools, binds trusted config, and exposes no confirmation tool', () => {
  const args = buildInvocation({ configPath: '/pilot/config.json', catalogPath: '/private/models.json', cwd: '/private/empty', instructions: 'trusted skill', nodePath: '/usr/bin/node', mcpPath: '/product/mcp.mjs' });
  for (const flag of ['--ignore-user-config', '--ignore-rules', '--strict-config', '--ephemeral']) assert.ok(args.includes(flag));
  assert.equal(args[args.indexOf('--sandbox') + 1], 'read-only');
  assert.ok(args.includes('agents.enabled=false'));
  assert.ok(args.includes('mcp_servers.coach.required=true'));
  assert.ok(args.includes('mcp_servers.coach.default_tools_approval_mode="approve"'));
  assert.ok(args.includes('mcp_servers.coach.command="/usr/bin/node"'));
  assert.ok(args.includes('mcp_servers.coach.args=["/product/mcp.mjs"]'));
  assert.ok(args.includes('mcp_servers.coach.env.COACH_CONFIG="/pilot/config.json"'));
  assert.ok(args.includes('mcp_servers.coach.env_vars=[]'));
  assert.ok(!COACH_TOOLS.some(name => /confirm|execute|send|shell/.test(name)));
  assert.throws(() => buildInvocation({ configPath: 'relative', catalogPath: '/a', cwd: '/b', instructions: '' }));
});
