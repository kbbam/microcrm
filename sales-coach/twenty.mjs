import { createHash } from 'node:crypto';

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
};
const aliases = Object.fromEntries(Object.entries(config).flatMap(([k,v]) => [[k,k],[v[1],k]]));
const kind = object => aliases[object] ?? fail('UNSUPPORTED_OBJECT', 'This CRM object is outside the coach tool boundary.');
const selection = object => `id createdAt updatedAt ${config[object][2]}`;
const stableTargetId = (object,id,companyId) => {
  const hex = createHash('sha256').update(`${object}:${id}:${companyId}`).digest('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-5${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
};

/** A fixed-template, account-scoped Twenty transport. The runner owns consequence review. */
export class TwentyAdapter {
  constructor({ baseUrl, apiKey, fetchImpl = fetch, writeEnabled = false, scopeCompanyIds = [], scopeMode = 'accounts', externalEffectsReviewed = false }) {
    const url = new URL(baseUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) fail('INVALID_URL', 'Invalid CRM base URL.');
    this.baseUrl = url.href.replace(/\/$/, '').replace(/\/(graphql|metadata)$/, '');
    this.apiKey = apiKey; this.fetch = fetchImpl;
    this.writeEnabled = writeEnabled === true; this.externalEffectsReviewed = externalEffectsReviewed === true;
    if (!['accounts','workspace'].includes(scopeMode)) fail('INVALID_SCOPE_MODE','Use accounts scope or explicitly authorized isolated workspace scope.');
    // Trusted deployment configuration, never an argument supplied by the model.
    this.scopeMode=scopeMode;
    this.scope = [...new Set(scopeCompanyIds.map(uuid))];
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
    const result = await this.request('{ stage: __type(name: "OpportunityStageEnum") { enumValues { name } } query: __type(name: "Query") { fields { name } } mutation: __type(name: "Mutation") { fields { name } } }');
    return { stages: result.stage?.enumValues?.map(v => v.name) ?? [], readableObjects: Object.keys(config).filter(o => result.query?.fields?.some(f => f.name === config[o][1])), pipelineCompatible: stages.every(s => result.stage?.enumValues?.some(v => v.name === s)) };
  }
  accountScope(companyId) {
    if (this.scopeMode==='workspace') return companyId ? [uuid(companyId)] : null;
    if (!this.scope.length) fail('SCOPE_REQUIRED', 'Configure approved company IDs before CRM access.');
    if (companyId && !this.scope.includes(uuid(companyId))) fail('OUT_OF_SCOPE', 'Company is outside approved pilot scope.');
    return companyId ? [companyId] : this.scope;
  }
  async page(object, filter, limit, offset = 0) {
    const [type, plural] = config[object];
    const data = await this.request(`query CoachRead($filter:${type}FilterInput!, $limit:Int!, $offset:Int!){${plural}(filter:$filter,first:$limit,offset:$offset){edges{node{${selection(object)}}}pageInfo{hasNextPage endCursor}totalCount}}`, { filter, limit, offset });
    const c = data[plural];
    if (!c || !Array.isArray(c.edges) || !c.pageInfo) fail('CRM_RESPONSE', 'CRM returned an invalid connection.');
    return { records: c.edges.map(e => e.node), coverage: { returned: c.edges.length, totalCount: c.totalCount, hasNextPage: c.pageInfo.hasNextPage, endCursor: c.pageInfo.endCursor, complete: offset === 0 && !c.pageInfo.hasNextPage, limit, offset } };
  }
  async collect(object, filter) {
    if (!filter) return {records:[],complete:true};
    const records = []; let complete = false;
    for (let offset = 0; offset < 1000; offset += 100) {
      const page = await this.page(object, filter, 100, offset); records.push(...page.records);
      if (!page.coverage.hasNextPage) { complete = true; break; }
    }
    return { records, complete };
  }
  async scopeFilter(object, companyIds) {
    if (companyIds===null) return {filter:{},complete:true};
    if (object === 'company') return { filter: { id: { in: companyIds } }, complete: true };
    if (['person','opportunity'].includes(object)) return { filter: { companyId: { in: companyIds } }, complete: true };
    if (object.endsWith('Target')) {
      // Include contact- and pursuit-linked records without reading other accounts.
      const people = await this.collect('person', { companyId: { in: companyIds } });
      const opportunities = await this.collect('opportunity', { companyId: { in: companyIds } });
      return { filter: { or: [{ targetCompanyId: { in: companyIds } }, ...(people.records.length ? [{ targetPersonId: { in: people.records.map(r=>r.id) } }] : []), ...(opportunities.records.length ? [{ targetOpportunityId: { in: opportunities.records.map(r=>r.id) } }] : [])] }, complete: people.complete && opportunities.complete };
    }
    const mapping = { note: ['noteTarget','noteId'], task: ['taskTarget','taskId'], message: ['messageThreadTarget','messageThreadId'], calendarEvent: ['calendarEventTarget','calendarEventId'], messageParticipant: ['message','messageId'], calendarEventParticipant: ['calendarEvent','calendarEventId'] };
    const [parent, field] = mapping[object]; const scope = await this.scopeFilter(parent, companyIds);
    const related = await this.collect(parent, scope.filter);
    const ids = related.records.map(r => parent.endsWith('Target') ? r[field] : r.id).filter(Boolean);
    return { filter: ids.length ? { [object === 'message' ? 'messageThreadId' : object.endsWith('Participant') ? field : 'id']: { in: [...new Set(ids)] } } : null, complete: scope.complete && related.complete };
  }
  async read({ object, id, companyId, limit = 50, offset = 0 }) {
    object = kind(object); const companies = this.accountScope(companyId);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0 || offset > 10000) fail('INVALID_BOUND', 'Read limit must be 1–100 and offset 0–10000.');
    if (id) uuid(id);
    const scope = await this.scopeFilter(object, companies);
    const result = scope.filter ? await this.page(object, id ? { and: [scope.filter, { id: { eq: id } }] } : scope.filter, id ? 1 : limit, offset) : {records:[],coverage:{returned:0,totalCount:0,hasNextPage:false,endCursor:null,complete:offset===0,limit,offset}};
    result.coverage.scopeComplete = scope.complete;
    result.coverage.complete &&= scope.complete;
    if (!scope.complete) result.coverage.warning = 'Account relationship discovery reached its 1000-record bound; context coverage is partial.';
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
    for (const field of Object.keys(values)) if (!allowed.has(field)) fail('FORBIDDEN_FIELD', `Field ${field} is outside the internal projection boundary.`);
    for (const [field,value] of Object.entries(values)) {
      if (field === 'id' || field.endsWith('Id')) { if (value !== null) uuid(value); }
      if (typeof value === 'string' && value.length > 100000) fail('INVALID_VALUES', 'CRM text exceeds the supported bound.');
    }
    if (object === 'opportunity' && (create || 'stage' in values)) {
      if (!stages.includes(values.stage)) fail('INVALID_STAGE', 'Use APPROACHING, ENGAGED, COMMERCIAL, WON or LOST with evidence-based judgment.');
      if (!(await this.metadata()).pipelineCompatible) fail('PIPELINE_SETUP_REQUIRED', 'Native opportunity stage metadata must contain all five coach commercial states before stage writes.');
    }
    if (values.companyId) this.accountScope(values.companyId);
    if (values.targetCompanyId) this.accountScope(values.targetCompanyId);
    for (const [field,related] of [['pointOfContactId','person'],['targetPersonId','person'],['targetOpportunityId','opportunity'],['noteId','note'],['taskId','task']]) {
      if (values[field] && !(await this.read({object:related,id:values[field]})).records.length) fail('OUT_OF_SCOPE', 'Related CRM record is outside approved account scope.');
    }
    return { ...values };
  }
  async create({ object, values }) {
    this.writeGuard(); object = kind(object); const data = await this.values(object,values,true);
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
        if (record && Object.entries(data).some(([k,v])=>JSON.stringify(record[k])!==JSON.stringify(v))) fail('ID_COLLISION','Stable ID already exists with different content; reconcile before retry.');
      }
      if (!record) {
        const [type] = config[object];
        const result = await this.request(`mutation CoachCreate($data:${type}CreateInput!){create${type}(data:$data){${selection(object)}}}`,{data}); record = result[`create${type}`];
      }
    } else if (Object.entries(data).some(([k,v])=>JSON.stringify(record[k])!==JSON.stringify(v))) fail('ID_COLLISION','Stable ID already exists with different content; reconcile before retry.');
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
    if (before.updatedAt!==expectedUpdatedAt) fail('CONFLICT','Human or concurrent CRM edit changed the record; refresh and review the proposal.');
    const [type,plural]=config[object];
    const result=await this.request(`mutation CoachPatch($data:${type}UpdateInput!,$filter:${type}FilterInput!){update${plural[0].toUpperCase()+plural.slice(1)}(data:$data,filter:$filter){${selection(object)}}}`,{data,filter:{and:[{id:{eq:id}},{updatedAt:{eq:expectedUpdatedAt}}]}});
    if(result[`update${plural[0].toUpperCase()+plural.slice(1)}`]?.length!==1) fail('CONFLICT','Concurrent CRM change prevented the patch; refresh before review.');
    const record=(await this.read({object,id})).records[0];
    if(!record) fail('READBACK_FAILED','Updated CRM record could not be read back.');
    return {record,before};
  }
}
