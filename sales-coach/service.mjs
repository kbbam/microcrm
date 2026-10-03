import { randomUUID, createHash } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { ContextStore, changeDigest, accountDisplayTitle, matchesSuppliedValue } from './store.mjs';

export class CoachService {
  constructor({ contextDir, actor, adapter, enforceRetainedScope = false, authorizeAccount }) {
    this.store = new ContextStore(contextDir, actor);
    this.adapter = adapter;
    this.actor = actor;
    this.enforceRetainedScope = enforceRetainedScope;
    this.accountAuthorizer = authorizeAccount;
    this.authorizationScope = new AsyncLocalStorage();
    if (adapter) adapter.authorizationScope = this.authorizationScope;
    this.pending = Promise.resolve();
  }
  async init() { await this.store.init(); return this; }
  serial(operation) {
    // Only one tool operation may share current authority results. The next
    // operation starts empty, including on reconnect/restart and after errors.
    const task = this.pending.then(() => this.authorizationScope.run({ accounts: new Map(), providers: new Map() }, operation));
    this.pending = task.catch(() => {});
    return task;
  }
  async authorizeAccount(accountId, options = {}) {
    if (!this.enforceRetainedScope) return true;
    const cache = this.authorizationScope.getStore()?.accounts;
    const key = `${accountId}:${!!options.createCompany}`;
    if (cache?.has(key)) return cache.get(key);
    const result = this.checkAccountAuthorization(accountId, options);
    cache?.set(key, result);
    return result;
  }
  async checkAccountAuthorization(accountId, options) {
    try {
      if (this.accountAuthorizer) {
        if (await this.accountAuthorizer(accountId, options) !== true) throw Object.assign(new Error('Account is outside current authorized scope'), { code: 'OUT_OF_SCOPE' });
      } else {
        if (!this.adapter) throw new Error('CRM scope authority unavailable');
        const result = await this.adapter.read({ object: 'company', companyId: accountId, id: accountId, limit: 1 });
        if (result.coverage?.scopeComplete === false || result.coverage?.complete === false) throw new Error('CRM scope authority incomplete');
        if (!result.records?.some(record => record.id === accountId)) throw Object.assign(new Error('Account is outside current authorized scope'), { code: 'OUT_OF_SCOPE' });
      }
      return true;
    } catch (error) {
      if (error.code === 'OUT_OF_SCOPE') throw error;
      throw Object.assign(new Error('Current account authorization unavailable'), { code: 'RETAINED_SCOPE_UNAVAILABLE', cause: error });
    }
  }
  async searchAccounts(query) {
    const accounts = await this.store.search(query);
    if (!this.enforceRetainedScope) return accounts;
    const permitted = [];
    for (const account of accounts) {
      try { await this.authorizeAccount(account.id); permitted.push(account); }
      catch (error) { if (error.code !== 'OUT_OF_SCOPE') throw error; }
    }
    return permitted;
  }
  async sourceAssociations() {
    const associations = new Map();
    const add = (sourceId, accountId) => { if (!associations.has(sourceId)) associations.set(sourceId, new Set()); associations.get(sourceId).add(accountId); };
    for (const summary of await this.store.search()) {
      const account = await this.store.account(summary.id);
      for (const entry of account.entries) for (const sourceId of entry.sourceIds ?? []) add(sourceId, account.id);
      for (const state of Object.values(account.crm)) if (state.sourceId) add(state.sourceId, account.id);
    }
    for (const item of [...await this.store.observations(), ...await this.store.changes()]) {
      // A proposed genuinely new company is not yet an authorized account.
      // Its original remains protected by actor/provider authority until the
      // guarded creation succeeds and attaches a real assigned CRM record.
      if (item.object === 'company' && !item.recordId) continue;
      for (const sourceId of item.sourceIds ?? []) add(sourceId, item.accountId);
    }
    return associations;
  }
  async authorizedContext(account) {
    if (!this.enforceRetainedScope) return { account, omittedEntries: 0, omittedCRMRecords: 0 };
    const associations = await this.sourceAssociations();
    const ids = [...new Set([...account.entries.flatMap(entry => entry.sourceIds ?? []), ...Object.values(account.crm).map(state => state.sourceId).filter(Boolean)])];
    const allowed = new Set();
    const sourceAccessIssues = [];
    for (const source of await this.store.sources(ids)) {
      try { await this.authorizeSource(source, associations); allowed.add(source.id); }
      catch (error) {
        if (error.code !== 'OUT_OF_SCOPE' && error.code !== 'RETAINED_SCOPE_UNAVAILABLE') throw error;
        if (error.code === 'RETAINED_SCOPE_UNAVAILABLE') sourceAccessIssues.push({ sourceId: source.id, code: error.cause?.code ?? error.code, reason: error.cause?.code === 'SOURCE_CONNECTION_REQUIRED' ? 'Connect your Twenty email and calendar through Business OS source setup. Affected retained evidence is withheld until current access is verified.' : 'Current source access could not be verified. Affected retained evidence is withheld; authorized CRM records remain available.' });
      }
    }
    const permittedRecord = async (object, recordId) => {
      if (!this.adapter) throw Object.assign(new Error('Current record authorization unavailable'), { code: 'RETAINED_SCOPE_UNAVAILABLE' });
      const cache = this.authorizationScope.getStore()?.providers;
      const key = `${object}:${recordId}`;
      if (!cache?.has(key)) cache?.set(key, this.adapter.read({ object, id: recordId, limit: 1 }));
      const result = await (cache?.get(key) ?? this.adapter.read({ object, id: recordId, limit: 1 }));
      if (result.coverage?.scopeComplete === false || result.coverage?.complete === false) throw Object.assign(new Error('Current record authorization incomplete'), { code: 'RETAINED_SCOPE_UNAVAILABLE' });
      return result.records?.some(record => record.id === recordId);
    };
    const entries = [];
    for (const entry of account.entries) {
      if ((entry.sourceIds ?? []).some(sourceId => !allowed.has(sourceId))) continue;
      let permitted = true;
      for (const opportunityId of [...entry.association?.opportunityIds ?? [], ...entry.association?.candidateOpportunityIds ?? []]) {
        if (!await permittedRecord('opportunity', opportunityId)) { permitted = false; break; }
      }
      if (permitted) entries.push(entry);
    }
    const crm = {};
    for (const [pointer, state] of Object.entries(account.crm)) {
      if (state.sourceId ? allowed.has(state.sourceId) : await permittedRecord(pointer.split(':')[0], state.record.id)) crm[pointer] = state;
    }
    return { account: { ...account, entries, crm }, omittedEntries: account.entries.length - entries.length, omittedCRMRecords: Object.keys(account.crm).length - Object.keys(crm).length, sourceAccessIssues };
  }
  async authorizeSource(source, associations) {
    if (!this.enforceRetainedScope) return;
    // Association is derived from durable records, never just caller metadata.
    // All historical links count: revocation cannot be bypassed by unlinking a
    // latest interpretation or repeating retain_source with the same bytes.
    const metadataVersions = [source.metadata, ...(source.metadataHistory ?? []).map(version => version.metadata)];
    const links = new Set([
      ...metadataVersions.flatMap(metadata => [metadata?.accountId, ...(metadata?.accountIds ?? [])]),
      ...(associations ?? await this.sourceAssociations()).get(source.id) ?? [],
    ].filter(Boolean));
    for (const accountId of links) await this.authorizeAccount(accountId);
    const provider = /^twenty:([^:]+):([^:]+)(?::|$)/.exec(source.sourceKey);
    if (provider) {
      if (!this.adapter) throw Object.assign(new Error('Current source authorization unavailable'), { code: 'RETAINED_SCOPE_UNAVAILABLE' });
      let current;
      try {
        const cache = this.authorizationScope.getStore()?.providers;
        const key = `${provider[1]}:${provider[2]}`;
        if (!cache?.has(key)) {
          const result = this.adapter.read({ object: provider[1], id: provider[2], limit: 1 });
          cache?.set(key, result);
          current = await result;
        } else current = await cache.get(key);
      }
      catch (cause) { throw Object.assign(new Error('Current source authorization unavailable'), { code: cause.code === 'OUT_OF_SCOPE' ? 'OUT_OF_SCOPE' : 'RETAINED_SCOPE_UNAVAILABLE', cause }); }
      if (current.coverage?.scopeComplete === false || current.coverage?.complete === false) throw Object.assign(new Error('Current source authorization incomplete'), { code: 'RETAINED_SCOPE_UNAVAILABLE' });
      if (current.coverage?.contentAccessUnrestricted === false) throw Object.assign(new Error('Provider no longer authorizes the retained communication content'), { code: 'OUT_OF_SCOPE' });
      if (!current.records?.some(record => record.id === provider[2])) throw Object.assign(new Error('Source is outside current authorized scope'), { code: 'OUT_OF_SCOPE' });
    } else if (!links.size && source.actor?.id !== this.actor.id) throw Object.assign(new Error('Unassociated source belongs to another actor'), { code: 'OUT_OF_SCOPE' });
  }
  async sources(ids) {
    const sources = await this.store.sources(ids);
    const associations = this.enforceRetainedScope && sources.length ? await this.sourceAssociations() : undefined;
    for (const source of sources) await this.authorizeSource(source, associations);
    return sources;
  }
  async listSources() {
    const summaries = await this.store.listSources();
    if (!this.enforceRetainedScope) return summaries;
    const permitted = [];
    const associations = await this.sourceAssociations();
    for (const summary of summaries) {
      try { await this.authorizeSource((await this.store.sources([summary.id]))[0], associations); permitted.push(summary); }
      catch (error) { if (error.code !== 'OUT_OF_SCOPE') throw error; }
    }
    return permitted;
  }
  async changes() {
    const changes = await this.store.changes();
    if (!this.enforceRetainedScope) return changes;
    const permitted = [];
    for (const change of changes) {
      try { await this.authorizeAccount(change.accountId, { createCompany: change.object === 'company' && !change.recordId }); await this.sources(change.sourceIds ?? []); permitted.push(change); }
      catch (error) { if (error.code !== 'OUT_OF_SCOPE') throw error; }
    }
    return permitted;
  }
  async retainSource(args, { provider = false } = {}) {
    if (this.enforceRetainedScope) {
      if (!provider && (/^twenty:/.test(args.sourceKey) || ['crm', 'email', 'calendar'].includes(args.kind))) throw Object.assign(new Error('Provider sources must be retained through authorized CRM reads'), { code: 'OUT_OF_SCOPE' });
      for (const accountId of [args.metadata?.accountId, ...(args.metadata?.accountIds ?? [])].filter(Boolean)) await this.authorizeAccount(accountId);
      const id = createHash('sha256').update(`${args.sourceKey}\0${args.text}`).digest('hex');
      try { await this.sources([id]); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    return this.store.source(args);
  }
  async observation(args) {
    await this.authorizeAccount(args.accountId);
    await this.sources(args.sourceIds ?? []);
    return this.store.observation(args);
  }
  async report() {
    if (!['leader', 'admin'].includes(this.actor.role)) throw new Error('Leader/admin access required');
    if (!this.enforceRetainedScope) return this.store.report();
    const summaries = await this.searchAccounts();
    const allowed = new Set(summaries.map(account => account.id));
    const observations = [];
    for (const item of await this.store.observations()) if (allowed.has(item.accountId)) { await this.sources(item.sourceIds ?? []); observations.push(item); }
    return { observations, accounts: await Promise.all(summaries.map(account => this.context({ accountId: account.id, refresh: false }).then(result => result.account))), sourceAccess: 'Current authorized account scope', performanceVerdict: null };
  }
  async read(args) {
    if (!this.adapter) throw new Error('CRM connection not configured');
    const { includeThreadContext, ...query } = args;
    if (!includeThreadContext) return this.adapter.read(query);
    if (query.object !== 'message' || !(query.subjectContains || query.messageThreadId || query.id)) throw new Error('Thread context needs a targeted message query');
    const discovery = await this.adapter.read(query);
    const threadIds = [...new Set(discovery.records.map(record => record.messageThreadId).filter(Boolean))];
    if (query.subjectContains && !query.messageThreadId && discovery.coverage.hasNextPage) return { ...discovery,
      threadContext: { status: 'discovery-incomplete', candidateThreadIds: threadIds } };
    // Never broaden an ambiguous subject into several unrelated conversations.
    if (threadIds.length !== 1 || discovery.coverage.scopeComplete === false) return { ...discovery,
      threadContext: { status: threadIds.length > 1 ? 'ambiguous' : 'unavailable', candidateThreadIds: threadIds } };
    const messageThreadId = threadIds[0];
    const collect = async object => {
      const records = [], pages = [];
      let offset = 0;
      for (;;) {
        const page = await this.adapter.read({ object, messageThreadId, limit: 100, offset });
        records.push(...page.records);
        pages.push(page.coverage);
        if (!page.coverage.hasNextPage || !page.records.length || records.length >= 1000) break;
        offset += page.records.length;
      }
      const final = pages.at(-1);
      return { records, coverage: { ...final, returned: records.length, complete: !final.hasNextPage && pages.every(page => page.scopeComplete !== false), pages } };
    };
    const [messages, participants] = await Promise.all([collect('message'), collect('messageParticipant')]);
    return { ...discovery, ...messages, threadContext: { status: 'retrieved', messageThreadId, discoveryCoverage: discovery.coverage, participants } };
  }
  async context({ accountId, refresh = true, brief = false }) {
    await this.authorizeAccount(accountId);
    let coverage = [];
    if (refresh && this.adapter) {
      // Provider queries are independent. Fetch concurrently, but commit each
      // result serially so file-backed account history never loses an update.
      const refreshedObjects = await Promise.all(['company', 'person', 'opportunity', 'note', 'task'].map(async object => {
        const records = [], objectCoverage = [];
        let exhausted = false;
        let failure;
        try {
          let offset = 0;
          for (;;) {
            const result = await this.adapter.read({ object, ...(object === 'company' ? { id: accountId } : { companyId: accountId }), limit: 100, offset });
            records.push(...result.records);
            objectCoverage.push({ object, ...result.coverage });
            if (!result.records.length && result.coverage.hasNextPage) {
              objectCoverage.push({ object, complete: false, error: 'Empty page reports additional records; refresh is incomplete' });
              break;
            }
            if (!result.coverage.hasNextPage) { exhausted = result.coverage.scopeComplete !== false; break; }
            offset += result.records.length;
            if (offset >= 1000) { objectCoverage.push({ object, complete: false, error: 'Additional records remain; request targeted context' }); break; }
          }
        } catch (error) {
          failure = error.message;
          objectCoverage.push({ object, complete: false, error: failure });
        }
        return { object, records, objectCoverage, exhausted, failure };
      }));
      for (const { object, records, objectCoverage, exhausted, failure } of refreshedObjects) {
        coverage.push(...objectCoverage);
        for (const record of records) await this.store.rememberCRM(accountId, object, record);
        const found = records.map(record => record.id);
        if (failure || exhausted) await this.store.crmUnavailable(accountId, object, found, failure
          ? 'Refresh failed; previous values are unverified historical context'
          : 'Record was not returned by complete authorized refresh; prior state retained as historical evidence');
      }
    }
    await this.authorizeAccount(accountId);
    const account = await this.store.account(accountId);
    const authorized = await this.authorizedContext(account);
    let view = authorized.account;
    if (authorized.omittedEntries || authorized.omittedCRMRecords) coverage.push({ object: 'retained-context', complete: false, omittedEntries: authorized.omittedEntries, omittedCRMRecords: authorized.omittedCRMRecords, reason: 'Historical records outside current access are retained in storage and omitted from this view.' });
    if (authorized.sourceAccessIssues?.length) coverage.push({ object: 'retained-source-authorization', complete: false, unavailableSourceChecks: authorized.sourceAccessIssues.length, issues: authorized.sourceAccessIssues });
    if (brief) {
      const latest = new Map();
      for (const entry of account.entries) latest.set(entry.id, entry);
      // Current CRM records are already in account.crm; avoid echoing the same
      // JSON inside generated context notes as well as original source text.
      view = { ...view, title: accountDisplayTitle(view), entries: [...latest.values()].filter(entry => authorized.account.entries.includes(entry) && !(entry.kind === 'note' && /^crm-[a-f0-9]{64}$/.test(entry.id) && entry.text.startsWith('Current CRM '))) };
    }
    const ids = [...new Set([...view.entries.flatMap(e => e.sourceIds ?? []), ...(brief ? Object.values(view.crm).map(state => state.sourceId).filter(Boolean) : [])])];
    const retainedSources = await this.sources(ids);
    return { account: view, sources: brief ? retainedSources.map(({ id, evidenceId, sourceKey, kind, representation, occurredAt, location, capturedAt, actor, metadata }) => ({ id, evidenceId, sourceKey, kind, representation, occurredAt, location, capturedAt, actor, metadata, originalTextAvailableVia: 'get_source' })) : retainedSources,
      ...(brief ? { view: 'working', history: { retainedEntries: account.entries.length, returnedEntries: view.entries.length, fullHistoryAvailableVia: 'get_account_context with brief=false' } } : {}),
      coverage, refreshAttempted: refresh && !!this.adapter, refreshed: refresh && !!this.adapter && coverage.some(c => !['retained-context', 'retained-source-authorization'].includes(c.object)) && coverage.filter(c => !['retained-context', 'retained-source-authorization'].includes(c.object)).every(c => !c.error && c.scopeComplete !== false) };
  }
  async captureContext({ submittedSource, ...args }) {
    await this.authorizeAccount(args.accountId);
    await this.sources(args.entries.flatMap(entry => entry.sourceIds ?? []));
    if (!submittedSource) return this.store.update(args);
    // This path is for the exact typed executive statement, not OCR or a claim
    // that original attachment bytes were preserved. Identity comes from host.
    const source = await this.retainSource({ ...submittedSource, sourceKey: submittedSource.sourceKey ?? `typed:${this.actor.id}:${args.accountId}`, kind: 'executive-statement', representation: 'original-text',
      metadata: { ...(submittedSource.metadata ?? {}), accountId: args.accountId, submittedBy: this.actor.id, intake: 'typed-conversation' } });
    const before = await this.store.account(args.accountId);
    const inputs = args.entries.map(entry => ({ ...entry, sourceIds: [...new Set([...(entry.sourceIds ?? []), source.id])] }));
    const captures = inputs.map(entry => {
      const captureDigest = changeDigest(entry);
      const existing = before.entries.find(saved => saved.captureDigest === captureDigest || saved.digest === captureDigest);
      if (existing) return { captureDigest, existing };
      const previousSources = entry.id ? before.entries.filter(saved => saved.id === entry.id).flatMap(saved => saved.sourceIds ?? []) : [];
      // Incremental corrections retain the evidence lineage of carried-forward
      // details. Earlier conflicting versions remain dated history, not new
      // corroboration. Identify the input separately so a retried old capture
      // cannot revert a newer correction merely because its lineage grew.
      return { captureDigest, entry: { ...entry, captureDigest, sourceIds: [...new Set([...previousSources, ...entry.sourceIds])] } };
    });
    const entries = captures.filter(capture => capture.entry).map(capture => capture.entry);
    const account = entries.length ? await this.store.update({ ...args, entries }) : before;
    return { accountId: account.id, title: account.title, sourceId: source.id, evidenceId: source.evidenceId,
      sourceRetained: true, entries: captures.map(capture => {
        const current = capture.existing ?? account.entries.findLast(saved => saved.captureDigest === capture.captureDigest);
        return { id: current.id, revision: current.revision, kind: current.kind, status: current.status, sourceIds: current.sourceIds };
      }), originalFilePreserved: false };
  }
  async propose(args) {
    await this.authorizeAccount(args.accountId, { createCompany: args.object === 'company' && !args.id });
    if (!args.sourceIds?.length) throw new Error('CRM projection requires source provenance');
    await this.sources(args.sourceIds);
    if (!args.reason?.trim() || !['low', 'high'].includes(args.estimatedErrorCost) || typeof args.highlyConsequential !== 'boolean') throw new Error('Write consequence assessment and reason required');
    const operation = { accountId: args.accountId, object: args.object, recordId: args.id ?? null, values: args.values, expectedUpdatedAt: args.expectedUpdatedAt ?? null, ...(args.assignment ? { assignment: args.assignment } : {}) };
    const identity = { ...operation, sourceIds: args.sourceIds, estimatedErrorCost: args.estimatedErrorCost, highlyConsequential: args.highlyConsequential, reason: args.reason };
    // A new reason/source/risk label cannot bypass an existing confirmation hold.
    const id = changeDigest(operation);
    const changes = await this.store.changes();
    const existing = changes.find(c => c.id === id);
    if (existing) return existing;
    // A refreshed optimistic-lock baseline must not erase a prior consequence assessment.
    const intent = ({ accountId, object, recordId, values }) => changeDigest({ accountId, object, recordId, values });
    const previousHold = changes.find(c => c.state !== 'applied' && (c.estimatedErrorCost === 'high' || c.highlyConsequential) && intent(c) === intent(operation));
    if (previousHold) {
      identity.estimatedErrorCost = previousHold.estimatedErrorCost;
      identity.highlyConsequential = previousHold.highlyConsequential;
      identity.inheritedHoldId = previousHold.id;
    }
    const requiresConfirmation = identity.estimatedErrorCost === 'high' || identity.highlyConsequential;
    const change = { ...identity, id, createId: args.object === 'company' ? args.accountId : randomUUID(), state: requiresConfirmation ? 'awaiting-confirmation' : 'ready', proposedBy: this.actor, proposedAt: new Date().toISOString() };
    await this.store.putChange(change);
    if (!requiresConfirmation) return this.apply(change);
    return change;
  }
  async apply(change) {
    if (change.assignment) return this.applyAssignment(change);
    await this.authorizeAccount(change.accountId, { createCompany: change.object === 'company' && !change.recordId });
    await this.sources(change.sourceIds ?? []);
    if (change.state === 'applied') return change.error || change.errorCode ? this.store.putChange({ ...change, error: null, errorCode: null }) : change;
    if (!['ready', 'confirmed', 'applying', 'uncertain'].includes(change.state)) throw new Error('Matching trusted human confirmation required');
    if (!this.adapter) return this.store.putChange({ ...change, state: 'blocked', error: 'CRM connection not configured', errorCode: 'NOT_CONFIGURED' });
    if (['uncertain', 'applying'].includes(change.state) && change.recordId) {
      const current = (await this.adapter.read({ object: change.object, id: change.recordId })).records[0];
      if (current && Object.entries(change.values).every(([field, value]) => matchesSuppliedValue(current[field], value))) {
        await this.store.rememberCRM(change.accountId, change.object, current);
        return this.store.putChange({ ...change, state: 'applied', reconciled: true, appliedAt: new Date().toISOString(), error: null, errorCode: null });
      }
    }
    await this.store.putChange({ ...change, state: 'applying' });
    try {
      let result;
      if (change.recordId) {
        result = await this.adapter.update({ object: change.object, id: change.recordId, values: change.values, expectedUpdatedAt: change.expectedUpdatedAt });
      } else {
        result = await this.adapter.create({ object: change.object, values: { ...change.values, id: change.createId } });
      }
      await this.store.rememberCRM(change.accountId, change.object, result.record);
      return this.store.putChange({ ...change, state: 'applied', recordId: result.record.id, appliedAt: new Date().toISOString(), error: null, errorCode: null });
    } catch (error) {
      const noEffect = ['WRITES_DISABLED', 'SCOPE_REQUIRED', 'OUT_OF_SCOPE', 'CONFLICT', 'BASELINE_REQUIRED', 'FORBIDDEN_FIELD', 'READ_ONLY_OBJECT', 'INVALID_STAGE', 'PIPELINE_SETUP_REQUIRED', 'INVALID_VALUES', 'INVALID_ID', 'UNSUPPORTED_OBJECT', 'UNREVIEWED_EXTERNAL_EFFECT', 'ACCOUNT_MATCH_REQUIRED'];
      return this.store.putChange({ ...change, state: noEffect.includes(error.code) ? 'blocked' : 'uncertain', error: error.message, errorCode: error.code ?? null });
    }
  }
  async proposeAssignment(args) {
    if (!this.adapter?.work) throw Object.assign(new Error('Work allocation is not configured. No responsibility was changed or supervisor request filed.'), { code: 'NOT_CONFIGURED' });
    // An exact retry returns the durable original decision, including a human
    // confirmation hold. It never reads fresh private context after handoff.
    const prior = (await this.store.changes()).find(change => change.assignment && change.proposedBy.id === this.actor.id && change.accountId === args.accountId && change.object === args.object && change.recordId === args.id && change.assignment.toMemberId === args.recipientMemberId && change.expectedUpdatedAt === args.expectedUpdatedAt);
    if (prior) return prior;
    const assignment = await this.adapter.work.preview(args);
    await this.authorizeAccount(args.accountId);
    await this.sources(args.sourceIds ?? []);
    await this.store.rememberCRM(args.accountId, args.object, assignment.before);
    return this.propose({ ...args, values: { [assignment.ownerField]: assignment.toMemberId }, assignment,
      highlyConsequential: args.highlyConsequential || assignment.accountIds.length > 1,
      reason: `${assignment.responsibility} “${assignment.recordName}”: ${assignment.fromMemberLabel} → ${assignment.toMemberLabel}. Other responsibilities remain unchanged. ${assignment.accountIds.length > 1 ? `This task links ${assignment.accountIds.length} accounts (${assignment.accountIds.join(', ')}); the transfer affects all its links. ` : ''}${args.reason}` });
  }
  async applyAssignment(change) {
    if (change.proposedBy.id !== this.actor.id && !['leader', 'admin'].includes(this.actor.role)) throw Object.assign(new Error('This proposal belongs to another executive.'), { code: 'OUT_OF_SCOPE' });
    if (change.state === 'applied') return change;
    if (!['ready', 'confirmed', 'applying', 'uncertain'].includes(change.state)) throw new Error('Matching trusted human confirmation required');
    if (!this.adapter?.work) return this.store.putChange({ ...change, state: 'blocked', error: 'Work allocation is not configured', errorCode: 'NOT_CONFIGURED' });
    try {
      let result = ['applying', 'uncertain'].includes(change.state) ? await this.adapter.work.reconcile(change.assignment) : null;
      if (!result) {
        await this.authorizeAccount(change.accountId);
        await this.sources(change.sourceIds);
        await this.store.putChange({ ...change, state: 'applying' });
        result = await this.adapter.work.assign(change.assignment);
      }
      await this.store.rememberCRM(change.accountId, change.object, result.record);
      return this.store.putChange({ ...change, state: 'applied', appliedAt: new Date().toISOString(), reconciled: !!result.reconciled, error: null, errorCode: null,
        assignmentReceipt: { responsibility: change.assignment.responsibility, recordName: change.assignment.recordName, fromMemberId: change.assignment.fromMemberId, toMemberId: change.assignment.toMemberId, fromMemberLabel: change.assignment.fromMemberLabel, toMemberLabel: change.assignment.toMemberLabel, updatedAt: result.record.updatedAt, unrelatedResponsibilitiesChanged: false } });
    } catch (error) {
      const noEffect = ['OUT_OF_SCOPE', 'CONFLICT', 'WRITES_DISABLED', 'UNREVIEWED_EXTERNAL_EFFECT', 'INELIGIBLE_RECIPIENT', 'SELF_CLAIM_ONLY', 'SUPERVISOR_REQUIRED', 'SCOPE_INCOMPLETE', 'SOURCE_CONNECTION_REQUIRED', 'RETAINED_SCOPE_UNAVAILABLE'];
      return this.store.putChange({ ...change, state: noEffect.includes(error.code) ? 'blocked' : 'uncertain', error: error.message, errorCode: error.code ?? null });
    }
  }
  // Called by the authenticated human review host or trusted developer CLI;
  // never registered as an agent tool.
  async confirm(id) {
    const change = await this.store.change(id);
    if (change.state !== 'awaiting-confirmation') throw new Error('Proposal is not awaiting confirmation');
    return this.apply(await this.store.putChange({ ...change, state: 'confirmed', confirmedBy: this.actor, confirmedAt: new Date().toISOString() }));
  }
  async resume() {
    const results = [];
    for (const change of await this.store.changes()) if (['ready', 'applying', 'confirmed', 'uncertain'].includes(change.state)) results.push(await this.apply(change));
    return results;
  }
  async retry(id) {
    const change = await this.store.change(id);
    if (change.state !== 'blocked' || !['NOT_CONFIGURED', 'WRITES_DISABLED', 'PIPELINE_SETUP_REQUIRED'].includes(change.errorCode)) throw new Error('Only a resolved setup blocker may be retried; conflict/validation errors require a fresh reviewed proposal');
    if ((change.estimatedErrorCost === 'high' || change.highlyConsequential) && !change.confirmedAt) throw new Error('Matching trusted human confirmation required');
    return this.apply(await this.store.putChange({ ...change, state: change.confirmedAt ? 'confirmed' : 'ready' }));
  }
}
