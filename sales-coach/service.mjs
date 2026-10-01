import { randomUUID } from 'node:crypto';
import { ContextStore, changeDigest, accountDisplayTitle } from './store.mjs';

export class CoachService {
  constructor({ contextDir, actor, adapter }) {
    this.store = new ContextStore(contextDir, actor);
    this.adapter = adapter;
    this.actor = actor;
    this.pending = Promise.resolve();
  }
  async init() { await this.store.init(); return this; }
  serial(operation) {
    const task = this.pending.then(operation);
    this.pending = task.catch(() => {});
    return task;
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
    const account = await this.store.account(accountId);
    let view = account;
    if (brief) {
      const latest = new Map();
      for (const entry of account.entries) latest.set(entry.id, entry);
      // Current CRM records are already in account.crm; avoid echoing the same
      // JSON inside generated context notes as well as original source text.
      view = { ...account, title: accountDisplayTitle(account), entries: [...latest.values()].filter(entry => !(entry.kind === 'note' && /^crm-[a-f0-9]{64}$/.test(entry.id) && entry.text.startsWith('Current CRM '))) };
    }
    const ids = [...new Set([...view.entries.flatMap(e => e.sourceIds ?? []), ...(brief ? Object.values(account.crm).map(state => state.sourceId).filter(Boolean) : [])])];
    const retainedSources = await this.store.sources(ids);
    return { account: view, sources: brief ? retainedSources.map(({ id, evidenceId, sourceKey, kind, representation, occurredAt, location, capturedAt, actor, metadata }) => ({ id, evidenceId, sourceKey, kind, representation, occurredAt, location, capturedAt, actor, metadata, originalTextAvailableVia: 'get_source' })) : retainedSources,
      ...(brief ? { view: 'working', history: { retainedEntries: account.entries.length, returnedEntries: view.entries.length, fullHistoryAvailableVia: 'get_account_context with brief=false' } } : {}),
      coverage, refreshAttempted: refresh && !!this.adapter, refreshed: refresh && !!this.adapter && coverage.length > 0 && coverage.every(c => !c.error && c.scopeComplete !== false) };
  }
  async captureContext({ submittedSource, ...args }) {
    if (!submittedSource) return this.store.update(args);
    // This path is for the exact typed executive statement, not OCR or a claim
    // that original attachment bytes were preserved. Identity comes from host.
    const source = await this.store.source({ ...submittedSource, sourceKey: submittedSource.sourceKey ?? `typed:${this.actor.id}:${args.accountId}`, kind: 'executive-statement', representation: 'original-text',
      metadata: { ...(submittedSource.metadata ?? {}), submittedBy: this.actor.id, intake: 'typed-conversation' } });
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
    if (!args.sourceIds?.length) throw new Error('CRM projection requires source provenance');
    await this.store.sources(args.sourceIds);
    if (!args.reason?.trim() || !['low', 'high'].includes(args.estimatedErrorCost) || typeof args.highlyConsequential !== 'boolean') throw new Error('Write consequence assessment and reason required');
    const operation = { accountId: args.accountId, object: args.object, recordId: args.id ?? null, values: args.values, expectedUpdatedAt: args.expectedUpdatedAt ?? null };
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
    if (change.state === 'applied') return change.error || change.errorCode ? this.store.putChange({ ...change, error: null, errorCode: null }) : change;
    if (!['ready', 'confirmed', 'applying', 'uncertain'].includes(change.state)) throw new Error('Matching trusted human confirmation required');
    if (!this.adapter) return this.store.putChange({ ...change, state: 'blocked', error: 'CRM connection not configured', errorCode: 'NOT_CONFIGURED' });
    if (['uncertain', 'applying'].includes(change.state) && change.recordId) {
      const current = (await this.adapter.read({ object: change.object, id: change.recordId })).records[0];
      if (current && Object.entries(change.values).every(([field, value]) => changeDigest(current[field]) === changeDigest(value))) {
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
      const noEffect = ['WRITES_DISABLED', 'SCOPE_REQUIRED', 'OUT_OF_SCOPE', 'CONFLICT', 'BASELINE_REQUIRED', 'FORBIDDEN_FIELD', 'READ_ONLY_OBJECT', 'INVALID_STAGE', 'PIPELINE_SETUP_REQUIRED', 'INVALID_VALUES', 'INVALID_ID', 'UNSUPPORTED_OBJECT', 'UNREVIEWED_EXTERNAL_EFFECT'];
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
