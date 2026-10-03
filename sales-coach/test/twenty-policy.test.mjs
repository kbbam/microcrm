import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CoachService } from '../service.mjs';
import { TwentyAdapter } from '../twenty.mjs';

test('unreviewed person-email automation is reported blocked with zero CRM requests', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'coach-write-policy-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let requests = 0;
  const adapter = new TwentyAdapter({ baseUrl: 'https://synthetic.example.invalid', apiKey: 'synthetic-only',
    scopeMode: 'workspace', writeEnabled: true, externalEffectsReviewed: true,
    fetchImpl: async () => { requests++; throw new Error('Unexpected CRM request'); } });
  const service = await new CoachService({ contextDir: directory, actor: { id: 'exec@example.test', role: 'executive' }, adapter }).init();
  const source = await service.store.source({ sourceKey: 'synthetic-email', text: 'Synthetic test address supplied by executive.' });
  const change = await service.propose({ accountId: '00000000-0000-4000-a000-000000000001', object: 'person',
    values: { companyId: '00000000-0000-4000-a000-000000000001', emails: { primaryEmail: 'synthetic@example.invalid', additionalEmails: [] } },
    sourceIds: [source.id], estimatedErrorCost: 'low', highlyConsequential: false, reason: 'Synthetic safety verification.' });
  assert.equal(change.state, 'blocked');
  assert.equal(change.errorCode, 'UNREVIEWED_EXTERNAL_EFFECT');
  assert.equal(requests, 0);
});
