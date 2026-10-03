import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { loadService } from './config.mjs';
import { buildServer } from './mcp.mjs';
import { EvidenceUploadStore } from './evidence-upload.mjs';

const safeKey = key => typeof key === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(key);
const json = value => ({ content: [{ type: 'text', text: JSON.stringify(value) }] });
const fail = (status, message) => Object.assign(new Error(message), { status });
const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);

// Authentication and access mapping are owned by the HTTP host. No model tool
// accepts a role, owner identity, config path, or storage directory.
export function createGateway({ configRoot, publicUrl, serviceFactory = loadService,
  instructionsPath = new URL('./skill/SKILL.md', import.meta.url), uploadFactory, resolvePrincipal } = {}) {
  if (!configRoot || !publicUrl) throw new Error('Hosted coach configuration and public URL required');
  const contexts = new Map();
  const actors = new Map();
  // Queues outlive cached configuration and actor views. A source-connection
  // reload must not let an old in-flight view write beside the new view.
  const queues = new Map();
  const enqueue = (ctx, operation) => {
    const work = ctx.queue.pending.then(operation);
    ctx.queue.pending = work.catch(() => {});
    return work;
  };
  const authorizePrincipal = async principal => {
    if (!resolvePrincipal) return;
    const live = await resolvePrincipal(principal.id);
    if (!live || live.id !== principal.id || live.role !== principal.role || live.contextKey !== principal.contextKey) {
      throw fail(403, 'Coach access changed; reconnect or ask your team administrator');
    }
  };
  async function context(key) {
    if (!safeKey(key)) throw fail(403, 'Invalid coach context');
    if (!contexts.has(key)) contexts.set(key, (async () => {
      const path = join(resolve(configRoot), `${key}.json`);
      const config = JSON.parse(await readFile(path, 'utf8'));
      if (!config.contextDir) throw new Error('Durable context directory required');
      if (typeof config.executiveId !== 'string' || !config.executiveId.trim()) throw new Error('Hosted pilot executive identity required');
      const directory = resolve(configRoot, config.contextDir);
      const uploads = uploadFactory ? await uploadFactory(key, directory) : await new EvidenceUploadStore(join(directory, 'evidence-originals'), {
        uploadPath: `/coach/evidence/upload/${key}`,
        downloadPath: `/coach/evidence/download/${key}`,
        authorizeCapability: async (metadata, capabilityActor) => {
          let authority = capabilityActor;
          if (resolvePrincipal) {
            const live = await resolvePrincipal(capabilityActor.id);
            if (!live) throw fail(403, 'Evidence access has been revoked');
            if (live.contextKey !== key) {
              const origin = await context(live.contextKey);
              if (!['leader', 'admin'].includes(live.role) || !origin.leaderContextKeys.includes(key)) throw fail(403, 'Evidence access has been revoked');
            }
            authority = live;
          }
          const current = await serviceFactory(path, authority);
          // A mapped leader capability preserves the explicitly authorized read
          // view; the executive assignment policy never narrows teamlead rights.
          if (['leader', 'admin'].includes(authority.role)) current.enforceRetainedScope = false;
          // The capability identifies one original, not an enduring account grant.
          if (metadata.accountId) await current.authorizeAccount(metadata.accountId);
          if (metadata.sourceIds?.length) await current.sources(metadata.sourceIds);
        },
      }).init();
      const leaderContextKeys = config.leaderContextKeys ?? [];
      if (!Array.isArray(leaderContextKeys) || !leaderContextKeys.every(safeKey)) throw new Error('Invalid leader context configuration');
      if (!queues.has(key)) queues.set(key, { pending: Promise.resolve() });
      return { path, uploads, executiveId: config.executiveId, leaderContextKeys, sourceConnection: config.sourceConnection ?? null, queue: queues.get(key) };
    })().catch(error => { contexts.delete(key); throw error; }));
    return contexts.get(key);
  }
  async function actor(principal) {
    if (!principal?.id || !['executive', 'leader', 'admin'].includes(principal.role) || !safeKey(principal.contextKey)) throw fail(403, 'Authorized coach principal required');
    const ctx = await context(principal.contextKey);
    if (principal.role === 'executive' && principal.id !== ctx.executiveId) throw fail(403, 'Coach context is assigned to another executive');
    const actorKey = JSON.stringify([principal.contextKey, principal.id, principal.role]);
    if (!actors.has(actorKey)) actors.set(actorKey, serviceFactory(ctx.path, { id: principal.id, role: principal.role }).then(service => {
      // Separate role views share one serialization queue for the pilot context.
      const scopedSerial = service.serial.bind(service);
      service.serial = operation => enqueue(ctx, async () => {
        // Authority may change while another context operation holds the queue.
        // Check at execution time, before any read or persistent side effect.
        await authorizePrincipal(principal);
        return scopedSerial(operation);
      });
      return service;
    }).catch(error => { actors.delete(actorKey); throw error; }));
    return { ctx, service: await actors.get(actorKey) };
  }
  async function server(principal) {
    const { ctx, service } = await actor(principal);
    const leader = ['leader', 'admin'].includes(principal.role);
    const readContext = async key => {
      if (!key || key === principal.contextKey) return { ctx, service };
      if (!leader || !ctx.leaderContextKeys.includes(key)) throw fail(403, 'Context access denied');
      const target = await context(key);
      const scoped = await serviceFactory(target.path, { id: principal.id, role: principal.role });
      // This is a read view granted explicitly by the trusted teamlead mapping.
      // It never weakens the executive service or grants cross-context writes.
      scoped.enforceRetainedScope = false;
      return { ctx: target, service: scoped };
    };
    const sourceReadiness = async () => {
      const setupUrl = `${new URL(publicUrl).origin}/account/twenty/status`;
      const adapter = service.adapter;
      if (adapter?.scopeMode !== 'assigned') return { scope: adapter?.scopeMode ?? 'not-configured', status: 'not-verified', setupUrl, meaning: 'CRM configuration does not verify email/calendar availability.' };
      const registered = { messageChannelCount: adapter.messageChannelIds.length, calendarChannelCount: adapter.calendarChannelIds.length };
      if (typeof adapter.resolveSourceChannels !== 'function') return { ...registered, status: 'authorization-required', receiptStatus: 'not-authorized', checkedAt: null, setupUrl, meaning: 'Business OS source authorization is not available. This does not establish whether Google is connected or syncing in Twenty.' };
      try {
        const live = await adapter.resolveSourceChannels();
        const summarize = (rows, ids) => {
          const channels = rows.filter(channel => ids.includes(channel.id));
          const reported = channels.filter(channel => channel.syncedAt && Number.isFinite(Date.parse(channel.syncedAt)));
          const status = !channels.length ? 'not-connected' : channels.some(c => c.authFailed) ? 'reconnect-required' : channels.some(c => c.isSyncEnabled !== true) ? 'sync-disabled' : reported.length < channels.length ? 'awaiting-sync' : 'sync-reported';
          return { status, registeredChannelCount: ids.length, authorizedChannelCount: channels.length,
            lastSyncedAt: reported.length ? new Date(Math.max(...reported.map(c => Date.parse(c.syncedAt)))).toISOString() : null,
            channels: channels.map(({ id, authFailed, isSyncEnabled, syncedAt, syncStatus, syncStage }) => ({ id, authFailed, isSyncEnabled, syncedAt, syncStatus, syncStage })) };
        };
        const email = summarize(live.messageChannels ?? [], adapter.messageChannelIds), calendar = summarize(live.calendarChannels ?? [], adapter.calendarChannelIds);
        const connected = email.authorizedChannelCount > 0 && calendar.authorizedChannelCount > 0;
        const observed = email.status === 'sync-reported' && calendar.status === 'sync-reported';
        return { messageChannelCount: email.authorizedChannelCount, calendarChannelCount: calendar.authorizedChannelCount,
          status: connected ? 'connected' : 'source-setup-required', receiptStatus: observed ? 'source-sync-observed' : 'awaiting-source-sync',
          identityVerified: true, checkedAt: live.checkedAt ?? null, verifiedAt: ctx.sourceConnection?.receipt?.verifiedAt ?? null,
          email, calendar, setupUrl, contentCoverageVerified: false,
          meaning: 'Fresh own-source verification. lastSyncedAt is provider-reported sync history; checkedAt is the time of this check. Retained evidence inventory and pending proposals do not determine connection state. Reported sync does not prove current or complete mailbox/calendar contents.' };
      } catch (error) {
        const reconnect = ['SOURCE_CONNECTION_REQUIRED', 'SOURCE_OWNERSHIP_REVOKED', 'SOURCE_AUTH_RESPONSE'].includes(error.code);
        return { ...registered, status: reconnect ? 'authorization-required' : 'verification-unavailable', receiptStatus: 'not-live-verified', checkedAt: null, setupUrl, contentCoverageVerified: false,
          meaning: reconnect ? 'Saved source authorization is unavailable or no longer matches this executive. Reconnect Business OS sources; do not claim Google itself is disconnected.' : 'Current source verification failed temporarily. Connection/sync state is unknown; retry rather than claiming disconnected or not synced.' };
      }
    };
    const permissionPreflight = {
      phase: 'permissions-unverified', automaticNextStep: 'Run permission preflight when the executive requests setup, continue setup, or start with setup; do not switch to account work or declare setup complete.',
      clientSettings: 'Claude Customize > Connectors > Coach (production) > Tool permissions',
      action: 'Set the existing internal-tools category to Always allow in one pass after reviewing the current tool list. If organization policy blocks it, report that specific block.',
      capabilities: 'These tools do not send email or write calendars. Consequential CRM changes still require separate Business OS human review.',
      verification: 'After the user confirms the settings, use a permitted account read and a bounded CRM read without changing customer records. Request one fresh conversation check; retain prompt failures as pending. End setup replies with the next outstanding setup action, without an account-choice question. Reuse permissions already confirmed in this conversation instead of repeating settings. Use the first genuine harmless update for write verification, not a pretend customer change.',
      limits: 'Business OS cannot inspect or grant Claude client approval settings. Tool success is not proof all client settings persist. Do not call every mutating tool or invent dry-run arguments to trigger approvals.'
    };
    const mcp = buildServer(service, { reviewBaseUrl: publicUrl, contextKey: principal.contextKey,
      sourceReadiness, permissionPreflight,
      actorAuthority: 'authenticated-business-os-access',
      readContext: async (key, operation) => {
        const target = await readContext(key);
        return target.ctx === ctx ? operation(target.service)
          : enqueue(target.ctx, async () => {
            await authorizePrincipal(principal);
            return target.service.serial(() => operation(target.service));
          });
      },
      leaderReport: async () => {
        if (!['leader', 'admin'].includes(principal.role)) throw fail(403, 'Leader access required');
        const own = await service.store.report();
        const executives = [];
        for (const key of ctx.leaderContextKeys) {
          if (key === principal.contextKey) continue;
          const target = await context(key);
          const scoped = await serviceFactory(target.path, { id: principal.id, role: principal.role });
          const report = await enqueue(target, async () => {
            await authorizePrincipal(principal);
            return scoped.serial(async () => ({ ...await scoped.store.report(), sources: await scoped.store.listSources() }));
          });
          executives.push({ contextKey: key, executiveId: target.executiveId, ...report });
        }
        return executives.length ? { ...own, executives } : own;
      },
    });
    const authorizeEvidence = async metadata => {
      if (metadata.accountId) await service.authorizeAccount(metadata.accountId);
      if (metadata.sourceIds?.length) await service.sources(metadata.sourceIds);
      return metadata;
    };
    const tool = (name, description, schema, run) => mcp.tool(name, description, schema,
      args => service.serial(async () => {
        try { return json(await run(args)); }
        catch (error) { return { ...json({ error: error.message }), isError: true }; }
      }));
    tool('get_coach_instructions', 'Retrieve the current centrally maintained coach behavior at the start of work. The response version identifies exactly which instructions were read. Includes fresh source readiness and the required next permission-preflight step for setup; never infer connectivity from retained evidence inventory.', {}, async () => {
      const instructions = await readFile(instructionsPath, 'utf8');
      return { version: createHash('sha256').update(instructions).digest('hex'), instructions,
        identity: service.actor, crmConfigured: !!service.adapter, authority: 'authenticated-business-os-access',
        deployment: { publicUrl: new URL(publicUrl).origin, crmOrigin: service.adapter?.baseUrl ?? null, contextKey: principal.contextKey },
        workAllocation: { available: !!service.adapter?.work, programmeIds: service.adapter?.work?.initiativeIds ?? [], memberId: service.adapter?.work?.memberId ?? null },
        sourceConfiguration: await sourceReadiness(), permissionPreflight,
        runtime: 'Claude performs this conversation; these tools do not execute a hosted model or unattended worker' };
    });
    tool('prepare_evidence_upload', 'Request a short-lived address for one original file. Use code to PUT the unchanged sandbox file bytes to uploadUrl, with contentType. No base64 argument or second user upload. Check the receipt before claiming preservation.', {
      accountId: id.optional(), sourceIds: z.array(id).max(100).optional(),
      filename: z.string().min(1).max(255), mimeType: z.string().min(1).max(200),
      expectedSize: z.number().int().positive().max(25 * 1024 * 1024),
      expectedSha256: z.string().regex(/^[a-fA-F0-9]{64}$/),
    }, async args => {
      if (args.accountId) await service.authorizeAccount(args.accountId);
      if (args.sourceIds?.length) await service.sources(args.sourceIds);
      return ctx.uploads.createUpload({ ...args, ownerId: service.actor.id }, publicUrl);
    });
    const contextSchema = { contextKey: id.optional() };
    const evidenceView = async args => {
      const target = await readContext(args.contextKey);
      const metadata = await target.ctx.uploads.getEvidence(args.evidenceId, target.service.actor);
      if (target.ctx === ctx) await authorizeEvidence(metadata);
      return { ...target, metadata };
    };
    tool('get_evidence', 'Read original-file preservation metadata. Teamleads may supply an explicitly granted contextKey from leader_report. An upload address is not proof a file was saved.', { evidenceId: id, ...contextSchema }, async args => (await evidenceView(args)).metadata);
    tool('renew_evidence_upload', 'Recover an expired upload address without changing the original evidence identity. Returns a verified receipt if already stored; otherwise a fresh address bound to the same file size/hash. Use the existing sandbox attachment.', { evidenceId: id }, async args => {
      const request = await ctx.uploads.uploadRequest(args.evidenceId, service.actor);
      await authorizeEvidence(request);
      return ctx.uploads.renewUpload(args.evidenceId, service.actor, publicUrl);
    });
    tool('request_original_download', 'Issue a five-minute address for one preserved original after an authenticated access check. Retrieve it with sandbox code; do not use or expose connector credentials.', { evidenceId: id, ...contextSchema }, async args => {
      const target = await evidenceView(args);
      return target.ctx.uploads.createDownload(args.evidenceId, target.service.actor, publicUrl);
    });
    tool('retain_evidence_transcription', 'Retain transcription linked to a server-verified preserved original, including file metadata. Keep unreadable text uncertain; extracted business statements belong in account context separately.', {
      evidenceId: id, text: z.string().min(1).max(200000), occurredAt: z.string().max(100).optional(),
    }, async args => {
      const metadata = await authorizeEvidence(await ctx.uploads.getEvidence(args.evidenceId, service.actor));
      return service.retainSource({ sourceKey: `evidence:${metadata.id}`, evidenceId: metadata.id,
        text: args.text, kind: 'file-transcription', representation: 'transcription', occurredAt: args.occurredAt,
        metadata: { ...metadata, originalLocation: `${new URL(publicUrl).origin}/coach/evidence/${principal.contextKey}/${metadata.id}` } });
    });
    return mcp;
  }
  async function handle(req, res, principal) {
    let mcp, transport;
    try {
      mcp = await server(principal);
      transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      res.on('close', () => { void transport.close(); void mcp.close(); });
      await mcp.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      if (!res.headersSent) {
        res.writeHead(error.status ?? 503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ error: error.status ? error.message : 'Coach unavailable; retained evidence has not been changed' }));
      }
      if (transport) await transport.close();
      if (mcp) await mcp.close();
    }
  }
  async function handleUpload(req, res) {
    const match = /^\/coach\/evidence\/upload\/([A-Za-z0-9_-]{1,128})\/[A-Za-z0-9_-]{43}$/.exec(new URL(req.url, 'http://localhost').pathname);
    if (!match) { res.writeHead(404); res.end(); return; }
    try { await (await context(match[1])).uploads.handleUpload(req, res); }
    catch { res.writeHead(404); res.end(); }
  }
  async function handleDownload(req, res) {
    const match = /^\/coach\/evidence\/download\/([A-Za-z0-9_-]{1,128})\/[A-Za-z0-9_-]{43}$/.exec(new URL(req.url, 'http://localhost').pathname);
    if (!match) { res.writeHead(404); res.end(); return; }
    try { await (await context(match[1])).uploads.handleDownload(req, res); }
    catch { res.writeHead(404); res.end(); }
  }
  async function handleEvidence(req, res, principal) {
    try {
      const match = /^\/coach\/evidence\/([A-Za-z0-9_-]{1,128})\/([A-Za-z0-9_-]{1,128})$/.exec(new URL(req.url, 'http://localhost').pathname);
      if (!match) throw fail(403, 'Evidence access denied');
      const own = await actor(principal);
      let { ctx, service } = own;
      if (match[1] !== principal.contextKey) {
        if (!['leader', 'admin'].includes(principal.role) || !own.ctx.leaderContextKeys.includes(match[1])) throw fail(403, 'Evidence access denied');
        ctx = await context(match[1]);
        service = await serviceFactory(ctx.path, { id: principal.id, role: principal.role });
        service.enforceRetainedScope = false;
      }
      const current = await ctx.uploads.getEvidence(match[2], service.actor);
      if (current.accountId) await service.authorizeAccount(current.accountId);
      if (current.sourceIds?.length) await service.sources(current.sourceIds);
      const { metadata, bytes } = await ctx.uploads.readOriginal(match[2], service.actor);
      res.writeHead(200, { 'Content-Type': metadata.mimeType, 'Content-Length': bytes.length,
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(metadata.filename)}`,
        'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(bytes);
    } catch (error) {
      res.writeHead(error.status ?? 503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ error: error.status ? error.message : 'Original temporarily unavailable' }));
    }
  }
  async function reloadContext(key) {
    const previous = contexts.has(key) ? await contexts.get(key) : null;
    if (previous) await previous.queue.pending;
    for (const actorKey of actors.keys()) if (JSON.parse(actorKey)[0] === key) actors.delete(actorKey);
    contexts.delete(key);
  }
  return { handle, handleUpload, handleDownload, handleEvidence, buildServer: server, getActor: actor, reloadContext };
}

let gateway;
let principalResolver;
export const setPrincipalResolver = resolver => { principalResolver = resolver; };
function configuredGateway() {
  gateway ??= createGateway({ configRoot: process.env.COACH_CONFIG_ROOT, publicUrl: process.env.PUBLIC_URL, resolvePrincipal: id => {
    if (!principalResolver) throw fail(503, 'Current evidence authority unavailable');
    return principalResolver(id);
  } });
  return gateway;
}
export const handle = (req, res, principal) => configuredGateway().handle(req, res, principal);
export const handleUpload = (req, res) => configuredGateway().handleUpload(req, res);
export const handleDownload = (req, res) => configuredGateway().handleDownload(req, res);
export const handleEvidence = (req, res, principal) => configuredGateway().handleEvidence(req, res, principal);
export const getActor = principal => configuredGateway().getActor(principal);

export const reloadContext = key => configuredGateway().reloadContext(key);
