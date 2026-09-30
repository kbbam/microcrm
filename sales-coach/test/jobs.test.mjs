import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, readFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { jobStore, executeAttempt, inspectJob, reconstructionPrompt, cancelJob } from '../jobs.mjs';

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'coach-job-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const config = join(dir, 'config.json');
  await writeFile(config, JSON.stringify({ contextDir: 'context', actor: { id: 'executive-test', role: 'executive' } }));
  const host = await jobStore(config);
  const source = await host.store.source({ sourceKey: 'original', text: 'Buyer requests a follow-up; no accepted order.' });
  const job = { id: 'test-job', actor: host.store.actor, sourceIds: [source.id], state: 'queued', queuedAt: new Date().toISOString(), attempts: [] };
  await host.store.save(host.file(job.id), job);
  return { dir, config, host, source, job };
}

test('actual child completion persists log, summary and original source for later restart', async t => {
  const f = await fixture(t);
  const script = join(f.dir, 'success.mjs');
  await writeFile(script, `console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'Reconstructed; CRM unconfigured.'}}));`);
  const job = await executeAttempt(f.host, f.job.id, { launchPath: script });
  assert.equal(job.state, 'completed');
  assert.equal(job.summary, 'Reconstructed; CRM unconfigured.');
  assert.equal(job.attempts[0].code, 0);
  assert.match(await readFile(job.attempts[0].logPath, 'utf8'), /CRM unconfigured/);
  const freshHost = await jobStore(f.config);
  assert.equal((await inspectJob(freshHost, f.job.id)).state, 'completed');
  assert.equal((await freshHost.store.sources([f.source.id]))[0].text, 'Buyer requests a follow-up; no accepted order.');
});

test('actual failing child retains failure detail and can run another durable attempt', async t => {
  const f = await fixture(t);
  const script = join(f.dir, 'failure.mjs');
  await writeFile(script, `console.error('synthetic native failure'); process.exit(7);`);
  const failed = await executeAttempt(f.host, f.job.id, { launchPath: script });
  assert.equal(failed.state, 'failed');
  assert.equal(failed.attempts[0].code, 7);
  assert.match(await readFile(failed.attempts[0].errorPath, 'utf8'), /synthetic native failure/);
  await f.host.store.save(f.host.file(f.job.id), { ...failed, state: 'queued', queuedAt: new Date().toISOString() });
  await writeFile(script, `console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'Resumed from original source.'}}));`);
  const resumed = await executeAttempt(f.host, f.job.id, { launchPath: script });
  assert.equal(resumed.state, 'completed');
  assert.equal(resumed.attempts.length, 2);
  assert.equal(resumed.sourceIds[0], f.source.id);
});

test('lost worker is reported interrupted rather than silently completed', async t => {
  const f = await fixture(t);
  await f.host.store.save(f.host.file(f.job.id), { ...f.job, state: 'running', workerPid: 2147483647 });
  const job = await inspectJob(f.host, f.job.id);
  assert.equal(job.state, 'interrupted');
  assert.match(job.error, /durable completion/);
  assert.ok(reconstructionPrompt(job).includes(f.source.id));
  assert.match(reconstructionPrompt(job), /resumed attempt/);
  assert.match(reconstructionPrompt(job), /Never send messages/);
});

test('different trusted actor cannot inspect another actor job', async t => {
  const f = await fixture(t);
  await writeFile(f.config, JSON.stringify({ contextDir: 'context', actor: { id: 'another-executive', role: 'executive' } }));
  await assert.rejects(inspectJob(await jobStore(f.config), f.job.id), /different authenticated actor/);
});

test('cancel does not signal a live PID without the matching worker ownership witness', async t => {
  const f = await fixture(t);
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'ignore' });
  t.after(() => child.kill('SIGTERM'));
  await new Promise((done, fail) => { child.once('spawn', done); child.once('error', fail); });
  await f.host.store.save(f.host.file(f.job.id), { ...f.job, state: 'running', workerPid: child.pid });
  const result = await cancelJob(f.host, f.job.id);
  assert.equal(result.state, 'interrupted');
  assert.doesNotThrow(() => process.kill(child.pid, 0));
});

test('cancel signals only the live process group with its matching owned worker witness', async t => {
  const f = await fixture(t);
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'ignore' });
  t.after(() => child.kill('SIGTERM'));
  await new Promise((done, fail) => { child.once('spawn', done); child.once('error', fail); });
  const witness = join(f.host.directory, `${f.job.id}.worker-lock`, 'native-session.lock');
  await mkdir(witness, { recursive: true });
  await writeFile(join(witness, 'owner.json'), JSON.stringify({ ownerPid: child.pid }));
  await f.host.store.save(f.host.file(f.job.id), { ...f.job, state: 'running', workerPid: child.pid });
  const exited = new Promise(done => child.once('close', (code, signal) => done({ code, signal })));
  const result = await cancelJob(f.host, f.job.id);
  assert.equal(result.cancellationRequested, true);
  assert.equal((await exited).signal, 'SIGTERM');
});
