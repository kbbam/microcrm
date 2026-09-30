import { randomUUID } from 'node:crypto';
import { ContextStore, changeDigest } from './store.mjs';

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
    return this.adapter.read(args);
  }
  async context({ accountId, refresh = true }) {
    let coverage = [];
    if (refresh && this.adapter) {
      for (const object of ['company', 'person', 'opportunity', 'note', 'task']) {
        const found = [];
        let exhausted = false;
        try {
          let offset = 0;
          for (;;) {
            const result = await this.adapter.read({ object, ...(object === 'company' ? { id: accountId } : { companyId: accountId }), limit: 100, offset });
            for (const record of result.records) { found.push(record.id); await this.store.rememberCRM(accountId, object, record); }
            coverage.push({ object, ...result.coverage });
            if (!result.coverage.hasNextPage || !result.records.length) { exhausted = result.coverage.scopeComplete !== false; break; }
            offset += result.records.length;
            if (offset >= 1000) { coverage.push({ object, complete: false, error: 'Additional records remain; request targeted context' }); break; }
          }
          if (exhausted) await this.store.crmUnavailable(accountId, object, found, 'Record was not returned by complete authorized refresh; prior state retained as historical evidence');
        } catch (error) { coverage.push({ object, complete: false, error: error.message }); await this.store.crmUnavailable(accountId, object, found, 'Refresh failed; previous values are unverified historical context'); }
      }
    }
    const account = await this.store.account(accountId);
    const ids = [...new Set(account.entries.flatMap(e => e.sourceIds ?? []))];
    return { account, sources: await this.store.sources(ids), coverage, refreshAttempted: refresh && !!this.adapter, refreshed: refresh && !!this.adapter && coverage.every(c => !c.error && c.scopeComplete !== false && c.hasNextPage !== true) };
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
    if (change.state === 'applied') return change;
    if (!['ready', 'confirmed', 'applying', 'uncertain'].includes(change.state)) throw new Error('Matching trusted human confirmation required');
    if (!this.adapter) return this.store.putChange({ ...change, state: 'blocked', error: 'CRM connection not configured', errorCode: 'NOT_CONFIGURED' });
    if (['uncertain', 'applying'].includes(change.state) && change.recordId) {
      const current = (await this.adapter.read({ object: change.object, id: change.recordId })).records[0];
      if (current && Object.entries(change.values).every(([field, value]) => changeDigest(current[field]) === changeDigest(value))) {
        await this.store.rememberCRM(change.accountId, change.object, current);
        return this.store.putChange({ ...change, state: 'applied', reconciled: true, appliedAt: new Date().toISOString() });
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
      return this.store.putChange({ ...change, state: 'applied', recordId: result.record.id, appliedAt: new Date().toISOString() });
    } catch (error) {
      const noEffect = ['WRITES_DISABLED', 'SCOPE_REQUIRED', 'OUT_OF_SCOPE', 'CONFLICT', 'BASELINE_REQUIRED', 'FORBIDDEN_FIELD', 'READ_ONLY_OBJECT', 'INVALID_STAGE', 'PIPELINE_SETUP_REQUIRED', 'INVALID_VALUES', 'INVALID_ID', 'UNSUPPORTED_OBJECT'];
      return this.store.putChange({ ...change, state: noEffect.includes(error.code) ? 'blocked' : 'uncertain', error: error.message, errorCode: error.code ?? null });
    }
  }
  // Called only by the trusted human CLI, never registered as an agent tool.
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
