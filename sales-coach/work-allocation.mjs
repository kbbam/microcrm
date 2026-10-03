const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };
const ids = values => [...new Set(values.filter(Boolean))];
const checkedIds = values => {
  if (!Array.isArray(values) || values.some(value => !UUID.test(value))) fail('INVALID_ALLOCATION_CONFIG', 'Work allocation requires verified UUID identifiers.');
  return ids(values);
};
const fields = { company: 'accountOwnerId', opportunity: 'ownerId', task: 'assigneeId', initiativeAccount: 'assigneeId' };
const names = { company: 'account relationship', opportunity: 'opportunity', task: 'task', initiativeAccount: 'sales programme responsibility' };

// Authority comes from the authenticated host and trusted deployment scope.
// A shared record is discoverable; it is not permission to take its ownership.
export class WorkAllocation {
  constructor(adapter, config, actor) {
    if (!actor || !['executive', 'leader', 'admin'].includes(actor.role) || !UUID.test(config.memberId)) fail('INVALID_ALLOCATION_CONFIG', 'Authenticated actor and verified workspace member are required.');
    if (actor.role === 'executive' && adapter.scopeMode !== 'assigned') fail('INVALID_ALLOCATION_CONFIG', 'Executive allocation requires assigned scope.');
    this.adapter = adapter;
    this.actor = actor;
    this.memberId = config.memberId;
    this.initiativeIds = checkedIds(config.initiativeIds ?? []);
    this.eligibleMemberIds = checkedIds(config.eligibleMemberIds ?? []);
    this.opportunityPools = (config.opportunityPools ?? []).map(pool => {
      if (!this.initiativeIds.includes(pool.initiativeId)) fail('INVALID_ALLOCATION_CONFIG', 'Opportunity work pools must belong to an authorized initiative.');
      return { initiativeId: pool.initiativeId, opportunityIds: checkedIds(pool.opportunityIds) };
    });
  }
  get supervisor() { return ['leader', 'admin'].includes(this.actor.role); }
  async complete(object, filter) {
    const result = await this.adapter.collect(object, filter);
    if (!result.complete) fail('SCOPE_INCOMPLETE', 'Work discovery reached its bound; no broader allocation is permitted.');
    return result.records;
  }
  async members(query = '') {
    const records = this.eligibleMemberIds.length ? await this.complete('workspaceMember', { id: { in: this.eligibleMemberIds } }) : [];
    const needle = query.trim().toLowerCase();
    return records.filter(row => !needle || `${row.name?.firstName ?? ''} ${row.name?.lastName ?? ''} ${row.userEmail ?? ''}`.toLowerCase().includes(needle))
      .map(row => ({ id: row.id, name: `${row.name?.firstName ?? ''} ${row.name?.lastName ?? ''}`.trim(), email: row.userEmail }));
  }
  async pool() {
    const initiatives = this.initiativeIds.length ? await this.complete('initiative', { and: [{ id: { in: this.initiativeIds } }, { status: { eq: 'ACTIVE' } }] }) : [];
    const activeIds = initiatives.map(row => row.id);
    const memberships = activeIds.length ? await this.complete('initiativeAccount', { and: [{ initiativeId: { in: activeIds } }, { status: { in: ['INCLUDED', 'ACTIVE'] } }] }) : [];
    const companyIds = ids(memberships.map(row => row.companyId));
    const opportunityIds = ids(this.opportunityPools.filter(pool => activeIds.includes(pool.initiativeId)).flatMap(pool => pool.opportunityIds));
    const opportunities = opportunityIds.length && companyIds.length ? await this.complete('opportunity', { and: [{ id: { in: opportunityIds } }, { companyId: { in: companyIds } }] }) : [];
    // Company identity never silently establishes pursuit/programme identity.
    const permitted = opportunities.filter(row => this.opportunityPools.some(pool => activeIds.includes(pool.initiativeId) && pool.opportunityIds.includes(row.id) && memberships.some(item => item.initiativeId === pool.initiativeId && item.companyId === row.companyId)));
    return { initiatives, memberships, companyIds, opportunities: permitted };
  }
  async portfolio(base) {
    const [pool, tasks] = await Promise.all([this.pool(), this.complete('task', { assigneeId: { eq: this.memberId } })]);
    const taskIds = tasks.map(row => row.id);
    const targets = taskIds.length ? await this.complete('taskTarget', { taskId: { in: taskIds } }) : [];
    const linkedOpportunityIds = ids(targets.map(row => row.targetOpportunityId));
    const linkedOpportunities = linkedOpportunityIds.length ? await this.complete('opportunity', { id: { in: linkedOpportunityIds } }) : [];
    const personIds = ids(targets.map(row => row.targetPersonId));
    const people = personIds.length ? await this.complete('person', { id: { in: personIds } }) : [];
    const ownProgrammeCompanies = pool.memberships.filter(row => row.assigneeId === this.memberId).map(row => row.companyId);
    const delegatedCompanies = ids([...targets.map(row => row.targetCompanyId), ...linkedOpportunities.map(row => row.companyId), ...people.map(row => row.companyId)]);
    const taskAccountIds = Object.fromEntries(taskIds.map(taskId => [taskId, ids(targets.filter(row => row.taskId === taskId).flatMap(row => [row.targetCompanyId, linkedOpportunities.find(item => item.id === row.targetOpportunityId)?.companyId, people.find(item => item.id === row.targetPersonId)?.companyId]))]));
    return { ...base, companyIds: ids([...base.companyIds, ...ownProgrammeCompanies, ...delegatedCompanies]),
      visibleCompanyIds: ids([...base.visibleCompanyIds, ...pool.companyIds, ...delegatedCompanies]),
      opportunityIds: ids([...base.opportunityIds, ...linkedOpportunityIds, ...pool.opportunities.map(row => row.id)]),
      ownedOpportunityIds: base.opportunityIds, ownedCompanyIds: base.companyIds, operationalCompanyIds: ids([...base.visibleCompanyIds, ...ownProgrammeCompanies, ...delegatedCompanies]),
      contactIds: ids([...base.contactIds, ...linkedOpportunities.map(row => row.pointOfContactId)]),
      taskIds, taskAccountIds, taskTargetIds: targets.map(row => row.id), initiativeAccountIds: pool.memberships.map(row => row.id) };
  }
  async raw(object, id) {
    if (!fields[object] || !UUID.test(id)) fail('INVALID_ID', 'Choose an existing account, programme responsibility, opportunity or task UUID.');
    return (await this.adapter.page(object, { id: { eq: id } }, 1)).records[0];
  }
  async accountIds(object, record) {
    if (object === 'company') return [record.id];
    if (object !== 'task') return record.companyId ? [record.companyId] : [];
    const targets = await this.complete('taskTarget', { taskId: { eq: record.id } });
    const opportunityIds = ids(targets.map(row => row.targetOpportunityId));
    const opportunities = opportunityIds.length ? await this.complete('opportunity', { id: { in: opportunityIds } }) : [];
    const personIds = ids(targets.map(row => row.targetPersonId));
    const people = personIds.length ? await this.complete('person', { id: { in: personIds } }) : [];
    return ids([...targets.map(row => row.targetCompanyId), ...opportunities.map(row => row.companyId), ...people.map(row => row.companyId)]);
  }
  async preview({ object, id, accountId, recipientMemberId, expectedUpdatedAt }) {
    this.adapter.writeGuard();
    const members = await this.members();
    if (recipientMemberId !== null && !members.some(row => row.id === recipientMemberId)) fail('INELIGIBLE_RECIPIENT', 'Choose one current eligible workspace member.');
    if (recipientMemberId === null && !this.supervisor) fail('SUPERVISOR_REQUIRED', 'Returning work to the unassigned pool requires the team lead.');
    const record = await this.raw(object, id);
    if (!record) fail('OUT_OF_SCOPE', 'Work is missing or unavailable.');
    const ownerField = fields[object], fromMemberId = record[ownerField] ?? null;
    const accountIds = await this.accountIds(object, record);
    if (!accountIds.includes(accountId)) fail('OUT_OF_SCOPE', 'The selected responsibility does not belong to this account.');
    if (!expectedUpdatedAt || record.updatedAt !== expectedUpdatedAt) fail('CONFLICT', 'The responsibility changed; refresh its owner and version before proposing a transfer.');
    if (!this.supervisor) {
      if (fromMemberId && fromMemberId !== this.memberId) fail('SUPERVISOR_REQUIRED', 'Coach cannot take another executive’s assigned work. Ask the team lead to transfer this specific responsibility, or make a deliberate change in Twenty under your team procedure. No supervisor request has been filed.');
      if (!fromMemberId) {
        if (recipientMemberId !== this.memberId) fail('SELF_CLAIM_ONLY', 'An executive may claim available work for themselves; allocating it to someone else requires the team lead.');
        const pool = await this.pool();
        const eligible = object === 'initiativeAccount' ? pool.memberships.some(row => row.id === id) : object === 'opportunity' ? pool.opportunities.some(row => row.id === id) : object === 'company' ? pool.companyIds.includes(id) : false;
        if (!eligible) fail('OUT_OF_SCOPE', 'This work is not published as available in your authorized sales pool. Backlog stage alone does not make it available.');
      }
    }
    const label = memberId => memberId === null ? 'Unassigned' : members.find(row => row.id === memberId)?.email ?? memberId;
    return { object, recordId: id, accountId, accountIds, ownerField, fromMemberId, toMemberId: recipientMemberId, fromMemberLabel: label(fromMemberId), toMemberLabel: label(recipientMemberId), expectedUpdatedAt,
      responsibility: names[object], recordName: record.name ?? record.title ?? id,
      before: { id, name: record.name, title: record.title, [ownerField]: fromMemberId, updatedAt: record.updatedAt } };
  }
  async assign(plan) {
    const verified = await this.preview({ object: plan.object, id: plan.recordId, accountId: plan.accountId, recipientMemberId: plan.toMemberId, expectedUpdatedAt: plan.expectedUpdatedAt });
    if (verified.fromMemberId !== plan.fromMemberId || verified.ownerField !== plan.ownerField || JSON.stringify([...verified.accountIds].sort()) !== JSON.stringify([...plan.accountIds].sort())) fail('CONFLICT', 'Assignment ownership or linked-account scope changed; refresh the proposal.');
    if (plan.fromMemberId === plan.toMemberId) return { record: plan.before, before: plan.before, unchanged: true };
    const type = { company: 'Company', opportunity: 'Opportunity', task: 'Task', initiativeAccount: 'InitiativeAccount' }[plan.object];
    const plural = { company: 'Companies', opportunity: 'Opportunities', task: 'Tasks', initiativeAccount: 'InitiativeAccounts' }[plan.object];
    const owner = plan.fromMemberId === null ? { is: 'NULL' } : { eq: plan.fromMemberId };
    const result = await this.adapter.request(`mutation CoachAssign($data:${type}UpdateInput!,$filter:${type}FilterInput!){update${plural}(data:$data,filter:$filter){id updatedAt ${plan.ownerField}}}`, {
      data: { [plan.ownerField]: plan.toMemberId }, filter: { and: [{ id: { eq: plan.recordId } }, { updatedAt: { eq: plan.expectedUpdatedAt } }, { [plan.ownerField]: owner }] } });
    this.adapter.invalidatePortfolio();
    if (result[`update${plural}`]?.length !== 1) fail('CONFLICT', 'Another claim or edit won; no assignment was overwritten.');
    const current = await this.raw(plan.object, plan.recordId);
    if (!current || (current[plan.ownerField] ?? null) !== plan.toMemberId) fail('READBACK_FAILED', 'The assignment needs reconciliation; do not repeat it blindly.');
    return { record: { ...plan.before, [plan.ownerField]: plan.toMemberId, updatedAt: current.updatedAt }, before: plan.before };
  }
  async reconcile(plan) {
    // Historical own-context intent permits only a narrow outcome receipt,
    // never fresh private context from a record already handed off.
    if (!this.supervisor && plan.fromMemberId !== null && plan.fromMemberId !== this.memberId) fail('OUT_OF_SCOPE', 'This assignment receipt belongs to another executive.');
    const row = await this.raw(plan.object, plan.recordId);
    return row && (row[plan.ownerField] ?? null) === plan.toMemberId && row.updatedAt !== plan.expectedUpdatedAt
      ? { record: { ...plan.before, [plan.ownerField]: plan.toMemberId, updatedAt: row.updatedAt }, reconciled: true } : null;
  }
  async discover({ mode = 'available', query = '', limit = 50 } = {}) {
    const pool = await this.pool();
    const companyIds = pool.companyIds;
    const companies = companyIds.length ? await this.complete('company', { id: { in: companyIds } }) : [];
    const rows = [...pool.memberships.map(record => ({ object: 'initiativeAccount', record, field: 'assigneeId' })), ...pool.opportunities.map(record => ({ object: 'opportunity', record, field: 'ownerId' })), ...companies.map(record => ({ object: 'company', record, field: 'accountOwnerId' }))];
    if (mode === 'mine' || this.supervisor && mode === 'team') {
      for (const [object, field] of Object.entries(fields)) {
        const own = await this.complete(object, mode === 'team' ? {} : { [field]: { eq: this.memberId } });
        for (const record of own) if (!rows.some(item => item.object === object && item.record.id === record.id)) rows.push({ object, record, field });
      }
    }
    if (mode === 'team' && !this.supervisor) fail('SUPERVISOR_REQUIRED', 'The complete team work list is available to the supervisor.');
    const needle = query.trim().toLowerCase();
    const matching = rows.filter(({ record, field }) => (mode === 'available' ? !record[field] : mode === 'mine' ? record[field] === this.memberId : true) && (!needle || `${record.name ?? record.title ?? ''}`.toLowerCase().includes(needle)));
    const work = await Promise.all(matching.slice(0, limit).map(async ({ object, record, field }) => {
      const accountIds = await this.accountIds(object, record);
      return { object, id: record.id, name: record.name ?? record.title, companyId: accountIds.length === 1 ? accountIds[0] : undefined, accountIds,
        initiativeId: record.initiativeId, ownerMemberId: record[field] ?? null, expectedUpdatedAt: record.updatedAt, responsibility: names[object] };
    }));
    return { initiatives: pool.initiatives, work,
      coverage: { returned: Math.min(matching.length, limit), totalCount: matching.length, complete: matching.length <= limit },
      sourceAccess: 'Shared work discovery grants no other executive mailbox, calendar or private evidence.', nativeTwentyPolicy: 'Direct human edits follow team procedures; Coach enforces its own allocation boundary.' };
  }
}
