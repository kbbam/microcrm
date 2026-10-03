import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { TwentyAdapter } from '../twenty.mjs';
import { CoachService } from '../service.mjs';
import { buildServer } from '../mcp.mjs';
import { reviewProposal, decideProposal } from '../confirmation.mjs';

const id = n => `00000000-0000-4000-a000-${String(n).padStart(12, '0')}`;
const at = '2026-10-03T00:00:00.000Z';
const matches = (row, filter) => Object.entries(filter ?? {}).every(([key, value]) => key === 'and' ? value.every(f => matches(row, f)) : key === 'or' ? value.some(f => matches(row, f)) : 'eq' in value ? row[key] === value.eq : 'in' in value ? value.in.includes(row[key]) : 'is' in value ? row[key] == null : 'ilike' in value ? String(row[key] ?? '').toLowerCase() === value.ilike.toLowerCase() : matches(row[key] ?? {}, value));
function provider() {
  let revision = 0;
  const records = {
    companies: [{ id: id(1), name: 'QA pooled', accountOwnerId: null, updatedAt: at }, { id: id(2), name: 'QA outside', accountOwnerId: id(92), updatedAt: at }],
    opportunities: [{ id: id(3), name: 'QA available pursuit', companyId: id(1), ownerId: null, stage: 'ENGAGED', updatedAt: at }, { id: id(4), name: 'QA excluded pursuit, same company', companyId: id(1), ownerId: null, updatedAt: at }, { id: id(5), name: 'QA assigned pursuit', companyId: id(2), ownerId: id(90), updatedAt: at }],
    tasks: [{ id: id(6), title: 'QA independent task', assigneeId: id(90), status: 'TODO', updatedAt: at }],
    taskTargets: [{ id: id(7), taskId: id(6), targetCompanyId: id(2) }],
    initiatives: [{ id: id(8), name: 'QA pilot programme', status: 'ACTIVE', updatedAt: at }, { id: id(9), name: 'Existing Berlin programme', status: 'ACTIVE', updatedAt: at }],
    initiativeAccounts: [{ id: id(10), name: 'QA programme work', companyId: id(1), initiativeId: id(8), status: 'INCLUDED', assigneeId: null, updatedAt: at }, { id: id(11), name: 'Not pilot', companyId: id(2), initiativeId: id(9), status: 'INCLUDED', assigneeId: null, updatedAt: at }],
    workspaceMembers: [90,91,92].map(n => ({ id: id(n), name: { firstName: `QA ${n}`, lastName: 'Member' }, userEmail: `qa${n}@example.test`, updatedAt: at })),
    people: [], notes: [], noteTargets: [], messages: [], messageChannelMessageAssociations: [], calendarEvents: []
  };
  let throwAfterMutation = false;
  const mutations = [];
  const fetchImpl = async (_url, options) => {
    const { query, variables } = JSON.parse(options.body);
    let data;
    if (query.includes('__type')) data = { stage: { enumValues: ['APPROACHING', 'ENGAGED', 'COMMERCIAL', 'WON', 'LOST'].map(name => ({ name })) }, nativeStage: { enumValues: [] }, query: { fields: [] }, mutation: { fields: [] } };
    else if (query.startsWith('query')) {
      const plural = query.match(/\{(\w+)\(filter:/)[1];
      const rows = (records[plural] ?? []).filter(row => matches(row, variables.filter));
      data = { [plural]: { edges: rows.slice(variables.offset, variables.offset + variables.limit).map(node => ({ node })), totalCount: rows.length, pageInfo: { hasNextPage: variables.offset + variables.limit < rows.length } } };
    } else {
      const operation = query.match(/\{(update\w+|create\w+)\(/)[1];
      if (operation.startsWith('update')) {
        const plural = operation.slice(6), key = plural[0].toLowerCase() + plural.slice(1);
        const rows = records[key].filter(row => matches(row, variables.filter));
        rows.forEach(row => Object.assign(row, variables.data, { updatedAt: new Date(Date.parse(at) + ++revision * 1000).toISOString() }));
        data = { [operation]: structuredClone(rows) };
      } else {
        const plural = { Company: 'companies', Opportunity: 'opportunities', Task: 'tasks', TaskTarget: 'taskTargets' }[operation.slice(6)];
        const row = { ...variables.data, updatedAt: new Date(Date.parse(at) + ++revision * 1000).toISOString() }; records[plural].push(row); data = { [operation]: row };
      }
      mutations.push({ operation, variables });
      if (throwAfterMutation) { throwAfterMutation = false; throw new Error('Response lost after durable provider mutation'); }
    }
    return { ok: true, json: async () => ({ data: structuredClone(data) }) };
  };
  return { records, fetchImpl, mutations, loseNextResponse() { throwAfterMutation = true; } };
}
async function actor(t, p, member = 90, role = 'executive') {
  const dir = await mkdtemp(join(tmpdir(), 'coach-allocation-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const identity = { id: `qa${member}@example.test`, role };
  const adapter = new TwentyAdapter({ baseUrl: 'https://isolated.invalid', apiKey: 'synthetic-only', scopeMode: role === 'executive' ? 'assigned' : 'workspace', assignment: { memberId: id(member), companyOwnerField: 'accountOwnerId', opportunityOwnerField: 'ownerId' }, actor: identity, writeEnabled: true, externalEffectsReviewed: true,
    workAllocation: { enabled: true, memberId: id(member), initiativeIds: [id(8)], eligibleMemberIds: [id(90),id(91),id(92)], opportunityPools: [{ initiativeId: id(8), opportunityIds: [id(3)] }] }, fetchImpl: p.fetchImpl });
  const service = await new CoachService({ contextDir: dir, actor: identity, adapter, enforceRetainedScope: true, authorizeAccount: (accountId, options) => adapter.authorizeAccount(accountId, options) }).init();
  const connect = async () => {
    const client = new Client({ name: 'allocation-acceptance', version: '1' }), server = buildServer(service, { contextKey: identity.id, reviewBaseUrl: 'https://isolated.invalid' });
    const [c,s] = InMemoryTransport.createLinkedPair(); await Promise.all([client.connect(c),server.connect(s)]); t.after(() => client.close());
    return async (name, args = {}) => { const result = await client.callTool({ name, arguments: args }); return { ...JSON.parse(result.content[0].text), isError: !!result.isError }; };
  };
  const call = await connect();
  const source = await call('retain_source', { sourceKey: 'qa:work-allocation', text: 'Claim or transfer this specific QA responsibility. Preserve unrelated owners and existing history.' });
  const assign = (object, recordId, accountId, recipient, version = at, risk = 'low') => call('crm_assign_work', { object, id: recordId, accountId, recipientMemberId: recipient, expectedUpdatedAt: version, sourceIds: [source.id], estimatedErrorCost: risk, highlyConsequential: false, reason: 'Explicit isolated responsibility instruction' });
  return { service, adapter, call, assign, connect, source };
}

test('shared discovery is programme-specific, preserves independent availability, and grants no other mailbox', async t => {
  const p = provider(), a = await actor(t,p);
  const list = await a.call('crm_work_list');
  assert.deepEqual(list.work.map(row => row.id).sort(), [id(1),id(3),id(10)].sort());
  assert.equal((await a.call('crm_read', { object: 'opportunity', id: id(4) })).records.length,0);
  assert.equal((await a.call('crm_work_list', { mode: 'team' })).code,'SUPERVISOR_REQUIRED');
  assert.equal((await a.call('crm_read', { object: 'message' })).records.length,0);
  const denied = await a.call('crm_propose_change', { object:'company', id:id(1), accountId:id(1), values:{ name:'Change without claim' }, expectedUpdatedAt:at, sourceIds:[a.source.id], estimatedErrorCost:'low', highlyConsequential:false, reason:'Test forbidden unclaimed edit' });
  assert.equal(denied.errorCode,'OUT_OF_SCOPE');
});
test('two MCP actors race on one pursuit; only one claims it and no other responsibility changes', async t => {
  const p = provider(), a = await actor(t,p), b = await actor(t,p,91);
  const results = await Promise.all([a.assign('opportunity',id(3),id(1),id(90)), b.assign('opportunity',id(3),id(1),id(91))]);
  assert.equal(results.filter(row => row.state === 'applied').length,1);
  assert.equal(p.records.opportunities[0].ownerId,results.find(row => row.state === 'applied').assignment.toMemberId);
  assert.equal(p.records.companies[0].accountOwnerId,null);
  assert.equal(p.records.initiativeAccounts[0].assigneeId,null);
  assert.equal(p.records.tasks[0].assigneeId,id(90));
  assert.equal((await a.call('crm_work_list')).work.some(row => row.id === id(3)),false);
});
test('own handoff revokes operational access immediately, exact retry returns history, recipient gains access', async t => {
  const p = provider(), a = await actor(t,p), b = await actor(t,p,91);
  const transfer = await a.assign('opportunity',id(5),id(2),id(91));
  assert.equal(transfer.state,'applied'); assert.equal(transfer.assignmentReceipt.unrelatedResponsibilitiesChanged,false);
  // Independent task still grants this account to the source executive.
  assert.equal((await a.call('crm_read',{object:'opportunity',id:id(5)})).records.length,0);
  assert.equal((await b.call('crm_read',{object:'opportunity',id:id(5)})).records.length,1);
  const taskTransfer = await a.assign('task',id(6),id(2),id(91));
  assert.equal(taskTransfer.state,'applied');
  assert.equal((await a.call('get_account_context',{accountId:id(2)})).code,'OUT_OF_SCOPE');
  assert.equal((await a.assign('task',id(6),id(2),id(91))).id,taskTransfer.id);
  assert.equal((await b.call('crm_read',{object:'task',companyId:id(2)})).records.length,1);
  assert.equal((await a.service.store.changes()).length,2);
});
test('supervisor transfers any CRM responsibility; executive cannot take assigned work or allocate free work to others', async t => {
  const p = provider(), a = await actor(t,p,91), lead = await actor(t,p,92,'admin');
  assert.equal((await a.assign('opportunity',id(5),id(2),id(91))).code,'SUPERVISOR_REQUIRED');
  assert.equal((await a.assign('opportunity',id(3),id(1),id(90))).code,'SELF_CLAIM_ONLY');
  const result = await lead.assign('opportunity',id(5),id(2),id(91));
  assert.equal(result.state,'applied'); assert.equal(p.records.companies[1].accountOwnerId,id(92));
  assert.equal((await lead.assign('initiativeAccount',id(10),id(1),id(91))).state,'applied');
  assert.equal((await lead.assign('company',id(1),id(1),id(91))).state,'applied');
  assert.equal(p.records.opportunities[0].ownerId,null);
});
test('consequential handoff holds for human review, rejects stale review, retains review after losing account access', async t => {
  const p = provider(), a = await actor(t,p);
  p.records.tasks[0].assigneeId = id(92); // Opportunity is now the sole grant.
  const proposal = await a.assign('opportunity',id(5),id(2),id(91),at,'high');
  assert.equal(proposal.state,'awaiting-confirmation'); assert(proposal.reviewUrl);
  assert.equal((await a.assign('opportunity',id(5),id(2),id(91),at,'low')).state,'awaiting-confirmation');
  const review = await a.service.serial(() => reviewProposal(a.service, proposal.id));
  await assert.rejects(a.service.serial(() => decideProposal(a.service,{id:proposal.id,digest:'stale',decision:'approve'})),{status:409});
  const approved = await a.service.serial(() => decideProposal(a.service,{id:proposal.id,digest:review.digest,decision:'approve'}));
  assert.equal(approved.state,'applied');
  assert.equal((await a.service.serial(() => reviewProposal(a.service,proposal.id))).change.state,'applied');
  assert.equal((await a.call('crm_read',{object:'opportunity',id:id(5)})).records.length,0);
});
test('lost response reconciles a handed-off non-pool record without reopening private context or mutating twice', async t => {
  const p = provider(), a = await actor(t,p);
  p.records.tasks[0].assigneeId=id(92);
  p.loseNextResponse();
  const uncertain = await a.assign('opportunity',id(5),id(2),id(91));
  assert.equal(uncertain.state,'uncertain');
  const before = p.mutations.length;
  const resumed = await a.service.serial(() => a.service.resume());
  assert.equal(resumed[0].state,'applied'); assert.equal(resumed[0].reconciled,true);
  assert.equal(p.mutations.length,before);
  assert.equal((await a.call('get_account_context',{accountId:id(2)})).code,'OUT_OF_SCOPE');
});
test('native ownership corrections affect next MCP operation and task account filtering stays exact', async t => {
  const p = provider(), a = await actor(t,p);
  assert.equal((await a.call('crm_read',{object:'task',companyId:id(1)})).records.length,0);
  assert.equal((await a.call('crm_read',{object:'task',companyId:id(2)})).records.length,1);
  p.records.opportunities[2].ownerId=id(91); p.records.tasks[0].assigneeId=id(91);
  assert.equal((await a.call('crm_read',{object:'company',id:id(2)})).records.length,0);
  assert.equal((await a.call('get_account_context',{accountId:id(2)})).code,'OUT_OF_SCOPE');
});
test('new account, pursuit and task are assigned immediately; duplicate identity and generic owner writes are refused', async t => {
  const p = provider(), a = await actor(t,p);
  const propose = args => a.call('crm_propose_change',{ sourceIds:[a.source.id], estimatedErrorCost:'low', highlyConsequential:false, reason:'Create authorized new QA work', ...args });
  assert.equal((await propose({object:'company',accountId:id(20),values:{name:'QA brand new'}})).state,'applied');
  assert.equal(p.records.companies.find(row=>row.id===id(20)).accountOwnerId,id(90));
  assert.equal((await propose({object:'opportunity',accountId:id(20),values:{name:'QA new pursuit',companyId:id(20),stage:'ENGAGED'}})).state,'applied');
  assert.equal(p.records.opportunities.at(-1).ownerId,id(90));
  assert.equal((await propose({object:'task',accountId:id(20),values:{title:'QA next action',companyId:id(20)}})).state,'applied');
  assert.equal(p.records.tasks.at(-1).assigneeId,id(90));
  assert.equal((await propose({object:'company',accountId:id(21),values:{name:'QA brand new'}})).errorCode,'ACCOUNT_MATCH_REQUIRED');
  assert.equal((await propose({object:'opportunity',accountId:id(20),id:p.records.opportunities.at(-1).id,values:{ownerId:id(91)},expectedUpdatedAt:p.records.opportunities.at(-1).updatedAt})).errorCode,'FORBIDDEN_FIELD');
});

test('a task spanning several accounts names the whole scope and requires review even when requested as routine', async t => {
  const p = provider(), a = await actor(t,p);
  p.records.taskTargets.push({id:id(25),taskId:id(6),targetCompanyId:id(1)});
  const list=await a.call('crm_work_list',{mode:'mine'});
  assert.deepEqual(list.work.find(row=>row.id===id(6)).accountIds.sort(),[id(1),id(2)]);
  const change=await a.assign('task',id(6),id(2),id(91));
  assert.equal(change.state,'awaiting-confirmation'); assert.equal(change.highlyConsequential,true);
  assert.match(change.reason,/links 2 accounts/);assert.equal(p.mutations.length,0);
});
test('incomplete work discovery and withdrawn programme eligibility fail closed', async t => {
  const p=provider(),a=await actor(t,p);
  p.records.initiatives[0].status='PAUSED';
  assert.equal((await a.call('crm_work_list')).work.length,0);
  assert.equal((await a.assign('opportunity',id(3),id(1),id(90))).code,'OUT_OF_SCOPE');
  const original=a.adapter.collect.bind(a.adapter);a.adapter.collect=async(object,...rest)=>object==='initiative'?{records:[],complete:false}:original(object,...rest);
  assert.equal((await a.call('crm_work_list')).code,'SCOPE_INCOMPLETE');assert.equal(p.mutations.length,0);
});

test('shared pool visibility never adds another member’s mailbox or private original source', async t => {
  const p=provider(),a=await actor(t,p),b=await actor(t,p,91);
  a.adapter.messageChannelIds=[id(80)];
  p.records.messages=[{id:id(30),messageThreadId:id(32),subject:'QA own mailbox',text:'Own original',updatedAt:at},{id:id(31),messageThreadId:id(33),subject:'QA other mailbox',text:'Other private original',updatedAt:at}];
  p.records.messageChannelMessageAssociations=[{id:id(34),messageChannelId:id(80),messageId:id(30)},{id:id(35),messageChannelId:id(81),messageId:id(31)}];
  assert.deepEqual((await a.call('crm_read',{object:'message'})).records.map(row=>row.id),[id(30)]);
  assert.equal((await a.call('crm_read',{object:'message',id:id(31)})).records.length,0);
  const privateSource=await b.call('retain_source',{sourceKey:'qa:private-original',text:'Private source belonging to another executive'});
  const inaccessible=await a.call('get_source',{sourceId:privateSource.id});
  assert.equal(inaccessible.isError,true);assert(!JSON.stringify(inaccessible).includes('Private source belonging'));
});
