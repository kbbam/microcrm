// Trusted host proof for the owner's reserved synthetic account only.
// No credentials, provider message/calendar writes, or metadata mutations.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadService } from '../config.mjs';
import { acquireContextLock } from '../launch.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const path = join(root, 'pilot.test.local.json');
const evidence = join(root, 'evidence', 'live-qa');
const accountId = 'bb1ba095-cc63-4ff8-97c1-7c446fe63de4';
const originals = ['406dc70ba7ef26dc1bfa01d0fba745bfe2ba70893289b4f285b7bdafcbca2c1b'];
const fixtures = [
  { object: 'company', id: accountId, values: { name: 'QA Northstar Supplies' } },
  { object: 'person', id: 'a13b1faa-6b7a-4386-9910-c9358c1ea400', values: { name: { firstName: 'Casey', lastName: 'Fixture' }, jobTitle: 'Synthetic QA buyer', companyId: accountId } },
  { object: 'note', id: '81fa9867-572a-493e-9c1d-228ad7b6ae0b', values: { title: 'QA Relationship context (synthetic)', bodyV2: { markdown: 'Synthetic QA testimony: reliability and price are combined concerns. Rich account context retains originals, uncertainty and the closed trial history.' }, companyId: accountId } },
  { object: 'task', id: 'c80c3d66-0417-48c4-9cc1-ccae86110e03', values: { title: 'QA Prepare reliability summary (synthetic)', bodyV2: { markdown: 'Synthetic QA preparation task. No email is sent, no real promise is asserted, and no invented due date is assigned.' }, status: 'TODO', companyId: accountId } },
  { object: 'opportunity', id: '533a2ee7-9c45-4b48-b2a4-b61f5aac2dd5', values: { name: 'QA Repeat-order exploration (synthetic)', stage: 'ENGAGED', companyId: accountId, pointOfContactId: 'a13b1faa-6b7a-4386-9910-c9358c1ea400' } },
];

await mkdir(evidence, { recursive: true });
let config = JSON.parse(await readFile(path, 'utf8'));
const initialWriteFlags = { writeEnabled: config.twenty?.writeEnabled, externalEffectsReviewed: config.twenty?.externalEffectsReviewed };
let enabledForProof = false;
if (config.twenty?.baseUrl !== 'https://bam-sales-coach-test.twenty.com' || config.twenty.scopeMode !== 'accounts' || config.twenty.scopeCompanyIds?.length !== 1 || config.twenty.scopeCompanyIds[0] !== accountId) throw new Error('QA proof requires the exact isolated endpoint and reserved company scope');
const lease = await acquireContextLock(resolve(root, config.contextDir));
const save = (name, data) => writeFile(join(evidence, name), JSON.stringify({ at: new Date().toISOString(), workspace: config.twenty.baseUrl, reservedAccountId: accountId, ...data }, null, 2));
try {
  let service = await loadService(path);
  const command = process.argv[2] || 'readback';
  if (command === 'project') {
    // Original account context is never replaced by the reduced CRM projection.
    await service.store.sources(originals);
    const before = await service.context({ accountId, refresh: false });
    await save('context-before.json', { context: before });
    const supplement = await service.store.source({ sourceKey: 'owner-authorized-isolated-qa-projection-2026-09-30', kind: 'synthetic-qa-instruction', text: 'Synthetic test projection, not real customer evidence. In reserved QA Northstar Supplies, create Casey Fixture as a synthetic buyer with no email address; retain relationship context note, a TODO preparation task named QA Prepare reliability summary (synthetic), and a separate repeat-order exploration opportunity in ENGAGED for adapter proof. Preserve the source-rich original, price/reliability objection, unhurried relationship interpretation and closed trial history. This QA instruction establishes fixture values, not the business facts or acceptance of any order.' });
    await service.store.update({ accountId, entries: [{ id: 'qa-live-fixture-projection', kind: 'note', text: supplement.text, sourceIds: [supplement.id], status: 'fact' }] });
    const changes = [];
    for (const fixture of fixtures) {
      const change = await service.propose({ accountId, object: fixture.object, values: fixture.values, sourceIds: [supplement.id], estimatedErrorCost: 'low', highlyConsequential: false, reason: 'Owner-authorized synthetic adapter proof in the isolated workspace and reserved account; no real commitments, recipients or due dates.' });
      if (change.state === 'blocked' && change.errorCode === 'WRITES_DISABLED') {
        // The initial write guard failed before submission, so fixture identity can
        // be fixed now and persisted before its first permitted network write.
        changes.push(await service.store.putChange({ ...change, createId: fixture.id }));
      } else changes.push(change);
    }
    await save('projection-plan.json', { originals, supplementId: supplement.id, changes, fixtures });
    // Evidence review covers these precise operations: no webhooks or event-bound
    // logic functions; no trigger for company/note/task/opportunity; no-email person
    // exits the built-in personal-email FILTER before any attachment/company write.
    const review = JSON.parse(await readFile(join(evidence, 'automation-functions.json'), 'utf8'));
    if (review.webhooks?.length || review.findManyLogicFunctions?.some(f => f.databaseEventTriggerSettings !== null)) throw new Error('Automation review does not authorize these isolated writes');
    if (!review.emailClassificationSource?.includes("if (!email || !email.includes('@'))") || !review.emailClassificationSource?.includes('return { isPersonal: true }')) throw new Error('No-email workflow exit is unverified');
    config.twenty.writeEnabled = true; config.twenty.externalEffectsReviewed = true;
    enabledForProof = true;
    await writeFile(path, JSON.stringify(config, null, 2), { mode: 0o600 });
    service = await loadService(path);
    const results = [];
    for (const change of changes) {
      const outcome = change.state === 'blocked' ? await service.retry(change.id) : change.state === 'applied' ? change : await service.apply(change);
      results.push(outcome);
      await save('projection-results.json', { results });
      if (outcome.state !== 'applied') throw new Error(`${outcome.object} projection ${outcome.state}: ${outcome.errorCode || 'unknown'}; inspect retained proposal and reconcile before retry`);
    }
    await save('projection-baseline.json', { task: (await service.read({ object: 'task', id: fixtures.find(f => f.object === 'task').id })).records[0] });
  }
  if (command === 'stale-proposal') {
    const baseline = JSON.parse(await readFile(join(evidence, 'projection-baseline.json'), 'utf8')).task;
    const current = (await service.read({ object: 'task', id: baseline.id })).records[0];
    if (current.updatedAt === baseline.updatedAt) throw new Error('Wait for the real human UI edit; this script will not emulate it through the API');
    const source = await service.store.source({ sourceKey: `qa-task-ui-edit:${current.updatedAt}`, kind: 'crm-readback', text: JSON.stringify(current), occurredAt: current.updatedAt });
    const stale = await service.propose({ accountId, object: 'task', id: baseline.id, expectedUpdatedAt: baseline.updatedAt, values: { title: 'QA Coach stale title attempt (must not overwrite human)' }, sourceIds: [source.id], estimatedErrorCost: 'low', highlyConsequential: false, reason: 'Synthetic concurrency proof against the original timestamp after a genuine human UI edit; expected to block.' });
    await save('stale-proposal.json', { baseline, humanCurrentReadback: current, outcome: stale, after: (await service.read({ object: 'task', id: baseline.id })).records[0] });
    if (stale.state !== 'blocked' || stale.errorCode !== 'CONFLICT') throw new Error('Stale correction was not blocked as expected');
  }
  if (command === 'fresh-proposal') {
    const taskId = fixtures.find(f => f.object === 'task').id;
    const current = (await service.read({ object: 'task', id: taskId })).records[0];
    const title = 'QA Coach reconciled — summary already drafted';
    if (current.title !== 'QA Human correction — summary already drafted' && current.title !== title) throw new Error('Fresh QA update requires the expected genuine human correction; refresh/review any other human edit');
    const source = await service.store.source({ sourceKey: `qa-task-human-current:${current.updatedAt}`, kind: 'crm-readback', text: JSON.stringify(current), occurredAt: current.updatedAt });
    await service.store.update({ accountId, entries: [{ id: 'qa-human-task-title-correction', kind: 'activity', text: `Observed task title before coach reconciliation: ${current.title}. The parent verified this correction through the genuine regular-user UI. Preserve its meaning that the summary is already drafted; it is not evidence that anything was sent or delivered.`, sourceIds: [source.id], status: 'fact' }] });
    const outcome = current.title === title ? { state: 'already-applied', recordId: taskId } : await service.propose({ accountId, object: 'task', id: taskId, expectedUpdatedAt: current.updatedAt, values: { title }, sourceIds: [source.id], estimatedErrorCost: 'low', highlyConsequential: false, reason: 'Owner-authorized synthetic fresh-baseline coach edit after a genuine human UI correction. Preserve its meaning and retained original; no external effects or commercial commitments.' });
    await save('fresh-proposal.json', { humanCurrentReadback: current, outcome, after: (await service.read({ object: 'task', id: taskId })).records[0] });
    if (!['applied', 'already-applied'].includes(outcome.state)) throw new Error(`Fresh synthetic task correction failed: ${outcome.errorCode || outcome.state}`);
  }
  const context = await service.context({ accountId });
  const records = {};
  for (const fixture of fixtures) records[fixture.object] = await service.read({ object: fixture.object, id: fixture.id });
  await save(command === 'project' ? 'projection-readback.json' : `${command}-readback.json`, { records, context });
  console.log(JSON.stringify({ command, records: Object.fromEntries(Object.entries(records).map(([object, result]) => [object, result.records.map(r => ({ id: r.id, title: r.title ?? r.name, updatedAt: r.updatedAt, stage: r.stage }))])), refreshed: context.refreshed, richEntries: context.account.entries.length, evidence }, null, 2));
} finally {
  try {
    if (enabledForProof) {
      config.twenty.writeEnabled = initialWriteFlags.writeEnabled;
      config.twenty.externalEffectsReviewed = initialWriteFlags.externalEffectsReviewed;
      await writeFile(path, JSON.stringify(config, null, 2), { mode: 0o600 });
    }
  } finally { await lease.release(); }
}
