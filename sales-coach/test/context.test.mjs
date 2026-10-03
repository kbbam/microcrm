import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CoachService } from '../service.mjs';
import { buildServer } from '../mcp.mjs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

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
  const resumed = (await restarted.resume())[0];
  assert.equal(resumed.state, 'applied');
  assert.equal(resumed.error, null);
  assert.equal(resumed.errorCode, null);
  assert.equal(writes, 1);
});
test('successful retry clears resolved setup failure without creating a duplicate projection', async t => {
  let enabled = false, writes = 0;
  const adapter = { create: async ({ values }) => {
    if (!enabled) throw Object.assign(new Error('Writes disabled'), { code: 'WRITES_DISABLED' });
    writes++;
    return { record: { ...values, updatedAt: '2026-09-30T00:00:00Z' } };
  } };
  const service = await setup(t, adapter);
  const source = await service.store.source({ sourceKey: 'synthetic-retry', text: 'Synthetic task fixture, no external effect.' });
  const blocked = await service.propose({ accountId: 'buyer', object: 'task', values: { title: 'Synthetic fixture' }, sourceIds: [source.id], estimatedErrorCost: 'low', highlyConsequential: false, reason: 'Synthetic internal projection' });
  assert.equal(blocked.state, 'blocked');
  assert.equal(blocked.errorCode, 'WRITES_DISABLED');
  enabled = true;
  const retried = await service.retry(blocked.id);
  assert.equal(retried.state, 'applied');
  assert.equal(retried.error, null);
  assert.equal(retried.errorCode, null);
  const repeated = await service.apply(retried);
  assert.equal(repeated.recordId, blocked.createId);
  const legacy = await service.apply({ ...retried, error: 'Resolved setup failure', errorCode: 'WRITES_DISABLED' });
  assert.equal(legacy.error, null);
  assert.equal(legacy.errorCode, null);
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

test('transcription and original file metadata remain linked through deferred retrieval and corrections', async t => {
  const service = await setup(t);
  const original = await service.store.source({ sourceKey: 'screenshot:phone-1', text: 'Trial: 12 units [unclear date]',
    representation: 'transcription', metadata: { filename: 'phone.png', mimeType: 'image/png', byteSize: 440487,
      sha256: '8ceb9ed759ab7abc94bbb184a112bfb21ffaf8455df1d99475cbd63b645f25d0', retrievalState: 'pending' } });
  const linked = await service.store.source({ sourceKey: original.sourceKey, text: original.text,
    metadata: { providerFileId: 'drive-123', retrievalState: 'verified' } });
  assert.equal(linked.id, original.id);
  assert.equal(linked.evidenceId, original.evidenceId);
  assert.equal(linked.representation, 'transcription');
  assert.equal(linked.metadata.filename, 'phone.png');
  assert.equal(linked.metadataHistory[0].metadata.retrievalState, 'pending');
  assert.equal(linked.metadataHistory[1].metadata.retrievalState, 'verified');
  assert.equal(linked.occurredAt, null, 'intake time must not invent event date');
  await service.store.source({ sourceKey: original.sourceKey, text: original.text, metadata: { retrievalState: 'verified' } });
  assert.equal((await service.store.sources([original.id]))[0].metadataHistory.length, 2);
  const correction = await service.store.source({ sourceKey: original.sourceKey, text: 'Trial: 12 units on October 3', representation: 'transcription' });
  assert.notEqual(correction.id, original.id);
  assert.equal(correction.evidenceId, original.evidenceId);
  const restarted = await new CoachService({ contextDir: service.store.directory, actor }).init();
  const retained = await restarted.store.sources([original.id, correction.id]);
  assert.equal(retained[0].text, original.text);
  assert.equal(retained[0].metadataHistory.length, 2);
  assert.equal(retained[1].text, correction.text);
  await assert.rejects(() => service.store.source({ sourceKey: original.sourceKey, text: original.text, representation: 'original-text' }), /representation cannot/);
  await assert.rejects(() => service.store.source({ sourceKey: original.sourceKey, text: original.text, evidenceId: 'different-evidence' }), /identity cannot/);
});

test('a shared thread supports passage-level many-to-many pursuits, account context and unresolved association history', async t => {
  const service = await setup(t);
  const source = await service.store.source({ sourceKey: 'email:shared-thread', text: 'Ship repeat order Friday. Trial needs 12 units. Trust matters for both.', metadata: { threadId: 'thread-1', participants: ['anna@example.com'] } });
  const entries = [
    { id: 'delivery', kind: 'commitment', text: 'Ship repeat order Friday.', status: 'fact', sourceIds: [source.id], association: { scope: 'opportunities', opportunityIds: ['repeat-order'] }, sourceRefs: [{ sourceId: source.id, messageId: 'message-1', passage: { start: 0, end: 24 } }] },
    { id: 'trial', kind: 'gap', text: 'Trial needs 12 units; uncertain whether a separate pursuit.', status: 'unknown', sourceIds: [source.id], association: { scope: 'provisional', candidateOpportunityIds: ['repeat-order'] }, sourceRefs: [{ sourceId: source.id, messageId: 'message-1', passage: { start: 25, end: 46 } }] },
    { id: 'trust', kind: 'social', text: 'Trust matters across the relationship.', status: 'human-account', sourceIds: [source.id], association: { scope: 'account', opportunityIds: [] } },
    { id: 'common-signal', kind: 'signal', text: 'Shared commercial signal.', status: 'inference', sourceIds: [source.id], association: { scope: 'opportunities', opportunityIds: ['repeat-order', 'trial-order'] } }
  ];
  await service.store.update({ accountId: 'northstar', entries });
  const human = await service.store.source({ sourceKey: 'executive:trial-confirmation', text: 'Yes, the trial is a separate opportunity.' });
  await service.store.update({ accountId: 'northstar', entries: [{ ...entries[1], kind: 'opportunity', status: 'human-account', sourceIds: [source.id, human.id], association: { scope: 'opportunities', opportunityIds: ['trial-order'] } }] });
  const restarted = await new CoachService({ contextDir: service.store.directory, actor }).init();
  const context = await restarted.context({ accountId: 'northstar' });
  const trialHistory = context.account.entries.filter(entry => entry.id === 'trial');
  assert.deepEqual(trialHistory.map(entry => entry.association.scope), ['provisional', 'opportunities']);
  assert.equal(trialHistory[1].revision, 2);
  assert.equal(context.account.entries.find(entry => entry.id === 'trust').association.scope, 'account');
  assert.deepEqual(context.account.entries.find(entry => entry.id === 'common-signal').association.opportunityIds, ['repeat-order', 'trial-order']);
  assert.equal(context.sources.find(item => item.id === source.id).text, source.text);
  assert.equal(Object.keys(context.account.crm).length, 0, 'provisional classification must not create CRM pursuits');
  for (const invalid of [
    { association: { scope: 'provisional', opportunityIds: ['repeat-order'] } },
    { association: { scope: 'opportunities', opportunityIds: [] } },
    { sourceRefs: [{ sourceId: human.id }] },
    { sourceRefs: [{ sourceId: source.id, passage: { start: 0, end: source.text.length + 1 } }] }
  ]) await assert.rejects(() => service.store.update({ accountId: 'northstar', entries: [{ ...entries[0], ...invalid }] }));
});

test('routine working context returns current interpretations and fresh CRM while full source/history remain retrievable', async t => {
  let version = 1;
  const adapter = { read: async ({ object }) => ({ records: object === 'company' ? [{ id: 'buyer', name: `Buyer ${version}`, updatedAt: String(version) }] : [], coverage: { scopeComplete: true, hasNextPage: false } }) };
  const service = await setup(t, adapter);
  const first = await service.captureContext({ accountId: 'buyer', title: 'Buyer', submittedSource: { sourceKey: 'chat:first', text: 'I promised Anna the sheet on Monday.' }, entries: [{ id: 'promise', kind: 'commitment', text: 'Send sheet Monday.', status: 'human-account' }] });
  assert.equal(first.originalFilePreserved, false);
  assert.equal(first.entries[0].revision, 1);
  await service.context({ accountId: 'buyer' });
  version = 2;
  const correction = await service.captureContext({ accountId: 'buyer', submittedSource: { sourceKey: 'chat:correction', text: 'Correction: it was Tuesday, not Monday.' }, entries: [{ id: 'promise', kind: 'commitment', text: 'Send sheet Tuesday.', status: 'human-account', sourceIds: [first.sourceId] }] });
  assert.equal(correction.entries[0].revision, 2);
  assert.deepEqual(correction.entries[0].sourceIds, [first.sourceId, correction.sourceId]);
  const brief = await service.context({ accountId: 'buyer', brief: true });
  assert.equal(brief.account.crm['company:buyer'].record.name, 'Buyer 2');
  assert.equal(brief.refreshed, true);
  assert.equal(brief.account.entries.length, 1);
  assert.equal(brief.account.entries[0].text, 'Send sheet Tuesday.');
  assert.equal(brief.account.entries[0].actor.id, actor.id);
  assert.equal(brief.history.retainedEntries, 4);
  assert(brief.sources.every(source => source.text === undefined));
  assert(brief.sources.find(source => source.id === correction.sourceId).actor.id === actor.id);
  const restarted = await new CoachService({ contextDir: service.store.directory, actor, adapter }).init();
  const full = await restarted.context({ accountId: 'buyer', refresh: false });
  assert.equal(full.account.entries.length, 4);
  assert.equal(full.sources.find(source => source.id === first.sourceId).text, 'I promised Anna the sheet on Monday.');
  assert.equal(full.sources.find(source => source.id === correction.sourceId).kind, 'executive-statement');
  assert.equal(full.sources.find(source => source.id === correction.sourceId).metadata.submittedBy, actor.id);
  assert.equal((await restarted.store.sources([correction.sourceId]))[0].representation, 'original-text');
  const repeated = await restarted.captureContext({ accountId: 'buyer', submittedSource: { sourceKey: 'chat:correction', text: 'Correction: it was Tuesday, not Monday.' }, entries: [{ id: 'promise', kind: 'commitment', text: 'Send sheet Tuesday.', status: 'human-account', sourceIds: [first.sourceId] }] });
  assert.equal(repeated.entries[0].revision, 2);
  assert.equal((await restarted.store.account('buyer')).entries.length, 4);
  await assert.rejects(restarted.captureContext({ accountId: 'buyer', entries: [{ kind: 'note', text: 'Unsourced fact', status: 'fact', sourceIds: [] }] }), /provenance/);
});

test('independent CRM refreshes run together, failures remain explicit and sequential persistence keeps every result', async t => {
  const started = [];
  let release;
  const allStarted = new Promise(resolve => { release = resolve; });
  const adapter = { read: async ({ object }) => {
    started.push(object);
    if (started.length === 5) release();
    await allStarted;
    if (object === 'person') throw new Error('Permission denied');
    return { records: [{ id: object === 'company' ? 'buyer' : `${object}-1`, updatedAt: '1' }], coverage: { scopeComplete: true, hasNextPage: false } };
  } };
  const service = await setup(t, adapter);
  const context = await service.context({ accountId: 'buyer', brief: true });
  assert.equal(started.length, 5);
  assert.equal(Object.keys(context.account.crm).length, 4);
  assert.equal(context.refreshed, false);
  assert.equal(context.coverage.find(item => item.object === 'person').error, 'Permission denied');
  assert.equal((await service.store.account('buyer')).entries.length, 4);
});

test('an empty page with additional records cannot claim a fresh account or erase prior CRM context', async t => {
  const adapter = { read: async ({ object }) => ({ records: [], coverage: { scopeComplete: true, hasNextPage: object === 'task' } }) };
  const service = await setup(t, adapter);
  await service.store.rememberCRM('buyer', 'task', { id: 'task-1', title: 'Known task', updatedAt: '1' });
  const context = await service.context({ accountId: 'buyer', brief: true });
  assert.equal(context.refreshed, false);
  assert.match(context.coverage.find(item => item.object === 'task' && item.error).error, /incomplete/);
  assert.equal(context.account.crm['task:task-1'].record.title, 'Known task');
  assert.equal(context.account.crm['task:task-1'].available, true, 'partial coverage cannot establish deletion');
});

test('cold retained account ID resolves by current company name and follows human renames without replacing explicit titles', async t => {
  const service = await setup(t);
  await service.store.rememberCRM('buyer', 'company', { id: 'buyer', name: 'Northstar Pharmacy', updatedAt: '1' });
  assert.deepEqual((await service.store.search('northstar')).map(account => account.title), ['Northstar Pharmacy']);
  assert.equal((await service.store.account('buyer')).title, 'buyer', 'display title must not rewrite retained history');
  assert.equal((await service.context({ accountId: 'buyer', refresh: false, brief: true })).account.title, 'Northstar Pharmacy');
  await service.store.rememberCRM('buyer', 'company', { id: 'buyer', name: 'Renamed Pharmacy', updatedAt: '2' });
  assert.equal((await service.store.search('Northstar')).length, 0);
  assert.equal((await service.store.search('Renamed'))[0].title, 'Renamed Pharmacy');
  const source = await service.store.source({ sourceKey: 'chat:title', text: 'Use my working label Pilot account.' });
  await service.store.update({ accountId: 'buyer', title: 'Pilot account', entries: [{ kind: 'note', text: 'Explicit working account label.', status: 'human-account', sourceIds: [source.id] }] });
  assert.equal((await service.store.search('Renamed'))[0].title, 'Pilot account');
  assert.equal((await service.store.search('Pilot'))[0].title, 'Pilot account');
  assert.equal((await service.context({ accountId: 'buyer', refresh: false, brief: true })).account.title, 'Pilot account');
});

test('typed capture derives stable provenance scoped to account and actor without inventing an event date', async t => {
  const service = await setup(t);
  const input = { accountId: 'buyer', submittedSource: { text: 'Anna prefers email.' }, entries: [{ id: 'preference', kind: 'social', text: 'Anna prefers email.', status: 'human-account' }] };
  const first = await service.captureContext(input);
  const restarted = new CoachService({ contextDir: service.store.directory, actor });
  assert.equal((await restarted.captureContext(input)).sourceId, first.sourceId);
  assert.equal((await restarted.store.account('buyer')).entries.length, 1);
  const source = (await restarted.store.sources([first.sourceId]))[0];
  assert.equal(source.text, input.submittedSource.text);
  assert.equal(source.occurredAt, null);
  const otherAccount = await restarted.captureContext({ ...input, accountId: 'other' });
  const leader = new CoachService({ contextDir: service.store.directory, actor: { id: 'leader@example.test', role: 'leader' } });
  const otherActor = await leader.captureContext(input);
  assert.notEqual(otherAccount.sourceId, first.sourceId);
  assert.notEqual(otherActor.sourceId, first.sourceId);
  assert.equal((await leader.store.sources([otherActor.sourceId]))[0].actor.id, 'leader@example.test');
});

test('targeted thread retrieval joins paginated messages and participants without broadening discovery scope', async t => {
  const calls = [];
  let release;
  const bothStarted = new Promise(resolve => { release = resolve; });
  let started = 0;
  const adapter = { read: async query => {
    calls.push(query);
    if (query.subjectContains) return { records: [{ id: 'one', messageThreadId: 'thread-a' }], coverage: { hasNextPage: false, scopeComplete: true } };
    if (query.offset === 0) { if (++started === 2) release(); await bothStarted; }
    assert.equal(query.messageThreadId, 'thread-a');
    if (query.object === 'messageParticipant') return { records: [{ id: 'person-1', messageId: 'one', role: 'FROM' }], coverage: { hasNextPage: false, scopeComplete: true } };
    return { records: [{ id: query.offset ? 'two' : 'one', messageThreadId: 'thread-a' }], coverage: { hasNextPage: !query.offset, scopeComplete: true } };
  } };
  const service = await setup(t, adapter);
  const result = await service.read({ object: 'message', subjectContains: 'specific subject', includeThreadContext: true });
  assert.deepEqual(result.records.map(record => record.id), ['one', 'two']);
  assert.equal(result.coverage.complete, true);
  assert.equal(result.threadContext.participants.records[0].role, 'FROM');
  assert.equal(result.threadContext.status, 'retrieved');
  assert.equal(calls.length, 4);
  assert(calls.every(query => !('includeThreadContext' in query)), 'host option is never passed as a raw provider filter');
});

test('ambiguous, partial or unauthorized discovery cannot expand into thread reads', async t => {
  for (const [records, coverage, expected] of [
    [[{ messageThreadId: 'a' }, { messageThreadId: 'b' }], { hasNextPage: false }, 'ambiguous'],
    [[{ messageThreadId: 'a' }], { hasNextPage: true }, 'discovery-incomplete'],
    [[{ messageThreadId: 'a' }], { scopeComplete: false }, 'unavailable'],
    [[], { hasNextPage: false }, 'unavailable'],
  ]) {
    let calls = 0;
    const service = await setup(t, { read: async () => { calls++; return { records, coverage }; } });
    assert.equal((await service.read({ object: 'message', subjectContains: 'same title', includeThreadContext: true })).threadContext.status, expected);
    assert.equal(calls, 1);
    await assert.rejects(service.read({ object: 'company', includeThreadContext: true }), /targeted message/);
    assert.equal(calls, 1);
  }
});

test('thread page cap and provider failure never claim a complete conversation', async t => {
  const service = await setup(t, { read: async ({ object, subjectContains }) => {
    if (subjectContains) return { records: [{ messageThreadId: 'a' }], coverage: { hasNextPage: false } };
    return { records: Array.from({ length: 100 }, (_, i) => ({ id: `${object}-${i}` })), coverage: { hasNextPage: true } };
  } });
  const capped = await service.read({ object: 'message', subjectContains: 'large thread', includeThreadContext: true });
  assert.equal(capped.records.length, 1000);
  assert.equal(capped.coverage.complete, false);
  assert.equal(capped.threadContext.participants.coverage.complete, false);
  service.adapter.read = async ({ subjectContains }) => {
    if (subjectContains) return { records: [{ messageThreadId: 'a' }], coverage: { hasNextPage: false } };
    throw new Error('Provider unavailable');
  };
  await assert.rejects(service.read({ object: 'message', subjectContains: 'thread', includeThreadContext: true }), /Provider unavailable/);
});

test('one MCP thread call retains exact message and participant records with reusable evidence IDs', async t => {
  const message = { id: 'message-a', messageThreadId: 'thread-a', text: 'A request, not an agreed promise.', receivedAt: '2026-10-01T10:00:00Z' };
  const participant = { id: 'participant-a', messageId: 'message-a', role: 'FROM', handle: 'synthetic@example.test', updatedAt: '2026-10-01T10:00:00Z' };
  const service = await setup(t, { read: async ({ object }) => ({ records: [object === 'message' ? message : participant], coverage: { hasNextPage: false, scopeComplete: true } }) });
  const server = buildServer(service);
  const client = new Client({ name: 'thread-intake-proof', version: '1' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  t.after(async () => { await client.close(); await server.close(); });
  const result = await client.callTool({ name: 'crm_read', arguments: { object: 'message', subjectContains: 'specific subject', includeThreadContext: true } });
  assert(!result.isError);
  const data = JSON.parse(result.content[0].text);
  const retainedMessage = (await service.store.sources([data.sources[0].sourceId]))[0];
  const retainedParticipant = (await service.store.sources([data.threadContext.participants.sources[0].sourceId]))[0];
  assert.deepEqual(JSON.parse(retainedMessage.text), message);
  assert.equal(retainedMessage.kind, 'email');
  assert.deepEqual(JSON.parse(retainedParticipant.text), participant);
  assert.equal(data.threadContext.participants.sources[0].recordId, participant.id);
});

test('incremental typed corrections preserve prior provenance and replaying old input cannot revert the latest interpretation', async t => {
  const service = await setup(t);
  const initial = { accountId: 'buyer', submittedSource: { text: 'Technical questions go to Anna; delivery to Marta.' }, entries: [{ id: 'routing', kind: 'social', text: 'Technical: Anna. Delivery: Marta.', status: 'human-account' }] };
  const first = await service.captureContext(initial);
  const correction = { accountId: 'buyer', submittedSource: { text: 'Use DOCX for technical summaries.' }, entries: [{ id: 'routing', kind: 'social', text: 'Technical: Anna, DOCX. Delivery: Marta.', status: 'human-account' }] };
  const second = await service.captureContext(correction);
  assert.deepEqual(second.entries[0].sourceIds, [first.sourceId, second.sourceId]);
  const replay = await service.captureContext(initial);
  assert.equal(replay.entries[0].revision, 1);
  const current = await service.context({ accountId: 'buyer', brief: true, refresh: false });
  assert.equal(current.account.entries[0].text, correction.entries[0].text);
  assert.equal(current.account.entries[0].revision, 2);
  assert.equal(current.history.retainedEntries, 2);
  assert.deepEqual((await service.captureContext(correction)).entries[0].sourceIds, second.entries[0].sourceIds);
});

test('retained account and source access revokes immediately across MCP reads, captures and pending proposals', async t => {
  const service = await setup(t);
  const first = await service.captureContext({ accountId: 'buyer', title: 'Private Buyer', submittedSource: { text: 'Private commitment.' }, entries: [{ id: 'promise', kind: 'commitment', text: 'Private commitment.', status: 'human-account' }] });
  const hold = await service.propose({ accountId: 'buyer', object: 'company', id: 'buyer', values: { name: 'Disputed name' }, sourceIds: [first.sourceId], estimatedErrorCost: 'high', highlyConsequential: true, reason: 'Disputed correction' });
  let allowed = true, unavailable = false, authorizations = 0;
  service.enforceRetainedScope = true;
  service.accountAuthorizer = async () => { authorizations++; if (unavailable) throw new Error('Provider offline'); return allowed; };
  assert.equal((await service.context({ accountId: 'buyer', refresh: false })).account.title, 'Private Buyer');
  assert.equal((await service.sources([first.sourceId]))[0].text, 'Private commitment.');
  allowed = false;
  const server = buildServer(service);
  const client = new Client({ name: 'retained-acl-proof', version: '1' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport); await client.connect(clientTransport);
  t.after(async () => { await client.close(); await server.close(); });
  const call = async (name, args = {}) => client.callTool({ name, arguments: args });
  for (const [name, args] of [
    ['get_account_context', { accountId: 'buyer', refresh: false }],
    ['get_source', { sourceId: first.sourceId }],
    ['update_account_context', { accountId: 'buyer', submittedSource: { text: 'Overwrite private commitment.' }, entries: [{ kind: 'note', text: 'Overwrite', status: 'human-account' }] }],
    ['record_observation', { accountId: 'buyer', observation: 'Secret report', sourceIds: [first.sourceId] }],
  ]) {
    const result = await call(name, args);
    assert.equal(result.isError, true, name);
    assert(!result.content[0].text.includes('Private commitment.'), name);
  }
  assert.deepEqual(JSON.parse((await call('search_accounts')).content[0].text), []);
  const status = JSON.parse((await call('coach_status')).content[0].text);
  assert.deepEqual(status.sources, []); assert.deepEqual(status.changes, []);
  await assert.rejects(service.confirm(hold.id), { code: 'OUT_OF_SCOPE' });
  await assert.rejects(service.propose({ ...hold, id: 'buyer' }), { code: 'OUT_OF_SCOPE' });
  assert.equal((await service.store.account('buyer')).entries.length, 1);
  assert.equal((await service.store.listSources()).length, 1);
  assert.equal((await service.store.observations()).length, 0);
  allowed = true; unavailable = true;
  await assert.rejects(service.context({ accountId: 'buyer', refresh: false }), { code: 'RETAINED_SCOPE_UNAVAILABLE' });
  await assert.rejects(service.searchAccounts(), { code: 'RETAINED_SCOPE_UNAVAILABLE' });
  await assert.rejects(service.sources([first.sourceId]), { code: 'RETAINED_SCOPE_UNAVAILABLE' });
  assert(authorizations > 10, 'Current scope is checked again on later operations');
});

test('source authorization covers historical links, actor-only evidence and provider sources without context links', async t => {
  const service = await setup(t);
  const shared = await service.store.source({ sourceKey: 'shared:1', text: 'Shared private history.' });
  await service.store.update({ accountId: 'allowed', entries: [{ kind: 'note', text: shared.text, status: 'human-account', sourceIds: [shared.id] }] });
  await service.store.update({ accountId: 'revoked', entries: [{ id: 'history', kind: 'note', text: shared.text, status: 'human-account', sourceIds: [shared.id] }] });
  await service.store.update({ accountId: 'revoked', entries: [{ id: 'history', kind: 'note', text: 'Latest interpretation cleared.', status: 'unknown', sourceIds: [] }] });
  const own = await service.store.source({ sourceKey: 'own:1', text: 'Unassociated executive notes.' });
  const foreign = await new CoachService({ contextDir: service.store.directory, actor: { id: 'another@example.test', role: 'executive' } }).init();
  const foreignSource = await foreign.store.source({ sourceKey: 'foreign:1', text: 'Another executive notes.' });
  const provider = await service.store.source({ sourceKey: 'twenty:message:message-a:1', text: '{"id":"message-a","text":"Original private message"}', kind: 'email' });
  let visible = true;
  service.enforceRetainedScope = true;
  service.accountAuthorizer = async id => id === 'allowed';
  service.adapter = { read: async () => ({ records: visible ? [{ id: 'message-a' }] : [], coverage: { scopeComplete: true, complete: true } }) };
  assert.equal((await service.sources([own.id]))[0].text, own.text);
  await assert.rejects(service.sources([shared.id]), { code: 'OUT_OF_SCOPE' });
  const scoped = await service.context({ accountId: 'allowed', refresh: false });
  assert.equal(scoped.account.entries.length, 0, 'Revoked shared evidence does not block unrelated current-authorized account context');
  assert.equal(scoped.coverage.find(item => item.object === 'retained-context').omittedEntries, 1);
  await assert.rejects(service.sources([foreignSource.id]), { code: 'OUT_OF_SCOPE' });
  assert.equal((await service.sources([provider.id]))[0].id, provider.id);
  visible = false;
  await assert.rejects(service.sources([provider.id]), { code: 'OUT_OF_SCOPE' });
  service.adapter.read = async () => ({ records: [{ id: 'message-a', text: null }], coverage: { scopeComplete: true, complete: true, contentAccessUnrestricted: false } });
  await assert.rejects(service.sources([provider.id]), { code: 'OUT_OF_SCOPE' });
  await assert.rejects(service.retainSource({ sourceKey: shared.sourceKey, text: shared.text, metadata: { accountId: 'allowed' } }), { code: 'OUT_OF_SCOPE' });
  await assert.rejects(service.retainSource({ sourceKey: provider.sourceKey, text: provider.text, kind: 'email' }), { code: 'OUT_OF_SCOPE' });
  assert.equal((await service.store.sources([shared.id]))[0].metadata.accountId, undefined, 'Denied duplicate cannot change metadata');
});

test('retained scope defaults to a fresh adapter company check and never falls back to cached context', async t => {
  const service = await setup(t);
  await service.captureContext({ accountId: 'buyer', submittedSource: { text: 'Retained context.' }, entries: [{ kind: 'note', text: 'Retained context.', status: 'human-account' }] });
  service.enforceRetainedScope = true;
  await assert.rejects(service.context({ accountId: 'buyer', refresh: false }), { code: 'RETAINED_SCOPE_UNAVAILABLE' });
  service.adapter = { read: async query => { assert.equal(query.companyId, 'buyer'); return { records: [], coverage: { complete: true } }; } };
  await assert.rejects(service.context({ accountId: 'buyer', refresh: false }), { code: 'OUT_OF_SCOPE' });
  service.adapter.read = async () => ({ records: [{ id: 'buyer' }], coverage: { complete: false } });
  await assert.rejects(service.context({ accountId: 'buyer', refresh: false }), { code: 'RETAINED_SCOPE_UNAVAILABLE' });
});

test('one tool operation checks shared account authority once, and the next tool sees revocation', async t => {
  const service = await setup(t);
  for (let i = 0; i < 8; i++) await service.captureContext({ accountId: 'buyer', submittedSource: { text: `Historical statement ${i}.` }, entries: [{ kind: 'note', text: `Statement ${i}.`, status: 'human-account' }] });
  let checks = 0, allowed = true;
  service.enforceRetainedScope = true;
  service.accountAuthorizer = async () => { checks++; return allowed; };
  assert.equal((await service.serial(() => service.context({ accountId: 'buyer', refresh: false }))).sources.length, 8);
  assert.equal(checks, 1, 'Source lineage does not cause redundant provider authority queries inside one tool');
  allowed = false;
  await assert.rejects(service.serial(() => service.context({ accountId: 'buyer', refresh: false })), { code: 'OUT_OF_SCOPE' });
  assert.equal(checks, 2, 'No authority result survives a tool operation');
});

test('source metadata reassociation retains earlier account authority even without account context entries', async t => {
  const service = await setup(t);
  const allowed = new Set(['alpha', 'beta', 'gamma']);
  service.enforceRetainedScope = true;
  service.accountAuthorizer = async accountId => allowed.has(accountId);
  const input = { sourceKey: 'chat:metadata-association', text: 'Alpha original terms; Gamma delivery constraints.' };
  const first = await service.retainSource({ ...input, metadata: { accountId: 'alpha', accountIds: ['gamma'] } });
  await service.retainSource({ ...input, metadata: { accountId: 'beta', accountIds: [] } });
  assert.equal((await service.store.search()).length, 0, 'This source has never been associated through a context entry');
  assert.equal((await service.sources([first.id]))[0].text, input.text);
  for (const revoked of ['alpha', 'gamma']) {
    allowed.delete(revoked);
    await assert.rejects(service.sources([first.id]), { code: 'OUT_OF_SCOPE' });
    assert.deepEqual(await service.listSources(), []);
    await assert.rejects(service.retainSource({ ...input, metadata: { accountId: 'beta' } }), { code: 'OUT_OF_SCOPE' });
    allowed.add(revoked);
  }
  const original = (await service.store.sources([first.id]))[0];
  assert.equal(original.text, input.text);
  assert.equal(original.metadataHistory.length, 2, 'Revocation protects the original and its attribution history without deleting them');
});

test('pending high-consequence genuinely new company stays visible in coach status while unassigned existing accounts remain denied', async t => {
  const service = await setup(t);
  const newCompany = 'e75fa427-7533-4fda-a7a0-2e2c11a71001';
  const existingUnassigned = 'e75fa427-7533-4fda-a7a0-2e2c11a71002';
  service.enforceRetainedScope = true;
  service.accountAuthorizer = async (accountId, { createCompany = false } = {}) => accountId === newCompany && createCompany;
  const source = await service.retainSource({ sourceKey: 'chat:new-company', text: 'Please create this new company; ownership needs confirmation.' });
  const proposal = { accountId: newCompany, object: 'company', values: { name: 'Synthetic New Company' }, sourceIds: [source.id], estimatedErrorCost: 'high', highlyConsequential: false, reason: 'Confirm this company creation.' };
  const pending = await service.propose(proposal);
  assert.equal(pending.state, 'awaiting-confirmation');
  await assert.rejects(service.propose({ ...proposal, accountId: existingUnassigned }), { code: 'OUT_OF_SCOPE' });
  const server = buildServer(service);
  const client = new Client({ name: 'pending-company-status-proof', version: '1' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport); await client.connect(clientTransport);
  t.after(async () => { await client.close(); await server.close(); });
  const response = await client.callTool({ name: 'coach_status', arguments: {} });
  assert.equal(response.isError, undefined);
  const status = JSON.parse(response.content[0].text);
  assert.equal(status.changes.length, 1);
  assert.equal(status.changes[0].id, pending.id);
  assert.equal(status.changes[0].state, 'awaiting-confirmation');
});
