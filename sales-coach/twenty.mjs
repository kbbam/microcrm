import { createHash } from 'node:crypto';
import { matchesSuppliedValue } from './store.mjs';
import { WorkAllocation } from './work-allocation.mjs';

export class TwentyError extends Error {
  constructor(code, message) { super(message); this.name = 'TwentyError'; this.code = code; }
}
const fail = (code, message) => { throw new TwentyError(code, message); };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = value => { if (!UUID.test(value ?? '')) fail('INVALID_ID', 'A UUID record identifier is required.'); return value; };
const stages = ['APPROACHING', 'ENGAGED', 'COMMERCIAL', 'WON', 'LOST'];
const config = {
  company: ['Company', 'companies', 'name domainName { primaryLinkLabel primaryLinkUrl } address { addressCity addressCountry }', ['name', 'domainName', 'address']],
  person: ['Person', 'people', 'name { firstName lastName } emails { primaryEmail additionalEmails } jobTitle companyId', ['name', 'emails', 'jobTitle', 'companyId']],
  opportunity: ['Opportunity', 'opportunities', 'name stage companyId pointOfContactId amount { amountMicros currencyCode } closeDate', ['name', 'stage', 'companyId', 'pointOfContactId', 'amount', 'closeDate']],
  note: ['Note', 'notes', 'title bodyV2 { markdown blocknote }', ['title', 'bodyV2']],
  task: ['Task', 'tasks', 'title bodyV2 { markdown blocknote } status dueAt', ['title', 'bodyV2', 'status', 'dueAt']],
  noteTarget: ['NoteTarget', 'noteTargets', 'noteId targetCompanyId targetPersonId targetOpportunityId', ['noteId', 'targetCompanyId', 'targetPersonId', 'targetOpportunityId']],
  taskTarget: ['TaskTarget', 'taskTargets', 'taskId targetCompanyId targetPersonId targetOpportunityId', ['taskId', 'targetCompanyId', 'targetPersonId', 'targetOpportunityId']],
  message: ['Message', 'messages', 'headerMessageId messageThreadId subject text receivedAt isDraft', []],
  calendarEvent: ['CalendarEvent', 'calendarEvents', 'title description location startsAt endsAt isCanceled iCalUid', []],
  messageThreadTarget: ['MessageThreadTarget', 'messageThreadTargets', 'messageThreadId targetCompanyId targetPersonId targetOpportunityId', []],
  calendarEventTarget: ['CalendarEventTarget', 'calendarEventTargets', 'calendarEventId targetCompanyId targetPersonId targetOpportunityId', []],
  messageParticipant: ['MessageParticipant', 'messageParticipants', 'messageId personId role handle displayName', []],
  calendarEventParticipant: ['CalendarEventParticipant', 'calendarEventParticipants', 'calendarEventId personId handle displayName isOrganizer responseStatus', []],
  initiative: ['Initiative', 'initiatives', 'name status objective managerId', []],
  initiativeAccount: ['InitiativeAccount', 'initiativeAccounts', 'name status initiativeId companyId assigneeId', []],
  workspaceMember: ['WorkspaceMember', 'workspaceMembers', 'name { firstName lastName } userEmail', []],
};
const aliases = Object.fromEntries(Object.entries(config).flatMap(([k,v]) => [[k,k],[v[1],k]]));
const kind = object => aliases[object] ?? fail('UNSUPPORTED_OBJECT', 'This CRM object is outside the coach tool boundary.');
const trustedField = value => { if (typeof value !== 'string' || !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(value)) fail('INVALID_ASSIGNMENT', 'Trusted assignment field must be a GraphQL identifier.'); return value; };
const selection = object => `id createdAt updatedAt ${config[object][2]}`;
const stableTargetId = (object,id,companyId) => {
  const hex = createHash('sha256').update(`${object}:${id}:${companyId}`).digest('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-5${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
};
// Twenty may return this sentinel in place of a protected scalar without a
// GraphQL error. It is an access result, never customer evidence.
const RESTRICTED_FIELD = 'FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED';
const communicationFields = {
  message: ['headerMessageId', 'messageThreadId', 'subject', 'text', 'receivedAt', 'isDraft'],
  calendarEvent: ['title', 'description', 'location', 'startsAt', 'endsAt', 'isCanceled', 'iCalUid'],
  messageParticipant: ['messageId', 'personId', 'role', 'handle', 'displayName'],
  calendarEventParticipant: ['calendarEventId', 'personId', 'handle', 'displayName', 'isOrganizer', 'responseStatus'],
};
const communicationContent = (object, records) => {
  const fields = communicationFields[object];
  if (!fields) return { records };
  const summary = Object.fromEntries(fields.map(field => [field, { available: 0, empty: 0, notProvided: 0, restricted: 0 }]));
  let restrictedRecordCount = 0;
  const sanitized = records.map(record => {
    const result = { ...record, contentAvailability: {} };
    let restricted = false;
    for (const field of fields) {
      const value = record[field];
      const status = value === RESTRICTED_FIELD ? 'restricted' : value == null ? 'notProvided' : value === '' ? 'empty' : 'available';
      summary[field][status]++;
      result.contentAvailability[field] = { status };
      if (status === 'restricted') {
        result[field] = null;
        result.contentAvailability[field].reason = 'additional-permissions-required';
        restricted = true;
      }
    }
    if (restricted) restrictedRecordCount++;
    return result;
  });
  return { records: sanitized, contentAvailability: { restrictedRecordCount, fields: summary } };
};

/** A fixed-template, account-scoped Twenty transport. The runner owns consequence review. */
export class TwentyAdapter {
  constructor({ baseUrl, apiKey, fetchImpl = fetch, writeEnabled = false, scopeCompanyIds = [], scopeMode = 'accounts', externalEffectsReviewed = false, allowPersonEmailWrites = false, assignment, messageChannelIds = [], calendarChannelIds = [], sourceOwnershipRequired = false, resolveSourceChannels, stageField = 'stage', stageEnumName, nativeStageOnCreate, workAllocation, actor }) {
    const url = new URL(baseUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) fail('INVALID_URL', 'Invalid CRM base URL.');
    this.baseUrl = url.href.replace(/\/$/, '').replace(/\/(graphql|metadata)$/, '');
    this.apiKey = apiKey; this.fetch = fetchImpl;
    this.writeEnabled = writeEnabled === true; this.externalEffectsReviewed = externalEffectsReviewed === true;
    // Deployment-specific permission: the pilot has an observed email-to-company
    // automation. Broader internal-write approval does not authorize that effect.
    this.allowPersonEmailWrites = allowPersonEmailWrites === true;
    if (!['accounts','workspace','assigned'].includes(scopeMode)) fail('INVALID_SCOPE_MODE','Use accounts scope or explicitly authorized isolated workspace scope.');
    // Trusted deployment configuration, never an argument supplied by the model.
    this.scopeMode=scopeMode;
    this.scope = [...new Set(scopeCompanyIds.map(uuid))];
    this.messageChannelIds = [...new Set(messageChannelIds.map(uuid))];
    this.calendarChannelIds = [...new Set(calendarChannelIds.map(uuid))];
    this.sourceOwnershipRequired = sourceOwnershipRequired === true;
    this.resolveSourceChannels = resolveSourceChannels;
    this.stageField = trustedField(stageField);
    if (stageField !== 'stage' && !stageEnumName) fail('INVALID_STAGE_CONFIG', 'Custom coach stage requires a verified enum type name.');
    this.stageEnumName = trustedField(stageEnumName ?? 'OpportunityStageEnum');
    this.nativeStageOnCreate = nativeStageOnCreate;
    if (nativeStageOnCreate !== undefined && (typeof nativeStageOnCreate !== 'string' || !nativeStageOnCreate.trim())) fail('INVALID_STAGE_CONFIG', 'Native creation stage must be an explicit verified value.');
    if (scopeMode === 'assigned') {
      if (!assignment) fail('INVALID_ASSIGNMENT', 'Assigned scope requires trusted member and verified assignment fields.');
      this.assignment = { memberId: uuid(assignment.memberId), companyOwnerField: trustedField(assignment.companyOwnerField), opportunityOwnerField: trustedField(assignment.opportunityOwnerField) };
    }
    if (workAllocation?.enabled === true) {
      if (this.assignment && (this.assignment.memberId !== workAllocation.memberId || this.assignment.companyOwnerField !== 'accountOwnerId' || this.assignment.opportunityOwnerField !== 'ownerId')) fail('INVALID_ALLOCATION_CONFIG', 'Work allocation must match the verified executive assignment mapping.');
      this.work = new WorkAllocation(this, workAllocation, actor);
    }
  }
  async request(query, variables = {}) {
    let response;
    try { response = await this.fetch(`${this.baseUrl}/graphql`, { method: 'POST', headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(20000) }); }
    catch { fail('TRANSPORT_UNCERTAIN', 'CRM response unavailable; reconcile stable record IDs before retrying a write.'); }
    if (!response.ok) fail('CRM_HTTP', `CRM request failed (HTTP ${response.status}).`);
    let body; try { body = await response.json(); } catch { fail('CRM_RESPONSE', 'CRM returned invalid JSON.'); }
    // Never echo server errors: they can contain source data or credentials.
    if (body.errors?.length) fail('CRM_SCHEMA_OR_ACCESS', 'CRM rejected the fixed operation; check schema and account permissions.');
    if (!body.data) fail('CRM_RESPONSE', 'CRM returned no operation data.');
    return body.data;
  }
  async metadata() {
    // Twenty rejects duplicate __type root resolvers even with aliases.
    const parts = await Promise.all([
      this.request(`{ stage: __type(name: "${this.stageEnumName}") { enumValues { name } } }`),
      this.request('{ nativeStage: __type(name: "OpportunityStageEnum") { enumValues { name } } }'),
      this.request('{ query: __type(name: "Query") { fields { name } } }'),
    ]);
    const result = { stage: parts[0].stage, nativeStage: parts[1].nativeStage, query: parts[2].query };
    return { stageField: this.stageField, stages: result.stage?.enumValues?.map(v => v.name) ?? [], nativeStages: result.nativeStage?.enumValues?.map(v => v.name) ?? [], readableObjects: Object.keys(config).filter(o => result.query?.fields?.some(f => f.name === config[o][1])), pipelineCompatible: stages.every(s => result.stage?.enumValues?.some(v => v.name === s)) };
  }
  accountScope(companyId) {
    if (this.scopeMode==='workspace') return companyId ? [uuid(companyId)] : null;
    if (this.scopeMode==='assigned') return companyId ? [uuid(companyId)] : undefined;
    if (!this.scope.length) fail('SCOPE_REQUIRED', 'Configure approved company IDs before CRM access.');
    if (companyId && !this.scope.includes(uuid(companyId))) fail('OUT_OF_SCOPE', 'Company is outside approved pilot scope.');
    return companyId ? [companyId] : this.scope;
  }
  recordSelection(object) {
    const extra = [];
    if (this.scopeMode === 'assigned' && object === 'company') extra.push(this.assignment.companyOwnerField);
    if (this.scopeMode === 'assigned' && object === 'opportunity') extra.push(this.assignment.opportunityOwnerField);
    if (object === 'opportunity' && this.stageField !== 'stage') extra.push(this.stageField);
    if (this.work && object === 'company') extra.push('accountOwnerId');
    if (this.work && object === 'opportunity') extra.push('ownerId');
    if (this.work && object === 'task') extra.push('assigneeId');
    return `${selection(object)} ${[...new Set(extra)].join(' ')}`.trim();
  }
  matchesValues(object, record, data) {
    return Object.entries(data).every(([field, value]) => matchesSuppliedValue(object === 'opportunity' && this.stageField !== 'stage' && field === 'stage' ? record.providerStage : record[field], value));
  }
  async page(object, filter, limit, offset = 0, identifiersOnly = false) {
    const [type, plural] = config[object];
    const data = await this.request(`query CoachRead($filter:${type}FilterInput!, $limit:Int!, $offset:Int!){${plural}(filter:$filter,first:$limit,offset:$offset){edges{node{${identifiersOnly ? 'id' : this.recordSelection(object)}}}pageInfo{hasNextPage endCursor}totalCount}}`, { filter, limit, offset });
    const c = data[plural];
    if (!c || !Array.isArray(c.edges) || !c.pageInfo) fail('CRM_RESPONSE', 'CRM returned an invalid connection.');
    const content = identifiersOnly ? { records: c.edges.map(e => e.node) } : communicationContent(object, c.edges.map(e => object === 'opportunity' && this.stageField !== 'stage' ? { ...e.node, providerStage: e.node.stage, stage: e.node[this.stageField] ?? null, coachStageField: this.stageField } : e.node));
    // This is only absence of explicit restrictions in the returned page;
    // null/omitted fields, provider synchronization and original bytes remain separate.
    return { records: content.records, coverage: { returned: c.edges.length, totalCount: c.totalCount, hasNextPage: c.pageInfo.hasNextPage, endCursor: c.pageInfo.endCursor, complete: offset === 0 && !c.pageInfo.hasNextPage, limit, offset, ...(content.contentAvailability ? { contentAccessUnrestricted: content.contentAvailability.restrictedRecordCount === 0, contentAvailability: content.contentAvailability } : {}) } };
  }
  async collect(object, filter, identifiersOnly = false) {
    if (!filter) return {records:[],complete:true};
    const records = []; let complete = false;
    for (let offset = 0; offset < 1000; offset += 100) {
      const page = await this.page(object, filter, 100, offset, identifiersOnly); records.push(...page.records);
      if (!page.coverage.hasNextPage) { complete = true; break; }
    }
    return { records, complete };
  }
  async assignedPortfolio() {
    const cache = this.authorizationScope?.getStore()?.providers;
    const key = 'twenty-assigned-portfolio';
    if (cache?.has(key)) return cache.get(key);
    const work = this.discoverAssignedPortfolio();
    cache?.set(key, work);
    return work;
  }
  invalidatePortfolio() {
    this.authorizationScope?.getStore()?.providers?.delete('twenty-assigned-portfolio');
  }
  async discoverAssignedPortfolio() {
    const { memberId, companyOwnerField, opportunityOwnerField } = this.assignment;
    const [companies, opportunities] = await Promise.all([
      this.collect('company', { [companyOwnerField]: { eq: memberId } }),
      this.collect('opportunity', { [opportunityOwnerField]: { eq: memberId } }),
    ]);
    if (!companies.complete || !opportunities.complete) fail('SCOPE_INCOMPLETE', 'Assignment discovery is incomplete; no broader access is permitted.');
    const base = { companyIds: companies.records.map(record => record.id), opportunityIds: opportunities.records.map(record => record.id),
      visibleCompanyIds: [...new Set([...companies.records.map(record => record.id), ...opportunities.records.map(record => record.companyId).filter(Boolean)])],
      contactIds: [...new Set(opportunities.records.map(record => record.pointOfContactId).filter(Boolean))] };
    return this.work ? this.work.portfolio(base) : base;
  }
  async authorizeAccount(companyId, { createCompany = false } = {}) {
    uuid(companyId);
    if (this.scopeMode !== 'assigned') { this.accountScope(companyId); return true; }
    if (!(await this.assignedPortfolio()).visibleCompanyIds.includes(companyId)) {
      // Creation may reserve a genuinely new UUID, never adopt an existing
      // unassigned company. This option comes only from the guarded host flow.
      if (!createCompany || (await this.page('company', { id: { eq: companyId } }, 1, 0, true)).records.length) fail('OUT_OF_SCOPE', 'Account is not assigned to this executive.');
    }
    return true;
  }
  async channelRecordIds(object, selectors = {}) {
    const isMessage = object === 'message';
    let channelIds = isMessage ? this.messageChannelIds : this.calendarChannelIds;
    let sourceSync;
    if (this.sourceOwnershipRequired || this.resolveSourceChannels) {
      if (typeof this.resolveSourceChannels !== 'function') fail('SOURCE_CONNECTION_REQUIRED', 'Connect your own Twenty email and calendar sources through Business OS before checking communications.');
      const cache = this.authorizationScope?.getStore()?.providers, key = 'twenty-source-authority';
      let current;
      if (cache?.has(key)) current = await cache.get(key);
      else { const work = this.resolveSourceChannels(); cache?.set(key, work); current = await work; }
      const live = isMessage ? current?.messageChannelIds : current?.calendarChannelIds;
      if (!Array.isArray(live)) fail('SOURCE_OWNERSHIP_UNAVAILABLE', 'Current source ownership could not be verified.');
      const registeredCount = channelIds.length;
      if (!registeredCount) fail('SOURCE_CONNECTION_REQUIRED', `No ${isMessage ? 'email' : 'calendar'} source was registered for this executive. Connect it in Twenty and recheck Business OS source setup.`);
      channelIds = channelIds.filter(id => live.includes(id));
      if (!channelIds.length) fail('SOURCE_OWNERSHIP_REVOKED', `Previously registered ${isMessage ? 'email' : 'calendar'} sources are no longer owned by this executive. Reconnect through Business OS source setup before checking communications.`);
      const channels = (isMessage ? current?.messageChannels : current?.calendarChannels) ?? [];
      sourceSync = { checkedAt: current.checkedAt ?? null, channels: channels.filter(channel => channelIds.includes(channel.id)), registeredChannelCount: registeredCount, authorizedChannelCount: channelIds.length, revokedChannelCount: registeredCount - channelIds.length, authorizationComplete: registeredCount === channelIds.length, currentMailboxCompletenessVerified: false,
        reason: 'These are synchronized Twenty records. An empty result or no change does not establish that the live mailbox/calendar has no new activity. Check source sync status and timestamps.' };
    }
    if (!channelIds.length) return { ids: [], complete: true, sourceSync };
    const type = isMessage ? 'MessageChannelMessageAssociation' : 'CalendarChannelEventAssociation';
    const plural = isMessage ? 'messageChannelMessageAssociations' : 'calendarChannelEventAssociations';
    const channelField = isMessage ? 'messageChannelId' : 'calendarChannelId';
    const recordField = isMessage ? 'messageId' : 'calendarEventId';
    const clauses = [{ [channelField]: { in: channelIds } }];
    if (selectors.messageId && isMessage) clauses.push({ messageId: { eq: selectors.messageId } });
    if (selectors.id) clauses.push({ [recordField]: { eq: selectors.id } });
    if (isMessage && selectors.messageThreadId) clauses.push({ message: { messageThreadId: { eq: selectors.messageThreadId } } });
    if (isMessage && selectors.subjectContains) clauses.push({ message: { subject: { ilike: `%${selectors.subjectContains.replace(/[\\%_]/g, character => `\\${character}`)}%` } } });
    const ids = [];
    for (let offset = 0; offset < 1000; offset += 100) {
      const data = await this.request(`query CoachSourceScope($filter:${type}FilterInput!, $limit:Int!, $offset:Int!){${plural}(filter:$filter,first:$limit,offset:$offset){edges{node{${recordField}}}pageInfo{hasNextPage}}}`, { filter: { and: clauses }, limit: 100, offset });
      const page = data[plural];
      if (!page || !Array.isArray(page.edges) || !page.pageInfo) fail('CRM_RESPONSE', 'Source ownership discovery returned invalid data.');
      ids.push(...page.edges.map(edge => edge.node[recordField]).filter(Boolean));
      if (!page.pageInfo.hasNextPage) return { ids: [...new Set(ids)], complete: true, sourceSync };
    }
    return { ids: [...new Set(ids)], complete: false, sourceSync };
  }
  async scopeFilter(object, companyIds, selectors = {}, policy) {
    if (this.scopeMode === 'assigned') {
      policy ??= await this.assignedPortfolio();
      if (companyIds?.some(companyId => !policy.visibleCompanyIds.includes(companyId))) fail('OUT_OF_SCOPE', 'Account is not assigned to this executive.');
      const narrow = ids => companyIds ? ids.filter(value => companyIds.includes(value)) : ids;
      const ownedCompanies = narrow(policy.companyIds);
      if (object === 'initiativeAccount') return { filter: policy.initiativeAccountIds?.length ? { and: [{ id: { in: policy.initiativeAccountIds } }, ...(companyIds ? [{ companyId: { in: companyIds } }] : [])] } : null, complete: true };
      if (object === 'initiative' || object === 'workspaceMember') fail('READ_ONLY_OBJECT', 'Use the scoped work-discovery/member tools for these objects.');
      if (object === 'company') {
        const ids = narrow(policy.visibleCompanyIds);
        return { filter: ids.length ? { id: { in: ids } } : null, complete: true };
      }
      if (object === 'opportunity') return { filter: policy.opportunityIds.length ? { and: [{ id: { in: policy.opportunityIds } }, ...(companyIds ? [{ companyId: { in: companyIds } }] : [])] } : null, complete: true };
      if (object === 'person') {
        const alternatives = [...(ownedCompanies.length ? [{ companyId: { in: ownedCompanies } }] : []), ...(policy.contactIds.length ? [{ id: { in: policy.contactIds } }] : [])];
        return { filter: alternatives.length ? { and: [{ or: alternatives }, ...(companyIds ? [{ companyId: { in: companyIds } }] : [])] } : null, complete: true };
      }
      if (['message', 'calendarEvent'].includes(object)) {
        const owned = await this.channelRecordIds(object, selectors);
        if (!owned.ids.length) return { filter: null, complete: owned.complete, sourceSync: owned.sourceSync };
        if (!companyIds) return { filter: { id: { in: owned.ids } }, complete: owned.complete, sourceSync: owned.sourceSync };
        const parent = object === 'message' ? 'messageThreadTarget' : 'calendarEventTarget';
        const field = object === 'message' ? 'messageThreadId' : 'calendarEventId';
        const accountScope = await this.scopeFilter(parent, companyIds, selectors, policy);
        const related = await this.collect(parent, accountScope.filter);
        const relatedIds = related.records.map(record => record[field]).filter(Boolean);
        return { filter: relatedIds.length ? { and: [{ id: { in: owned.ids } }, { [object === 'message' ? 'messageThreadId' : 'id']: { in: relatedIds } }] } : null, complete: owned.complete && accountScope.complete && related.complete, sourceSync: owned.sourceSync };
      }
      if (object.endsWith('Target')) {
        const people = await this.collect('person', (await this.scopeFilter('person', companyIds, selectors, policy)).filter);
        const opportunities = await this.collect('opportunity', (await this.scopeFilter('opportunity', companyIds, selectors, policy)).filter);
        const ownedTaskIds = (policy.taskIds ?? []).filter(taskId => !companyIds || policy.taskAccountIds[taskId]?.some(id => companyIds.includes(id)));
        const alternatives = [...(ownedCompanies.length ? [{ targetCompanyId: { in: ownedCompanies } }] : []), ...(people.records.length ? [{ targetPersonId: { in: people.records.map(record => record.id) } }] : []), ...(opportunities.records.length ? [{ targetOpportunityId: { in: opportunities.records.map(record => record.id) } }] : []), ...(object === 'taskTarget' && ownedTaskIds.length ? [{ taskId: { in: ownedTaskIds } }] : [])];
        return { filter: alternatives.length ? { or: alternatives } : null, complete: people.complete && opportunities.complete };
      }
    }
    if (companyIds===null) return {filter:{},complete:true};
    if (this.scopeMode !== 'assigned' && object === 'company') return { filter: { id: { in: companyIds } }, complete: true };
    if (this.scopeMode !== 'assigned' && ['person','opportunity'].includes(object)) return { filter: { companyId: { in: companyIds } }, complete: true };
    if (this.scopeMode !== 'assigned' && object.endsWith('Target')) {
      const people = await this.collect('person', { companyId: { in: companyIds } });
      const opportunities = await this.collect('opportunity', { companyId: { in: companyIds } });
      return { filter: { or: [{ targetCompanyId: { in: companyIds } }, ...(people.records.length ? [{ targetPersonId: { in: people.records.map(r=>r.id) } }] : []), ...(opportunities.records.length ? [{ targetOpportunityId: { in: opportunities.records.map(r=>r.id) } }] : [])] }, complete: people.complete && opportunities.complete };
    }
    const mapping = { note: ['noteTarget','noteId'], task: ['taskTarget','taskId'], message: ['messageThreadTarget','messageThreadId'], calendarEvent: ['calendarEventTarget','calendarEventId'], messageParticipant: ['message','messageId'], calendarEventParticipant: ['calendarEvent','calendarEventId'] };
    const [parent, field] = mapping[object]; const scope = await this.scopeFilter(parent, companyIds, selectors, policy);
    const lookupClauses = [];
    if (parent === 'message') {
      if (selectors.messageId !== undefined) lookupClauses.push({ id: { eq: selectors.messageId } });
      if (selectors.messageThreadId !== undefined) lookupClauses.push({ messageThreadId: { eq: selectors.messageThreadId } });
    }
    const related = await this.collect(parent, scope.filter && (lookupClauses.length ? { and: [scope.filter, ...lookupClauses] } : scope.filter), parent === 'message');
    const ids = related.records.map(r => parent.endsWith('Target') ? r[field] : r.id).filter(Boolean);
    if (object === 'task' && this.work && this.scopeMode === 'assigned') {
      const portfolio = await this.assignedPortfolio();
      ids.push(...portfolio.taskIds.filter(taskId => !companyIds || portfolio.taskAccountIds[taskId]?.some(id => companyIds.includes(id))));
    }
    return { filter: ids.length ? { [object === 'message' ? 'messageThreadId' : object.endsWith('Participant') ? field : 'id']: { in: [...new Set(ids)] } } : null, complete: scope.complete && related.complete, sourceSync: scope.sourceSync };
  }
  async read({ object, id, companyId, limit = 50, offset = 0, subjectContains, messageThreadId, messageId }) {
    object = kind(object); const companies = this.accountScope(companyId);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0 || offset > 10000) fail('INVALID_BOUND', 'Read limit must be 1–100 and offset 0–10000.');
    if (id) uuid(id);
    const clauses = [];
    if (subjectContains !== undefined) {
      if (object !== 'message' || typeof subjectContains !== 'string' || !subjectContains.trim() || subjectContains.length > 500) fail('INVALID_FILTER', 'Subject substring is supported only for messages and must be 1–500 nonblank characters.');
      // Provider ilike is a pattern operator. User input stays a literal
      // substring: wildcard and escape characters cannot broaden the request.
      const literal = subjectContains.replace(/[\\%_]/g, character => `\\${character}`);
      clauses.push({ subject: { ilike: `%${literal}%` } });
    }
    if (messageThreadId !== undefined) {
      if (!['message', 'messageParticipant', 'messageThreadTarget'].includes(object)) fail('INVALID_FILTER', 'Thread filter is supported only for messages, message participants and thread targets.');
      uuid(messageThreadId);
      clauses.push(object === 'messageParticipant' ? { message: { messageThreadId: { eq: messageThreadId } } } : { messageThreadId: { eq: messageThreadId } });
    }
    if (messageId !== undefined) {
      if (object !== 'messageParticipant') fail('INVALID_FILTER', 'Parent message filter is supported only for message participants.');
      clauses.push({ messageId: { eq: uuid(messageId) } });
    }
    if (id) clauses.push({ id: { eq: id } });
    const scope = await this.scopeFilter(object, companies, { messageThreadId, messageId, ...(['message','calendarEvent'].includes(object) ? { id } : {}), subjectContains });
    const filter = scope.filter && (clauses.length ? { and: [scope.filter, ...clauses] } : scope.filter);
    const result = filter ? await this.page(object, filter, id ? 1 : limit, offset) : {records:[],coverage:{returned:0,totalCount:0,hasNextPage:false,endCursor:null,complete:offset===0,limit,offset}};
    if (subjectContains !== undefined || messageThreadId !== undefined || messageId !== undefined) result.coverage.requestedSubset = { ...(subjectContains !== undefined ? { subjectContains } : {}), ...(messageThreadId !== undefined ? { messageThreadId } : {}), ...(messageId !== undefined ? { messageId } : {}) };
    result.coverage.scopeComplete = scope.complete;
    if (scope.sourceSync) {
      result.coverage.sourceSync = scope.sourceSync;
      result.coverage.currentSourceCoverageVerified = false;
      result.coverage.warning = 'Source ownership is verified, but synchronized records do not prove current mailbox/calendar completeness. Check sourceSync before inferring no new activity.';
    }
    if (object === 'message') result.coverage.sourceCapabilities = {
      body: 'plain-text-when-authorized', participants: 'separate-messageParticipant-read', threadId: true,
      fieldAccess: 'per-record-contentAvailability; restricted values are not evidence',
      originalMime: false, attachmentBytes: false, mailboxSynchronization: 'unverified',
      scope: this.scopeMode === 'workspace' ? 'approved-workspace' : this.scopeMode === 'assigned' ? 'executive-owned-connected-sources' : 'approved-account-associations',
    };
    if (object === 'calendarEvent') result.coverage.sourceCapabilities = {
      representation: 'synchronized-event-fields', participants: 'separate-calendarEventParticipant-read',
      fieldAccess: 'per-record-contentAvailability; restricted values are not evidence',
      providerOriginal: false, calendarSynchronization: 'unverified',
      scope: this.scopeMode === 'workspace' ? 'approved-workspace' : this.scopeMode === 'assigned' ? 'executive-owned-connected-sources' : 'approved-account-associations',
    };
    result.coverage.complete &&= scope.complete;
    if (!scope.complete) result.coverage.warning = [result.coverage.warning, 'Authorized relationship/source discovery reached its 1000-record bound; context coverage is partial.'].filter(Boolean).join(' ');
    if (result.coverage.contentAccessUnrestricted === false) result.coverage.warning = [result.coverage.warning, 'Twenty withheld one or more communication fields because additional permissions are required; record pagination does not establish full content access.'].filter(Boolean).join(' ');
    return result;
  }
  writeGuard() {
    if (!this.writeEnabled || !this.externalEffectsReviewed) fail('WRITES_DISABLED', 'CRM writes require an explicitly enabled isolated pilot and completed external-effect review.');
    this.accountScope();
  }
  async values(object, values, create) {
    if (!values || Object.getPrototypeOf(values) !== Object.prototype) fail('INVALID_VALUES', 'Values must be a plain object.');
    const allowed = new Set([...config[object][3], ...(create ? ['id'] : []), ...(['note','task'].includes(object) && create ? ['companyId'] : [])]);
    if (!config[object][3].length) fail('READ_ONLY_OBJECT', 'Communications and their synchronization records are read-only.');
    if (object === 'person' && 'emails' in values && !this.allowPersonEmailWrites) fail('UNREVIEWED_EXTERNAL_EFFECT', 'Person email writes require a separate trusted review of CRM automation effects.');
    for (const field of Object.keys(values)) if (!allowed.has(field)) fail('FORBIDDEN_FIELD', `Field ${field} is outside the internal projection boundary.`);
    for (const [field,value] of Object.entries(values)) {
      if (field === 'id' || field.endsWith('Id')) { if (value !== null) uuid(value); }
      if (typeof value === 'string' && value.length > 100000) fail('INVALID_VALUES', 'CRM text exceeds the supported bound.');
    }
    if (object === 'opportunity' && (create || 'stage' in values)) {
      if (!stages.includes(values.stage)) fail('INVALID_STAGE', 'Use APPROACHING, ENGAGED, COMMERCIAL, WON or LOST with evidence-based judgment.');
      const metadata = await this.metadata();
      if (!metadata.pipelineCompatible) fail('PIPELINE_SETUP_REQUIRED', 'Configured opportunity stage metadata must contain all five coach commercial states before stage writes.');
      if (create && this.stageField !== 'stage' && !metadata.nativeStages.includes(this.nativeStageOnCreate)) fail('PIPELINE_SETUP_REQUIRED', 'Custom coach stage creation requires a verified native creation stage.');
    }
    if (values.companyId) await this.authorizeAccount(values.companyId);
    if (values.targetCompanyId) await this.authorizeAccount(values.targetCompanyId);
    for (const [field,related] of [['pointOfContactId','person'],['targetPersonId','person'],['targetOpportunityId','opportunity'],['noteId','note'],['taskId','task']]) {
      if (values[field] && !(await this.read({object:related,id:values[field]})).records.length) fail('OUT_OF_SCOPE', 'Related CRM record is outside approved account scope.');
    }
    const mapped = { ...values };
    if (object === 'opportunity' && this.stageField !== 'stage' && 'stage' in mapped) {
      mapped[this.stageField] = mapped.stage;
      delete mapped.stage;
      if (create) mapped.stage = this.nativeStageOnCreate;
    }
    return { ...mapped, ...(create && this.scopeMode === 'assigned' && object === 'company' ? { [this.assignment.companyOwnerField]: this.assignment.memberId } : {}), ...(create && this.scopeMode === 'assigned' && object === 'opportunity' ? { [this.assignment.opportunityOwnerField]: this.assignment.memberId } : {}) };
  }
  async create({ object, values }) {
    this.writeGuard(); object = kind(object); const data = await this.values(object,values,true);
    if (object === 'company' && this.work) {
      const literal = value => value.replace(/[\\%_]/g, character => `\\${character}`);
      const clauses = [];
      if (typeof data.name === 'string' && data.name.trim()) clauses.push({ name: { ilike: literal(data.name.trim()) } });
      if (data.domainName?.primaryLinkUrl) clauses.push({ domainName: { primaryLinkUrl: { eq: data.domainName.primaryLinkUrl } } });
      if (clauses.length) {
        const candidates = (await this.page('company', { or: clauses }, 2, 0, true)).records;
        if (candidates.some(record => record.id !== data.id)) fail('ACCOUNT_MATCH_REQUIRED', 'An existing account may match this name or domain. Resolve its identity in Twenty or with the team lead before creating a duplicate.');
      }
    }
    if (object === 'task' && this.work) data.assigneeId = this.work.memberId;
    // Caller persists the stable ID before submission; retry never blindly creates again.
    uuid(data.id);
    if (object === 'company') this.accountScope(data.id);
    if (['person','opportunity','note','task'].includes(object) && !data.companyId) fail('SCOPE_REQUIRED','New record requires approved companyId.');
    if (object.endsWith('Target') && !data.targetCompanyId) fail('SCOPE_REQUIRED','New target requires approved targetCompanyId.');
    const before = (await this.read({object,id:data.id})).records[0];
    const companyId = data.companyId;
    if (['note','task'].includes(object)) delete data.companyId;
    let record = before;
    if (!record) {
      // A previous note/task create may have succeeded before its target failed.
      if (['note','task'].includes(object)) {
        const unlinked = await this.page(object,{id:{eq:data.id}},1);
        record = unlinked.records[0];
        if (record && !this.matchesValues(object, record, data)) fail('ID_COLLISION','Stable ID already exists with different content; reconcile before retry.');
      }
      if (!record) {
        const [type] = config[object];
        const result = await this.request(`mutation CoachCreate($data:${type}CreateInput!){create${type}(data:$data){${this.recordSelection(object)}}}`,{data}); record = result[`create${type}`];
        this.invalidatePortfolio();
      }
    } else if (!this.matchesValues(object, record, data)) fail('ID_COLLISION','Stable ID already exists with different content; reconcile before retry.');
    if (['note','task'].includes(object)) {
      const target = `${object}Target`; const targetId=stableTargetId(object,data.id,companyId);
      if (!(await this.read({object:target,id:targetId})).records.length) {
        const type=config[target][0];
        await this.request(`mutation CoachAttach($data:${type}CreateInput!){create${type}(data:$data){id}}`,{data:{id:targetId,[`${object}Id`]:data.id,targetCompanyId:companyId}});
      }
    }
    const reread = (await this.read({object,id:data.id})).records[0];
    if (!reread) fail('READBACK_FAILED','Created record is not visible in approved CRM scope; reconcile before retry.');
    return {record:reread, created:!before};
  }
  async update({ object, id, values, expectedUpdatedAt }) {
    this.writeGuard(); object=kind(object); uuid(id);
    if (!expectedUpdatedAt || Number.isNaN(Date.parse(expectedUpdatedAt))) fail('BASELINE_REQUIRED','Update requires the proposal baseline updatedAt.');
    const data=await this.values(object,values,false);
    const before=(await this.read({object,id})).records[0];
    if (!before) fail('OUT_OF_SCOPE','Record is missing or outside approved scope.');
    if (this.work && !this.work.supervisor && object === 'company' && !(await this.assignedPortfolio()).operationalCompanyIds.includes(id)) fail('OUT_OF_SCOPE', 'Claim a specific responsibility before changing a shared pool account.');
    if (this.work && !this.work.supervisor && object === 'opportunity' && before.ownerId !== this.work.memberId) fail('OUT_OF_SCOPE', 'Shared discovery permits reading this opportunity, not changing another executive’s pursuit.');
    if (this.work && !this.work.supervisor && object === 'task' && before.assigneeId !== this.work.memberId) fail('OUT_OF_SCOPE', 'A task’s assignee is independent of its account. Changing another executive’s task requires the team lead.');
    if (before.updatedAt!==expectedUpdatedAt) fail('CONFLICT','Human or concurrent CRM edit changed the record; refresh and review the proposal.');
    const [type,plural]=config[object];
    const result=await this.request(`mutation CoachPatch($data:${type}UpdateInput!,$filter:${type}FilterInput!){update${plural[0].toUpperCase()+plural.slice(1)}(data:$data,filter:$filter){${this.recordSelection(object)}}}`,{data,filter:{and:[{id:{eq:id}},{updatedAt:{eq:expectedUpdatedAt}}]}});
    this.invalidatePortfolio();
    if(result[`update${plural[0].toUpperCase()+plural.slice(1)}`]?.length!==1) fail('CONFLICT','Concurrent CRM change prevented the patch; refresh before review.');
    const record=(await this.read({object,id})).records[0];
    if(!record) fail('READBACK_FAILED','Updated CRM record could not be read back.');
    return {record,before};
  }
}
