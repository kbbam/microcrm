import test from 'node:test';
import assert from 'node:assert/strict';
import { TwentyAdapter } from '../twenty.mjs';
import { CoachService } from '../service.mjs';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AsyncLocalStorage } from 'node:async_hooks';

const id = number => `00000000-0000-4000-a000-${String(number).padStart(12, '0')}`;
const member = id(90), otherMember = id(91), company = id(1), adjacent = id(2), outside = id(3);
const ownOpportunity = id(4), otherOpportunity = id(5), ownChannel = id(80), otherChannel = id(81);
const rev = '2026-10-01T00:00:00.000Z';
const matches = (record, filter) => Object.entries(filter ?? {}).every(([field, value]) =>
  field === 'and' ? value.every(item => matches(record, item)) : field === 'or' ? value.some(item => matches(record, item)) :
    'eq' in value ? record[field] === value.eq : 'in' in value ? value.in.includes(record[field]) :
      'ilike' in value ? String(record[field] ?? '').toLowerCase().includes(value.ilike.slice(1, -1).toLowerCase()) : matches(record[field] ?? {}, value));
const containsEmptyFilterSet = value => value && typeof value === 'object' && Object.entries(value).some(([key, item]) => key === 'in' && Array.isArray(item) && !item.length || containsEmptyFilterSet(item));

function fixture(overrides = {}) {
  const records = {
    companies: [{ id: company, accountOwnerId: member, name: 'Assigned company', updatedAt: rev }, { id: adjacent, accountOwnerId: otherMember, name: 'Own opportunity company', updatedAt: rev }, { id: outside, accountOwnerId: otherMember, name: 'Outside company', updatedAt: rev }],
    opportunities: [{ id: ownOpportunity, companyId: adjacent, pointOfContactId: id(12), ownerId: member, stage: 'ENGAGED', updatedAt: rev }, { id: otherOpportunity, companyId: company, ownerId: otherMember, stage: 'ENGAGED', updatedAt: rev }],
    people: [{ id: id(11), companyId: company }, { id: id(12), companyId: adjacent }, { id: id(13), companyId: adjacent }],
    messages: [{ id: id(21), messageThreadId: id(31), subject: 'Assigned thread', text: 'Own account source' }, { id: id(22), messageThreadId: id(32), subject: 'Other mailbox', text: 'Other account source' }, { id: id(23), messageThreadId: id(33), subject: 'New prospect', text: 'Own unassigned source' }],
    messageThreadTargets: [{ id: id(41), messageThreadId: id(31), targetCompanyId: company }, { id: id(42), messageThreadId: id(32), targetCompanyId: company }],
    messageChannelMessageAssociations: [{ id: id(51), messageChannelId: ownChannel, messageId: id(21) }, { id: id(52), messageChannelId: otherChannel, messageId: id(22) }, { id: id(53), messageChannelId: ownChannel, messageId: id(23) }],
    messageParticipants: [{ id: id(61), messageId: id(21), handle: 'own@example.test' }, { id: id(62), messageId: id(22), handle: 'outside@example.test' }],
    calendarEvents: [{ id: id(24), title: 'Own event' }, { id: id(25), title: 'Other event' }],
    calendarChannelEventAssociations: [{ id: id(54), calendarChannelId: ownChannel, calendarEventId: id(24) }, { id: id(55), calendarChannelId: otherChannel, calendarEventId: id(25) }],
    calendarEventTargets: [{ id: id(43), calendarEventId: id(24), targetCompanyId: company }, { id: id(44), calendarEventId: id(25), targetCompanyId: company }],
    calendarEventParticipants: [{ id: id(63), calendarEventId: id(24), handle: 'own@example.test' }, { id: id(64), calendarEventId: id(25), handle: 'outside@example.test' }],
    tasks: [], taskTargets: [], notes: [], noteTargets: [],
  };
  const calls = [];
  const enrich = (plural, record) => plural === 'messageChannelMessageAssociations' || plural === 'messageParticipants' ? { ...record, message: records.messages.find(item => item.id === record.messageId) } : record;
  const adapter = new TwentyAdapter({ baseUrl: 'https://synthetic.example.invalid', apiKey: 'synthetic-only', scopeMode: 'assigned',
    assignment: { memberId: member, companyOwnerField: 'accountOwnerId', opportunityOwnerField: 'ownerId' }, messageChannelIds: [ownChannel], calendarChannelIds: [ownChannel], writeEnabled: true, externalEffectsReviewed: true,
    fetchImpl: async (_url, options) => {
      const { query, variables } = JSON.parse(options.body); calls.push({ query, variables });
      if (containsEmptyFilterSet(variables?.filter)) return { ok: true, json: async () => ({ errors: [{ message: 'Invalid filter value. Expected non-empty array.' }] }) };
      let data;
      if (query.includes('__type')) data = { stage: { enumValues: ['APPROACHING', 'ENGAGED', 'COMMERCIAL', 'WON', 'LOST'].map(name => ({ name })) }, nativeStage: { enumValues: ['NEW', 'SCREENING', 'MEETING', 'PROPOSAL', 'CUSTOMER'].map(name => ({ name })) }, query: { fields: [] }, mutation: { fields: [] } };
      else if (query.startsWith('query')) {
        const plural = query.match(/\{(\w+)\(filter:/)[1];
        const all = (records[plural] ?? []).filter(record => matches(enrich(plural, record), variables.filter));
        const page = all.slice(variables.offset, variables.offset + variables.limit);
        data = { [plural]: { edges: page.map(node => ({ node })), totalCount: all.length, pageInfo: { hasNextPage: variables.offset + variables.limit < all.length, endCursor: null } } };
      } else if (query.includes('CoachPatch')) {
        const plural = query.match(/\{update(\w+)\(/)[1];
        const key = plural[0].toLowerCase() + plural.slice(1);
        const changed = records[key].filter(record => matches(record, variables.filter));
        changed.forEach(record => Object.assign(record, variables.data, { updatedAt: '2026-10-01T01:00:00.000Z' }));
        data = { [`update${plural}`]: changed };
      } else {
        const type = query.match(/\{create(\w+)\(/)[1];
        const plural = { Company: 'companies', Opportunity: 'opportunities' }[type];
        const record = { ...variables.data, updatedAt: rev }; records[plural].push(record); data = { [`create${type}`]: record };
      }
      return { ok: true, json: async () => ({ data }) };
    }, ...overrides });
  return { adapter, records, calls };
}

test('assigned portfolio distinguishes account ownership, opportunity ownership and supporting contacts', async () => {
  const { adapter } = fixture();
  assert.deepEqual((await adapter.read({ object: 'company' })).records.map(record => record.id), [company, adjacent]);
  assert.deepEqual((await adapter.read({ object: 'opportunity' })).records.map(record => record.id), [ownOpportunity]);
  assert.deepEqual((await adapter.read({ object: 'person' })).records.map(record => record.id), [id(11), id(12)]);
  assert.equal((await adapter.read({ object: 'opportunity', id: otherOpportunity })).records.length, 0);
  await assert.rejects(adapter.authorizeAccount(outside), { code: 'OUT_OF_SCOPE' });
  assert.equal(await adapter.authorizeAccount(adjacent), true);
});

test('empty assignment and relation sets return authorized zero without invalid provider in filters', async () => {
  const { adapter, records, calls } = fixture();
  records.opportunities = [];
  records.people = [];
  for (const object of ['company', 'person', 'opportunity', 'note', 'task', 'messageThreadTarget', 'calendarEventTarget']) {
    const result = await adapter.read({ object, companyId: company });
    assert.equal(result.coverage.scopeComplete, true, object);
  }
  records.companies[0].accountOwnerId = otherMember;
  for (const object of ['company', 'person', 'opportunity', 'note', 'task', 'messageParticipant', 'calendarEventParticipant']) {
    const result = await adapter.read({ object });
    assert.equal(result.coverage.scopeComplete, true, object);
  }
  assert(calls.every(call => !containsEmptyFilterSet(call.variables?.filter)));
});

test('own connected sources are separate from assigned accounts and never include another mailbox', async () => {
  const { adapter } = fixture();
  assert.deepEqual((await adapter.read({ object: 'message' })).records.map(record => record.id), [id(21), id(23)]);
  assert.deepEqual((await adapter.read({ object: 'message', companyId: company })).records.map(record => record.id), [id(21)]);
  assert.equal((await adapter.read({ object: 'message', id: id(22) })).records.length, 0);
  assert.deepEqual((await adapter.read({ object: 'message', subjectContains: 'New prospect' })).records.map(record => record.id), [id(23)]);
  assert.deepEqual((await adapter.read({ object: 'messageParticipant' })).records.map(record => record.id), [id(61)]);
  assert.equal((await adapter.read({ object: 'messageParticipant', messageId: id(22) })).records.length, 0);
  assert.equal((await adapter.read({ object: 'messageParticipant', messageThreadId: id(32) })).records.length, 0);
  assert.deepEqual((await adapter.read({ object: 'calendarEvent' })).records.map(record => record.id), [id(24)]);
  assert.deepEqual((await adapter.read({ object: 'calendarEventParticipant' })).records.map(record => record.id), [id(63)]);
  await assert.rejects(adapter.read({ object: 'message', companyId: outside }), { code: 'OUT_OF_SCOPE' });
});

test('source channel discovery cannot turn incomplete ownership into complete coverage', async () => {
  const { adapter, records } = fixture();
  records.messageChannelMessageAssociations = Array.from({ length: 1001 }, (_, index) => ({ messageChannelId: ownChannel, messageId: id(1000 + index) }));
  records.messages = records.messageChannelMessageAssociations.map(record => ({ id: record.messageId, subject: 'Bulk', text: 'Owned source' }));
  const result = await adapter.read({ object: 'message' });
  assert.equal(result.coverage.complete, false);
  assert.equal(result.coverage.scopeComplete, false);
  assert.match(result.coverage.warning, /partial/);
  assert.equal((await adapter.read({ object: 'message', id: id(2000) })).records[0].id, id(2000), 'exact source authorization narrows discovery before paging');
});

test('creation injects trusted executive assignment and preserves retry identity', async () => {
  const { adapter, calls } = fixture();
  const input = { object: 'company', values: { id: id(70), name: 'New assigned company' } };
  assert.equal(await adapter.authorizeAccount(id(70), { createCompany: true }), true);
  await assert.rejects(adapter.authorizeAccount(outside, { createCompany: true }), { code: 'OUT_OF_SCOPE' });
  const first = await adapter.create(input);
  assert.equal(first.record.accountOwnerId, member);
  await adapter.create(input);
  assert.equal(calls.filter(call => call.query.includes('createCompany(')).length, 1);
  const opportunity = await adapter.create({ object: 'opportunity', values: { id: id(71), companyId: company, name: 'New assigned pursuit', stage: 'ENGAGED' } });
  assert.equal(opportunity.record.ownerId, member);
  await assert.rejects(adapter.create({ object: 'opportunity', values: { id: id(72), companyId: company, ownerId: otherMember, stage: 'ENGAGED' } }), { code: 'FORBIDDEN_FIELD' });
});

test('assignment changes take effect without reusing a cached portfolio', async () => {
  const { adapter, records } = fixture();
  assert.equal(await adapter.authorizeAccount(company), true);
  records.companies[0].accountOwnerId = otherMember;
  await assert.rejects(adapter.authorizeAccount(company), { code: 'OUT_OF_SCOPE' });
  assert.equal((await adapter.read({ object: 'company', id: company })).records.length, 0);
});

test('authorization portfolio may be shared only within one operation and creation invalidates it', async () => {
  const { adapter, calls, records } = fixture();
  const scope = new AsyncLocalStorage();
  adapter.authorizationScope = scope;
  await scope.run({ providers: new Map() }, async () => {
    await adapter.authorizeAccount(company);
    await adapter.read({ object: 'company', id: company });
    assert.equal(calls.filter(call => call.variables.filter?.accountOwnerId).length, 1);
    await adapter.create({ object: 'company', values: { id: id(76), name: 'Created within cached operation' } });
    assert.equal(await adapter.authorizeAccount(id(76)), true, 'successful creation clears the prior empty portfolio');
  });
  records.companies[0].accountOwnerId = otherMember;
  await scope.run({ providers: new Map() }, () => assert.rejects(adapter.authorizeAccount(company), { code: 'OUT_OF_SCOPE' }));
});

test('invalid trusted assignment configuration and missing source channel permissions fail closed', async () => {
  assert.throws(() => fixture({ assignment: undefined }), { code: 'INVALID_ASSIGNMENT' });
  assert.throws(() => fixture({ assignment: { memberId: member, companyOwnerField: 'accountOwnerId} injected', opportunityOwnerField: 'ownerId' } }), { code: 'INVALID_ASSIGNMENT' });
  const { adapter } = fixture({ messageChannelIds: [], calendarChannelIds: [] });
  assert.equal((await adapter.read({ object: 'message' })).records.length, 0);
  assert.equal((await adapter.read({ object: 'calendarEvent' })).records.length, 0);
});

test('trusted custom coach stages preserve native and unrelated business pipeline values', async () => {
  const { adapter, records, calls } = fixture({ stageField: 'coachStage', stageEnumName: 'OpportunityCoachStageEnum', nativeStageOnCreate: 'NEW' });
  Object.assign(records.opportunities[0], { stage: 'PROPOSAL', bamStage: 'NEGOTIATING', coachStage: 'COMMERCIAL' });
  const current = (await adapter.read({ object: 'opportunity', id: ownOpportunity })).records[0];
  assert.equal(current.stage, 'COMMERCIAL');
  assert.equal(current.providerStage, 'PROPOSAL');
  assert.equal(current.bamStage, 'NEGOTIATING');
  await adapter.update({ object: 'opportunity', id: ownOpportunity, values: { stage: 'WON' }, expectedUpdatedAt: rev });
  assert.equal(records.opportunities[0].coachStage, 'WON');
  assert.equal(records.opportunities[0].stage, 'PROPOSAL');
  assert.equal(records.opportunities[0].bamStage, 'NEGOTIATING');
  const patch = calls.find(call => call.query.includes('CoachPatch'));
  assert.deepEqual(patch.variables.data, { coachStage: 'WON' });
  const created = { object: 'opportunity', values: { id: id(73), companyId: company, name: 'Coach pursuit', stage: 'ENGAGED' } };
  const result = await adapter.create(created);
  assert.equal(result.record.stage, 'ENGAGED');
  assert.equal(result.record.providerStage, 'NEW');
  await adapter.create(created);
  assert.equal(records.opportunities.filter(record => record.id === id(73)).length, 1);
  assert(calls.some(call => call.query.includes('__type(name: "OpportunityCoachStageEnum")')), 'configured enum is queried without changing native metadata');
  await assert.rejects(adapter.update({ object: 'opportunity', id: ownOpportunity, values: { coachStage: 'LOST' }, expectedUpdatedAt: rev }), { code: 'FORBIDDEN_FIELD' });
});

test('custom stage configuration never guesses a missing field enum or native creation stage', async () => {
  assert.throws(() => fixture({ stageField: 'coachStage' }), { code: 'INVALID_STAGE_CONFIG' });
  const { adapter, calls } = fixture({ stageField: 'coachStage', stageEnumName: 'OpportunityCoachStageEnum', nativeStageOnCreate: 'UNVERIFIED' });
  await assert.rejects(adapter.create({ object: 'opportunity', values: { id: id(74), companyId: company, stage: 'ENGAGED' } }), { code: 'PIPELINE_SETUP_REQUIRED' });
  assert.equal(calls.filter(call => call.query.startsWith('mutation')).length, 0);
});

test('real adapter authority prevents retained admin context and another mailbox from bypassing scope', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'coach-production-boundary-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const { adapter } = fixture();
  const admin = await new CoachService({ contextDir: directory, actor: { id: 'admin@example.test', role: 'admin' } }).init();
  const source = await admin.store.source({ sourceKey: 'admin-private', text: 'Synthetic outside account detail.' });
  await admin.store.update({ accountId: outside, title: 'Outside company', entries: [{ kind: 'note', text: source.text, status: 'fact', sourceIds: [source.id] }] });
  const otherMail = await admin.store.source({ sourceKey: `twenty:message:${id(22)}:1`, text: 'Synthetic other mailbox original.', kind: 'email' });
  const exec = await new CoachService({ contextDir: directory, actor: { id: 'exec@example.test', role: 'executive' }, adapter, enforceRetainedScope: true, authorizeAccount: (accountId, options) => adapter.authorizeAccount(accountId, options) }).init();
  assert.deepEqual(await exec.searchAccounts(), []);
  await assert.rejects(exec.context({ accountId: outside, refresh: false }), { code: 'OUT_OF_SCOPE' });
  await assert.rejects(exec.sources([source.id]), { code: 'OUT_OF_SCOPE' });
  await assert.rejects(exec.sources([otherMail.id]), { code: 'OUT_OF_SCOPE' });
  const ownMail = await exec.retainSource({ sourceKey: `twenty:message:${id(23)}:1`, text: 'Synthetic own new-prospect source.', kind: 'email' }, { provider: true });
  assert.equal((await exec.sources([ownMail.id]))[0].text, ownMail.text);
});

test('guarded production company creation uses an unassociated source then establishes authorized durable context', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'coach-production-creation-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const { adapter } = fixture();
  const exec = await new CoachService({ contextDir: directory, actor: { id: 'exec@example.test', role: 'executive' }, adapter, enforceRetainedScope: true, authorizeAccount: (accountId, options) => adapter.authorizeAccount(accountId, options) }).init();
  const source = await exec.retainSource({ sourceKey: 'chat:new-prospect', text: 'Create a company called New prospect for me.' });
  const result = await exec.propose({ accountId: id(75), object: 'company', values: { name: 'New prospect' }, sourceIds: [source.id], reason: 'Executive requested an ordinary new assigned CRM company.', estimatedErrorCost: 'low', highlyConsequential: false });
  assert.equal(result.state, 'applied');
  const context = await exec.captureContext({ accountId: id(75), submittedSource: { text: 'New prospect prefers email.' }, entries: [{ kind: 'social', text: 'Email preferred.', status: 'human-account' }] });
  assert.equal(context.sourceRetained, true);
  assert.equal((await exec.context({ accountId: id(75), refresh: false, brief: true })).account.title, 'New prospect');
});

test('reassigned opportunity and restricted latest correction are omitted while authorized account context remains usable', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'coach-production-reassignment-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const { adapter, records } = fixture();
  records.opportunities[0].companyId = company;
  const exec = await new CoachService({ contextDir: directory, actor: { id: 'exec@example.test', role: 'executive' }, adapter, enforceRetainedScope: true, authorizeAccount: (accountId, options) => adapter.authorizeAccount(accountId, options) }).init();
  const first = await exec.captureContext({ accountId: company, submittedSource: { text: 'The customer prefers email.' }, entries: [{ id: 'preference', kind: 'social', text: 'Email preferred.', status: 'human-account' }, { id: 'durable', kind: 'note', text: 'Account remains assigned to executive.', status: 'human-account' }] });
  await exec.store.rememberCRM(company, 'company', records.companies[0]);
  await exec.store.rememberCRM(company, 'opportunity', records.opportunities[0]);
  await exec.store.update({ accountId: company, entries: [{ id: 'opportunity-detail', kind: 'opportunity', text: 'Former opportunity-specific details.', status: 'human-account', sourceIds: [first.sourceId], association: { scope: 'opportunities', opportunityIds: [ownOpportunity] } }] });
  const admin = await new CoachService({ contextDir: directory, actor: { id: 'admin@example.test', role: 'admin' } }).init();
  const withheld = await admin.store.source({ sourceKey: `twenty:message:${id(22)}:1`, text: 'Other mailbox private correction.', kind: 'email' });
  await admin.store.update({ accountId: company, entries: [{ id: 'preference', kind: 'social', text: 'Other mailbox private correction.', status: 'fact', sourceIds: [withheld.id] }] });
  const persisted = await admin.store.account(company);
  records.opportunities[0].ownerId = otherMember;
  const context = await exec.serial(() => exec.context({ accountId: company, refresh: false, brief: true }));
  assert(context.account.entries.some(entry => entry.id === 'durable'));
  assert(!context.account.entries.some(entry => entry.id === 'preference'), 'An inaccessible latest correction cannot expose an older revision as current');
  assert(!context.account.entries.some(entry => entry.id === 'opportunity-detail'));
  assert(!context.account.crm[`opportunity:${ownOpportunity}`]);
  assert(context.account.crm[`company:${company}`]);
  assert(!JSON.stringify(context).includes('Other mailbox private correction'));
  assert(!JSON.stringify(context).includes('Former opportunity-specific details'));
  const omission = context.coverage.find(item => item.object === 'retained-context');
  assert(omission.omittedEntries >= 3);
  assert.equal(omission.omittedCRMRecords, 1);
  assert.equal((await admin.store.account(company)).entries.length, persisted.entries.length, 'Filtering never deletes original history');
  await assert.rejects(exec.sources([withheld.id]), { code: 'OUT_OF_SCOPE' });
});

test('source connection gap withholds communication-derived context while assigned CRM and chat remain usable', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'coach-production-source-gap-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const { adapter, records } = fixture();
  adapter.sourceOwnershipRequired = true;
  const exec = await new CoachService({ contextDir: directory, actor: { id: 'exec@example.test', role: 'executive' }, adapter, enforceRetainedScope: true, authorizeAccount: (accountId, options) => adapter.authorizeAccount(accountId, options) }).init();
  await exec.captureContext({ accountId: company, submittedSource: { text: 'User prefers email.' }, entries: [{ kind: 'note', text: 'Authorized direct chat context.', status: 'human-account' }] });
  await exec.store.rememberCRM(company, 'company', records.companies[0]);
  const email = await exec.store.source({ sourceKey: `twenty:message:${id(23)}:1`, text: 'Previously received sensitive synthetic email.', kind: 'email' });
  await exec.store.update({ accountId: company, entries: [{ id: 'email-fact', kind: 'note', text: 'Previously derived email interpretation.', status: 'fact', sourceIds: [email.id] }] });
  const context = await exec.serial(() => exec.context({ accountId: company, refresh: true, brief: true }));
  assert(context.account.entries.some(entry => entry.text === 'Authorized direct chat context.'));
  assert(context.account.crm[`company:${company}`]);
  assert.equal(context.refreshed, true);
  assert(!JSON.stringify(context).includes('Previously received sensitive'));
  assert(!JSON.stringify(context).includes('Previously derived email'));
  const gap = context.coverage.find(item => item.object === 'retained-source-authorization');
  assert.equal(gap.unavailableSourceChecks, 1);
  assert.equal(gap.issues[0].code, 'SOURCE_CONNECTION_REQUIRED');
  await assert.rejects(exec.sources([email.id]), { code: 'RETAINED_SCOPE_UNAVAILABLE' });
});
