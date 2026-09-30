import { mkdir, readFile, writeFile, rename, appendFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const hash = value => createHash('sha256').update(value).digest('hex');
const key = value => {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(value)) throw new Error('Invalid stable identifier');
  return value;
};
const canonical = value => JSON.stringify(value, (_, v) => v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v) ?? 'undefined';
export const changeDigest = value => hash(canonical(value));

export class ContextStore {
  constructor(directory, actor) {
    this.directory = resolve(directory);
    if (!actor?.id || !['executive', 'leader', 'admin'].includes(actor.role)) throw new Error('Trusted actor configuration required');
    this.actor = actor;
  }
  async init() {
    for (const child of ['', 'accounts', 'sources', 'changes']) await mkdir(join(this.directory, child), { recursive: true, mode: 0o700 });
  }
  async save(file, value) {
    const temp = `${file}.${randomUUID()}.tmp`;
    await writeFile(temp, JSON.stringify(value, null, 2), { mode: 0o600 });
    await rename(temp, file);
  }
  async journal(event) {
    await appendFile(join(this.directory, 'runs.jsonl'), `${JSON.stringify({ ...event, actor: this.actor, at: new Date().toISOString() })}\n`, { mode: 0o600 });
  }
  async source({ sourceKey, text, kind = 'submitted', occurredAt, location }) {
    if (!sourceKey || typeof text !== 'string' || !text.trim()) throw new Error('Source key and nonempty original text required');
    const id = hash(`${sourceKey}\0${text}`);
    const file = join(this.directory, 'sources', `${id}.json`);
    try { return { ...(JSON.parse(await readFile(file, 'utf8'))), duplicate: true }; }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
    const source = { id, sourceKey, text, kind, occurredAt: occurredAt ?? null, location: location ?? null, capturedAt: new Date().toISOString(), actor: this.actor };
    await this.save(file, source);
    await this.journal({ type: 'source', id });
    return source;
  }
  async sources(ids) {
    if (!Array.isArray(ids)) throw new Error('Source IDs must be a list');
    return Promise.all(ids.map(id => readFile(join(this.directory, 'sources', `${key(id)}.json`), 'utf8').then(JSON.parse)));
  }
  async listSources() {
    const files = (await readdir(join(this.directory, 'sources'))).filter(f => f.endsWith('.json'));
    const sources = await Promise.all(files.map(f => readFile(join(this.directory, 'sources', f), 'utf8').then(JSON.parse)));
    return sources.map(({ id, sourceKey, kind, capturedAt }) => ({ id, sourceKey, kind, capturedAt }));
  }
  async account(id, title) {
    const file = join(this.directory, 'accounts', `${key(id)}.json`);
    try { return JSON.parse(await readFile(file, 'utf8')); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
    return { id, title: title || id, entries: [], crm: {}, createdAt: new Date().toISOString() };
  }
  async update({ accountId, title, entries }) {
    if (!Array.isArray(entries) || !entries.length) throw new Error('At least one context entry required');
    const account = await this.account(accountId, title);
    if (title) account.title = title;
    const kinds = ['goal', 'narrative', 'social', 'objection', 'activity', 'commitment', 'opportunity', 'gap', 'signal', 'note'];
    for (const entry of entries) {
      if (!kinds.includes(entry.kind) || !entry.text?.trim()) throw new Error('Context entry needs a supported kind and text');
      if (!['fact', 'inference', 'human-account', 'unknown'].includes(entry.status)) throw new Error('Context epistemic status required');
      if (!entry.sourceIds?.length && entry.status !== 'unknown') throw new Error('Facts, inference and human accounts require source provenance');
      await this.sources(entry.sourceIds ?? []);
      const digest = changeDigest(entry);
      if (account.entries.some(existing => existing.digest === digest)) continue;
      const id = entry.id ? key(entry.id) : randomUUID();
      const versions = account.entries.filter(existing => existing.id === id);
      account.entries.push({ ...entry, id, digest, revision: versions.length + 1, actor: this.actor, recordedAt: new Date().toISOString() });
    }
    account.updatedAt = new Date().toISOString();
    await this.save(join(this.directory, 'accounts', `${key(accountId)}.json`), account);
    await this.journal({ type: 'account-update', accountId, entries: account.entries.length });
    return account;
  }
  async rememberCRM(accountId, object, record) {
    const account = await this.account(accountId);
    const pointer = `${object}:${record.id}`;
    if (changeDigest(account.crm[pointer]?.record ?? {}) === changeDigest(record)) {
      account.crm[pointer] = { ...account.crm[pointer], available: true, lastVerifiedAt: new Date().toISOString(), unavailableReason: null };
      await this.save(join(this.directory, 'accounts', `${key(accountId)}.json`), account);
      return { changed: false };
    }
    const source = await this.source({ sourceKey: `twenty:${pointer}:${record.updatedAt ?? changeDigest(record)}`, text: JSON.stringify(record), kind: 'crm', occurredAt: record.updatedAt });
    const previous = account.crm[pointer];
    account.crm[pointer] = { record, observedAt: new Date().toISOString(), lastVerifiedAt: new Date().toISOString(), available: true, sourceId: source.id };
    account.entries.push({ id: `crm-${hash(pointer)}`, kind: 'note', text: `Current CRM ${pointer}: ${JSON.stringify(record)}`, status: 'fact', sourceIds: [source.id], revision: account.entries.filter(e => e.id === `crm-${hash(pointer)}`).length + 1, actor: this.actor, recordedAt: new Date().toISOString() });
    await this.save(join(this.directory, 'accounts', `${key(accountId)}.json`), account);
    await this.journal({ type: 'crm-refresh', accountId, pointer, previousUpdatedAt: previous?.record?.updatedAt ?? null, currentUpdatedAt: record.updatedAt ?? null });
    return { changed: true, sourceId: source.id };
  }
  async crmUnavailable(accountId, object, currentIds, reason) {
    const account = await this.account(accountId);
    for (const [pointer, state] of Object.entries(account.crm)) {
      if (pointer.startsWith(`${object}:`) && !currentIds.includes(state.record.id)) {
        state.available = false;
        state.unavailableReason = reason;
      }
    }
    await this.save(join(this.directory, 'accounts', `${key(accountId)}.json`), account);
  }
  async search(query = '') {
    const files = await readdir(join(this.directory, 'accounts'));
    const accounts = await Promise.all(files.filter(f => f.endsWith('.json')).map(f => readFile(join(this.directory, 'accounts', f), 'utf8').then(JSON.parse)));
    return accounts.filter(a => `${a.title} ${a.id}`.toLowerCase().includes(query.toLowerCase())).map(a => ({ id: a.id, title: a.title, entries: a.entries.length }));
  }
  async observation(event) {
    if (!event.observation?.trim()) throw new Error('Observation text required');
    if (!event.sourceIds?.length) throw new Error('Observation source provenance required');
    await this.sources(event.sourceIds);
    key(event.accountId);
    const observation = { ...event, id: changeDigest(event), actor: this.actor, recordedAt: new Date().toISOString() };
    const current = await this.observations();
    if (!current.some(item => item.id === observation.id)) await appendFile(join(this.directory, 'coaching.jsonl'), `${JSON.stringify(observation)}\n`, { mode: 0o600 });
    return observation;
  }
  async observations() {
    try { return (await readFile(join(this.directory, 'coaching.jsonl'), 'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse); }
    catch (e) { if (e.code === 'ENOENT') return []; throw e; }
  }
  async report() {
    if (!['leader', 'admin'].includes(this.actor.role)) throw new Error('Leader/admin access required');
    return { observations: await this.observations(), accounts: await Promise.all((await this.search()).map(a => this.account(a.id))), sourceAccess: 'Full retained context; no subject-matter redaction', performanceVerdict: null };
  }
  async putChange(change) {
    await this.save(join(this.directory, 'changes', `${key(change.id)}.json`), change);
    await this.journal({ type: 'crm-proposal', id: change.id, state: change.state });
    return change;
  }
  async change(id) { return JSON.parse(await readFile(join(this.directory, 'changes', `${key(id)}.json`), 'utf8')); }
  async changes() {
    return Promise.all((await readdir(join(this.directory, 'changes'))).filter(f => f.endsWith('.json')).map(f => readFile(join(this.directory, 'changes', f), 'utf8').then(JSON.parse)));
  }
}
