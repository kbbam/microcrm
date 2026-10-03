// Isolated synthetic browser proof. Uses the real review handlers and durable
// CoachService with a local fake CRM; it never uses credentials or real data.
import express from '../../../server/node_modules/express/index.js';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCoachReviewHandlers } from '../../../server/dist/coach-review.js';
import { CoachService } from '../../../sales-coach/service.mjs';
const directory = await mkdtemp(join(tmpdir(), 'coach-review-browser-'));
const actor = { id: 'executive@example.test', role: 'executive' };
const principal = { ...actor, contextKey: 'synthetic-pilot' };
const service = await new CoachService({ contextDir: directory, actor, adapter: {
  async update({ id, values }) { return { record: { id, ...values, updatedAt: '2026-10-01T10:00:00Z' } }; },
} }).init();
const source = await service.store.source({ sourceKey: 'Call notes · 1 October', text: 'Synthetic review fixture.\n\nThe executive reports that the buyer accepted the trial order during the call. Delivery date and signed terms have not yet been supplied.\n\nThis is attributed testimony, not independent evidence that the order is complete.', kind: 'testimony', occurredAt: '2026-10-01T09:00:00Z' });
await service.store.update({ accountId: 'northstar', title: 'QA Northstar Pharmacy', entries: [{ kind: 'note', text: source.text, sourceIds: [source.id], status: 'human-account' }] });
await service.store.rememberCRM('northstar', 'opportunity', { id: 'trial-order', name: 'Autumn trial order', stage: 'Proposal', updatedAt: '2026-10-01T09:00:00Z' });
await service.store.rememberCRM('northstar', 'opportunity', { id: 'spring-reorder', name: 'Spring repeat order', stage: 'Qualification', updatedAt: '2026-10-01T08:00:00Z' });
const change = await service.propose({ accountId: 'northstar', object: 'opportunity', id: 'trial-order', values: { stage: 'Won' }, expectedUpdatedAt: '2026-10-01T09:00:00Z', sourceIds: [source.id], reason: 'The executive reported that the buyer accepted the trial order. Marking the pursuit as won changes the recorded commercial outcome; check the supporting account before applying.', estimatedErrorCost: 'high', highlyConsequential: true });
const app = express();
const sessions = new Set();
const handlers = createCoachReviewHandlers({ publicUrl: 'http://127.0.0.1:43119', enabled: () => true, getActor: async () => ({ service }), resolvePrincipal: async () => principal,
  readBrowserSession: async req => sessions.has(req.headers.cookie?.match(/synthetic-review-session=([^;]+)/)?.[1]) ? { id: 'synthetic-browser-session', accountId: actor.id } : null,
  createBrowserSession: async (id, res) => { sessions.add('signed-in'); res.cookie('synthetic-review-session', 'signed-in', { httpOnly: true, sameSite: 'lax' }); return { id: 'synthetic-browser-session', accountId: id }; },
  endBrowserSession: async (_req, res) => { sessions.clear(); res.clearCookie('synthetic-review-session'); },
  verifyPassword: async (email, password) => email === actor.id && password === 'synthetic-password',
});
const body = express.urlencoded({ extended: false, limit: '16kb' });
app.get('/coach/review/:contextKey/:id', handlers.get);
app.post('/coach/review/:contextKey/:id', body, handlers.post);
app.post('/coach/review/:contextKey/:id/login', body, handlers.login);
app.post('/coach/review/:contextKey/:id/logout', body, handlers.logout);
app.listen(43119, '127.0.0.1', () => console.log(JSON.stringify({ url: `http://127.0.0.1:43119/coach/review/synthetic-pilot/${change.id}`, directory })));
