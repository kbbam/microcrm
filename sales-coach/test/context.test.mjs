import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CoachService } from '../service.mjs';

const actor = { id: 'bruman@jpgrowery.com', role: 'executive' };
async function setup(t, adapter) {
  const contextDir = await mkdtemp(join(tmpdir(), 'coach-context-'));
  t.after(() => rm(contextDir, { recursive: true, force: true }));
  return new CoachService({ contextDir, actor, adapter }).init();
}
test('rich provenance, correction history and terminal opportunity survive repeated input and restart', async t => {
  const service = await setup(t);
  const source = await service.store.source({ sourceKey: 'notes:1', text: 'Buyer objects to payment terms. Prior trial pursuit lost. Ilya says trust matters.' });
  const duplicate = await service.store.source({ sourceKey: 'notes:1', text: source.text });
  assert.equal(source.id, duplicate.id);
  assert.equal((await service.store.listSources()).length, 1);
  const entries = [
    { id: 'goal', kind: 'goal', text: 'Fallback: increase expected commercial value; no invented volume.', status: 'inference', sourceIds: [source.id] },
    { id: 'lost-trial', kind: 'opportunity', text: 'Trial pursuit Lost; retain prior objections and outcomes.', status: 'human-account', sourceIds: [source.id] },
    { id: 'social', kind: 'social', text: 'Ilya: trust is important here.', status: 'human-account', sourceIds: [source.id] }
  ];
  await service.store.update({ accountId: 'buyer', title: 'Buyer', entries });
  await service.store.update({ accountId: 'buyer', entries });
  assert.equal((await service.store.account('buyer')).entries.length, 3);
  const correction = await service.store.source({ sourceKey: 'correction:1', text: 'Ilya: change account direction to retention.' });
  await service.store.update({ accountId: 'buyer', entries: [{ ...entries[0], text: 'Explicit human goal: retain relationship.', status: 'human-account', sourceIds: [correction.id] }] });
  const restarted = await new CoachService({ contextDir: service.store.directory, actor }).init();
  const context = await restarted.context({ accountId: 'buyer' });
  assert.equal(context.account.entries.length, 4);
  assert.equal(context.account.entries.findLast(e => e.id === 'goal').revision, 2);
  assert.equal(context.sources.length, 2);
  assert.ok(context.account.entries.some(e => e.id === 'lost-trial'));
  assert.ok(context.account.entries.some(e => e.kind === 'social'));
  await assert.rejects(() => service.store.update({ accountId: '../escape', entries }), /Invalid stable/);
  await assert.rejects(() => service.store.update({ accountId: 'buyer', entries: [{ kind: 'note', text: 'Invented fact', status: 'fact', sourceIds: [] }] }), /provenance/);
});
test('human CRM changes refresh operational values without flattening original social and objection context', async t => {
  let record = { id: 'buyer', name: 'Buyer', updatedAt: '1' };
  const adapter = { read: async ({ object }) => ({ records: object === 'company' ? [record] : [], coverage: { hasNextPage: false, complete: true } }) };
  const service = await setup(t, adapter);
  const source = await service.store.source({ sourceKey: 'email:1', text: 'Timing objection, response unknown; source beyond CRM.' });
  await service.store.update({ accountId: 'buyer', entries: [{ kind: 'objection', text: source.text, status: 'fact', sourceIds: [source.id] }] });
  await service.context({ accountId: 'buyer' });
  record = { ...record, name: 'Human correction', updatedAt: '2' };
  const context = await service.context({ accountId: 'buyer' });
  assert.equal(context.account.crm['company:buyer'].record.name, 'Human correction');
  assert.equal(context.account.entries.filter(e => e.kind === 'objection').length, 1);
  assert.equal(context.account.entries.filter(e => e.id.startsWith('crm-')).length, 2);
  assert.ok(context.sources.some(s => s.text.includes('source beyond CRM')));
});
test('ordinary writes auto apply, consequential proposals require trusted human confirmation and repeated proposal is idempotent', async t => {
  let record = { id: 'buyer', name: 'Buyer', updatedAt: '1' };
  let writes = 0;
  const adapter = {
    read: async () => ({ records: [record], coverage: { complete: true } }),
    update: async ({ values, expectedUpdatedAt }) => {
      if (expectedUpdatedAt !== record.updatedAt) throw new Error('Concurrent human edit');
      writes++;
      const before = record;
      record = { ...record, ...values, updatedAt: String(Number(record.updatedAt) + 1) };
      return { record, before };
    }
  };
  const service = await setup(t, adapter);
  const source = await service.store.source({ sourceKey: 'human:1', text: 'Confirmed name and important price change.' });
  const ordinary = { accountId: 'buyer', object: 'company', id: 'buyer', values: { name: 'Corrected name' }, expectedUpdatedAt: '1', sourceIds: [source.id], estimatedErrorCost: 'low', highlyConsequential: false, reason: 'Routine clear spelling correction' };
  assert.equal((await service.propose(ordinary)).state, 'applied');
  await service.propose(ordinary);
  assert.equal(writes, 1);
  const consequential = await service.propose({ ...ordinary, values: { name: 'Consequential disputed correction' }, expectedUpdatedAt: '2', highlyConsequential: true });
  assert.equal(consequential.state, 'awaiting-confirmation');
  const downgraded = await service.propose({ ...ordinary, values: consequential.values, expectedUpdatedAt: '2', highlyConsequential: false, reason: 'Now claiming low risk' });
  assert.equal(downgraded.state, 'awaiting-confirmation');
  record = { ...record, updatedAt: '3' }; // unrelated human edit refreshed the baseline
  const rebased = await service.propose({ ...ordinary, values: consequential.values, expectedUpdatedAt: '3', highlyConsequential: false, reason: 'Low risk after refresh' });
  assert.equal(rebased.state, 'awaiting-confirmation');
  assert.equal(rebased.inheritedHoldId, consequential.id);
  await assert.rejects(() => service.apply(consequential), /trusted human confirmation/);
  assert.equal(writes, 1);
  assert.equal((await service.confirm(rebased.id)).state, 'applied');
  assert.equal(writes, 2);
});
test('uncertain patch is reconciled after restart rather than repeated against a changed revision', async t => {
  let record = { id: 'buyer', name: 'Buyer', updatedAt: '1' };
  let writes = 0;
  const adapter = {
    read: async () => ({ records: [record], coverage: { complete: true } }),
    update: async ({ values }) => { writes++; record = { ...record, ...values, updatedAt: '2' }; throw new Error('Connection closed after commit'); }
  };
  const service = await setup(t, adapter);
  const source = await service.store.source({ sourceKey: 'human:1', text: 'Correct account name.' });
  const change = await service.propose({ accountId: 'buyer', object: 'company', id: 'buyer', values: { name: 'Corrected' }, expectedUpdatedAt: '1', sourceIds: [source.id], estimatedErrorCost: 'low', highlyConsequential: false, reason: 'Routine correction' });
  assert.equal(change.state, 'uncertain');
  const restarted = await new CoachService({ contextDir: service.store.directory, actor, adapter }).init();
  assert.equal((await restarted.resume())[0].state, 'applied');
  assert.equal(writes, 1);
});
test('full leader report includes executive account, teachable moment and cross-functional signal, unrelated role denied', async t => {
  const service = await setup(t);
  const source = await service.store.source({ sourceKey: 'meeting:1', text: 'Ilya reports the buyer requested time; possible downstream product signal.' });
  await service.store.update({ accountId: 'buyer', entries: [{ kind: 'signal', text: 'Possible product signal; executive duty ends with capture.', status: 'inference', sourceIds: [source.id] }] });
  await service.store.observation({ accountId: 'buyer', observation: 'No next commercial move was observed in available notes.', sourceIds: [source.id], executiveAccount: 'Ilya chose to preserve trust.', teachableMoment: 'Discuss purposeful follow-up.', uncertainty: 'Actual subsequent action not observed.' });
  await assert.rejects(() => service.store.report(), /Leader\/admin/);
  const leader = await new CoachService({ contextDir: service.store.directory, actor: { id: 'owner', role: 'leader' } }).init();
  const report = await leader.store.report();
  assert.equal(report.observations[0].executiveAccount, 'Ilya chose to preserve trust.');
  assert.equal(report.accounts[0].entries[0].kind, 'signal');
  assert.equal(report.performanceVerdict, null);
});
