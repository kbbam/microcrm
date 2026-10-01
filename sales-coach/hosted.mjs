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
  instructionsPath = new URL('./skill/SKILL.md', import.meta.url), uploadFactory } = {}) {
  if (!configRoot || !publicUrl) throw new Error('Hosted coach configuration and public URL required');
  const contexts = new Map();
  const actors = new Map();
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
      }).init();
      return { path, uploads, executiveId: config.executiveId, pending: Promise.resolve() };
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
      service.serial = operation => {
        const work = ctx.pending.then(operation);
        ctx.pending = work.catch(() => {});
        return work;
      };
      return service;
    }).catch(error => { actors.delete(actorKey); throw error; }));
    return { ctx, service: await actors.get(actorKey) };
  }
  async function server(principal) {
    const { ctx, service } = await actor(principal);
    const mcp = buildServer(service, { reviewBaseUrl: publicUrl, contextKey: principal.contextKey,
      actorAuthority: 'authenticated-business-os-access' });
    const tool = (name, description, schema, run) => mcp.tool(name, description, schema,
      args => service.serial(async () => {
        try { return json(await run(args)); }
        catch (error) { return { ...json({ error: error.message }), isError: true }; }
      }));
    tool('get_coach_instructions', 'Retrieve the current centrally maintained coach behavior at the start of work. The response version identifies exactly which instructions were read.', {}, async () => {
      const instructions = await readFile(instructionsPath, 'utf8');
      return { version: createHash('sha256').update(instructions).digest('hex'), instructions,
        identity: service.actor, authority: 'authenticated-business-os-access',
        runtime: 'Claude performs this conversation; these tools do not execute a hosted model or unattended worker' };
    });
    tool('prepare_evidence_upload', 'Request a short-lived address for one original file. Use code to PUT the unchanged sandbox file bytes to uploadUrl, with contentType. No base64 argument or second user upload. Check the receipt before claiming preservation.', {
      accountId: id.optional(), sourceIds: z.array(id).max(100).optional(),
      filename: z.string().min(1).max(255), mimeType: z.string().min(1).max(200),
      expectedSize: z.number().int().positive().max(25 * 1024 * 1024),
      expectedSha256: z.string().regex(/^[a-fA-F0-9]{64}$/),
    }, async args => {
      if (args.sourceIds?.length) await service.store.sources(args.sourceIds);
      return ctx.uploads.createUpload({ ...args, ownerId: service.actor.id }, publicUrl);
    });
    tool('get_evidence', 'Read original-file preservation metadata using authenticated authority. An upload address is not proof a file was saved.', { evidenceId: id }, args => ctx.uploads.getEvidence(args.evidenceId, service.actor));
    tool('renew_evidence_upload', 'Recover an expired upload address without changing the original evidence identity. Returns a verified receipt if already stored; otherwise a fresh address bound to the same file size/hash. Use the existing sandbox attachment.', { evidenceId: id }, args => ctx.uploads.renewUpload(args.evidenceId, service.actor, publicUrl));
    tool('request_original_download', 'Issue a five-minute address for one preserved original after an authenticated access check. Retrieve it with sandbox code; do not use or expose connector credentials.', { evidenceId: id }, args => ctx.uploads.createDownload(args.evidenceId, service.actor, publicUrl));
    tool('retain_evidence_transcription', 'Retain transcription linked to a server-verified preserved original, including file metadata. Keep unreadable text uncertain; extracted business statements belong in account context separately.', {
      evidenceId: id, text: z.string().min(1).max(200000), occurredAt: z.string().max(100).optional(),
    }, async args => {
      const metadata = await ctx.uploads.getEvidence(args.evidenceId, service.actor);
      return service.store.source({ sourceKey: `evidence:${metadata.id}`, evidenceId: metadata.id,
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
      if (!match || match[1] !== principal?.contextKey) throw fail(403, 'Evidence access denied');
      const { ctx, service } = await actor(principal);
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
  return { handle, handleUpload, handleDownload, handleEvidence, buildServer: server, getActor: actor };
}

let gateway;
function configuredGateway() {
  gateway ??= createGateway({ configRoot: process.env.COACH_CONFIG_ROOT, publicUrl: process.env.PUBLIC_URL });
  return gateway;
}
export const handle = (req, res, principal) => configuredGateway().handle(req, res, principal);
export const handleUpload = (req, res) => configuredGateway().handleUpload(req, res);
export const handleDownload = (req, res) => configuredGateway().handleDownload(req, res);
export const handleEvidence = (req, res, principal) => configuredGateway().handleEvidence(req, res, principal);
export const getActor = principal => configuredGateway().getActor(principal);
