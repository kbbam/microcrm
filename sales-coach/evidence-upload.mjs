import { mkdir, readFile, writeFile, rename, rm, open, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash, randomBytes, randomUUID } from 'node:crypto';

const digest = value => createHash('sha256').update(value).digest('hex');
const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const validActorId = value => typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= 320 && !/[\x00-\x20\x7f]/.test(value);
const fault = (status, message) => Object.assign(new Error(message), { status });

// Actors passed to retrieval must come from the host's authenticated identity,
// never model-supplied arguments. Capability URLs authorize only one exact file.
export class EvidenceUploadStore {
  constructor(directory, { maxBytes = 25 * 1024 * 1024, ttlMs = 15 * 60 * 1000, now = Date.now, uploadPath = '/evidence/uploads', downloadPath = '/evidence/downloads', downloadTtlMs = 5 * 60 * 1000 } = {}) {
    if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0 || !Number.isSafeInteger(ttlMs) || ttlMs <= 0) throw new Error('Invalid upload limits');
    if (!/^\/[A-Za-z0-9/_-]+$/.test(uploadPath) || uploadPath.endsWith('/')) throw new Error('Invalid upload route');
    if (!/^\/[A-Za-z0-9/_-]+$/.test(downloadPath) || downloadPath.endsWith('/') || downloadPath === uploadPath) throw new Error('Invalid download route');
    if (!Number.isSafeInteger(downloadTtlMs) || downloadTtlMs <= 0 || downloadTtlMs > 5 * 60 * 1000) throw new Error('Download grants must expire within five minutes');
    this.downloadPath = downloadPath;
    this.downloadTtlMs = downloadTtlMs;
    this.uploadPath = uploadPath;
    this.directory = resolve(directory);
    this.maxBytes = maxBytes;
    this.ttlMs = ttlMs;
    this.now = now;
  }
  async init() {
    for (const name of ['requests', 'grants', 'downloads', 'originals', 'staging', 'locks']) await mkdir(join(this.directory, name), { recursive: true, mode: 0o700 });
    return this;
  }
  async createUpload(input, baseUrl) {
    const { ownerId, accountId, sourceIds = [], filename, mimeType, expectedSize, expectedSha256 } = input;
    if (!validActorId(ownerId) || (accountId != null && !validId(accountId)) || !Array.isArray(sourceIds) || !sourceIds.every(validId)) throw new Error('Invalid evidence associations');
    if (typeof filename !== 'string' || !filename.trim() || filename.length > 255 || /[\x00-\x1f]/.test(filename)) throw new Error('Original filename required');
    if (typeof mimeType !== 'string' || !/^[\w.+-]+\/[\w.+-]+$/.test(mimeType)) throw new Error('Valid MIME type required');
    if (!Number.isSafeInteger(expectedSize) || expectedSize <= 0 || expectedSize > this.maxBytes || !/^[a-fA-F0-9]{64}$/.test(expectedSha256 ?? '')) throw new Error('Expected file size and SHA-256 required within upload limit');
    const base = new URL(baseUrl);
    if (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname))) throw new Error('HTTPS upload base required');
    if (base.username || base.password || base.search || base.hash) throw new Error('Invalid upload base');
    const token = randomBytes(32).toString('base64url');
    const grant = { id: randomUUID(), ownerId, accountId: accountId ?? null, sourceIds: [...new Set(sourceIds)], filename, mimeType, expectedSize, expectedSha256: expectedSha256.toLowerCase(), createdAt: new Date(this.now()).toISOString(), expiresAt: this.now() + this.ttlMs };
    await writeFile(join(this.directory, 'requests', `${grant.id}.json`), JSON.stringify(grant), { flag: 'wx', mode: 0o600 });
    await writeFile(join(this.directory, 'grants', `${digest(token)}.json`), JSON.stringify(grant), { flag: 'wx', mode: 0o600 });
    return { evidenceId: grant.id, uploadUrl: `${base.origin}${this.uploadPath}/${token}`, method: 'PUT', contentType: mimeType, expectedSize, expiresAt: new Date(grant.expiresAt).toISOString() };
  }
  async renewUpload(evidenceId, actor, baseUrl) {
    if (!validId(evidenceId) || !validActorId(actor?.id) || !['executive', 'leader', 'admin'].includes(actor.role)) throw fault(403, 'Authorized evidence access required');
    let request;
    try { request = JSON.parse(await readFile(join(this.directory, 'requests', `${evidenceId}.json`), 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') throw fault(404, 'Unknown evidence request'); throw error; }
    if (actor.id !== request.ownerId && !['leader', 'admin'].includes(actor.role)) throw fault(403, 'Evidence is outside the authorized scope');
    try {
      const evidence = await this.getEvidence(evidenceId, actor);
      return { evidenceId, evidence, alreadyPreserved: true };
    } catch (error) { if (error.status !== 404) throw error; }
    const base = new URL(baseUrl);
    if (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname))) throw new Error('HTTPS upload base required');
    if (base.username || base.password || base.search || base.hash) throw new Error('Invalid upload base');
    const token = randomBytes(32).toString('base64url');
    const grant = { ...request, expiresAt: this.now() + this.ttlMs };
    await writeFile(join(this.directory, 'grants', `${digest(token)}.json`), JSON.stringify(grant), { flag: 'wx', mode: 0o600 });
    return { evidenceId, uploadUrl: `${base.origin}${this.uploadPath}/${token}`, method: 'PUT', contentType: grant.mimeType, expectedSize: grant.expectedSize, expiresAt: new Date(grant.expiresAt).toISOString() };
  }
  async handleUpload(req, res) {
    const path = new URL(req.url, 'http://localhost').pathname;
    const match = new RegExp(`^${this.uploadPath}/([A-Za-z0-9_-]{43})$`).exec(path);
    if (!match) return false;
    let lock, staging;
    try {
      if (req.method !== 'PUT') throw fault(405, 'Use PUT with the original binary file');
      const tokenHash = digest(match[1]);
      let grant;
      try { grant = JSON.parse(await readFile(join(this.directory, 'grants', `${tokenHash}.json`), 'utf8')); }
      catch (error) { if (error.code === 'ENOENT') throw fault(404, 'Unknown upload'); throw error; }
      if (this.now() >= grant.expiresAt) throw fault(410, 'Upload expired; request a new upload address');
      const length = req.headers['content-length'];
      if (length != null && Number(length) !== grant.expectedSize) throw fault(422, 'Original file size does not match');
      const lockPath = join(this.directory, 'locks', tokenHash);
      try { await mkdir(lockPath, { mode: 0o700 }); lock = lockPath; }
      catch (error) {
        if (error.code !== 'EEXIST') throw error;
        let stale = false;
        try {
          const owner = JSON.parse(await readFile(join(lockPath, 'owner.json'), 'utf8'));
          if (Number.isSafeInteger(owner.pid) && owner.pid > 0) {
            try { process.kill(owner.pid, 0); } catch (probe) { stale = probe.code === 'ESRCH'; }
          }
        } catch {
          // A process can die between mkdir and owner metadata creation.
          // Keep fresh locks busy; only reclaim an abandoned initialization.
          try { stale = Date.now() - (await stat(lockPath)).mtimeMs > 30_000; } catch { }
        }
        if (!stale) throw fault(409, 'Upload already in progress');
        await rm(lockPath, { recursive: true, force: true });
        try { await mkdir(lockPath, { mode: 0o700 }); lock = lockPath; }
        catch (retry) { if (retry.code === 'EEXIST') throw fault(409, 'Upload already in progress'); throw retry; }
      }
      await writeFile(join(lock, 'owner.json'), JSON.stringify({ pid: process.pid }), { mode: 0o600 });
      staging = join(this.directory, 'staging', randomUUID());
      await mkdir(staging, { mode: 0o700 });
      const file = await open(join(staging, 'original'), 'wx', 0o600);
      const hash = createHash('sha256');
      let size = 0;
      try {
        for await (const chunk of req) {
          size += chunk.length;
          if (size > grant.expectedSize || size > this.maxBytes) throw fault(413, 'Original exceeds upload limit');
          hash.update(chunk);
          await file.writeFile(chunk);
        }
        await file.sync();
      } finally { await file.close(); }
      const sha256 = hash.digest('hex');
      if (size !== grant.expectedSize || sha256 !== grant.expectedSha256) throw fault(422, 'Original file checksum or size does not match');
      if (this.now() >= grant.expiresAt) throw fault(410, 'Upload expired before completion');
      const destination = join(this.directory, 'originals', grant.id);
      let metadata;
      try { metadata = JSON.parse(await readFile(join(destination, 'metadata.json'), 'utf8')); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      const duplicate = !!metadata;
      if (!metadata) {
        metadata = { id: grant.id, ownerId: grant.ownerId, accountId: grant.accountId, sourceIds: grant.sourceIds, filename: grant.filename, mimeType: grant.mimeType, size, sha256, requestedAt: grant.createdAt, storedAt: new Date(this.now()).toISOString(), status: 'original-preserved' };
        const meta = await open(join(staging, 'metadata.json'), 'wx', 0o600);
        try { await meta.writeFile(JSON.stringify(metadata)); await meta.sync(); } finally { await meta.close(); }
        await rename(staging, destination);
        staging = null;
      }
      if (staging) { await rm(staging, { recursive: true, force: true }); staging = null; }
      if (lock) { await rm(lock, { recursive: true, force: true }); lock = null; }
      res.writeHead(duplicate ? 200 : 201, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ evidence: metadata, duplicate }));
    } catch (error) {
      // Complete cleanup before acknowledging failure so an immediate retry
      // cannot race the previous request's still-held upload lock.
      if (staging) { await rm(staging, { recursive: true, force: true }); staging = null; }
      if (lock) { await rm(lock, { recursive: true, force: true }); lock = null; }
      if (!res.headersSent) { res.writeHead(error.status ?? 500, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify({ error: error.status ? error.message : 'Evidence upload failed' })); }
    } finally {
      if (staging) await rm(staging, { recursive: true, force: true });
      if (lock) await rm(lock, { recursive: true, force: true });
      // Rejected bodies must not hold the HTTP connection indefinitely.
      if (!req.complete) req.resume();
    }
    return true;
  }
  async createDownload(evidenceId, actor, baseUrl) {
    const metadata = await this.getEvidence(evidenceId, actor);
    const base = new URL(baseUrl);
    if (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname))) throw new Error('HTTPS download base required');
    if (base.username || base.password || base.search || base.hash) throw new Error('Invalid download base');
    const token = randomBytes(32).toString('base64url');
    const grant = { evidenceId, actor: { id: actor.id, role: actor.role }, expiresAt: this.now() + this.downloadTtlMs };
    await writeFile(join(this.directory, 'downloads', `${digest(token)}.json`), JSON.stringify(grant), { flag: 'wx', mode: 0o600 });
    return { evidenceId, downloadUrl: `${base.origin}${this.downloadPath}/${token}`, method: 'GET', filename: metadata.filename, mimeType: metadata.mimeType, size: metadata.size, sha256: metadata.sha256, expiresAt: new Date(grant.expiresAt).toISOString() };
  }
  async handleDownload(req, res) {
    const path = new URL(req.url, 'http://localhost').pathname;
    const match = new RegExp(`^${this.downloadPath}/([A-Za-z0-9_-]{43})$`).exec(path);
    if (!match) return false;
    try {
      if (req.method !== 'GET') throw fault(405, 'Use GET to retrieve the original');
      let grant;
      try { grant = JSON.parse(await readFile(join(this.directory, 'downloads', `${digest(match[1])}.json`), 'utf8')); }
      catch (error) { if (error.code === 'ENOENT') throw fault(404, 'Unknown download'); throw error; }
      if (this.now() >= grant.expiresAt) throw fault(410, 'Download expired; request a new download address');
      const { metadata, bytes } = await this.readOriginal(grant.evidenceId, grant.actor);
      if (this.now() >= grant.expiresAt) throw fault(410, 'Download expired; request a new download address');
      const filename = encodeURIComponent(metadata.filename).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
      res.writeHead(200, {
        'Content-Type': metadata.mimeType,
        'Content-Length': bytes.length,
        'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer'
      });
      res.end(bytes);
    } catch (error) {
      if (!res.headersSent) { res.writeHead(error.status ?? 500, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify({ error: error.status && error.status !== 500 ? error.message : 'Original download failed' })); }
    }
    return true;
  }
  async getEvidence(id, actor) {
    if (!validId(id)) throw fault(404, 'Unknown evidence');
    if (!validActorId(actor?.id) || !['executive', 'leader', 'admin'].includes(actor?.role)) throw fault(403, 'Authenticated actor required');
    let metadata;
    try { metadata = JSON.parse(await readFile(join(this.directory, 'originals', id, 'metadata.json'), 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') throw fault(404, 'Unknown evidence'); throw error; }
    if (actor.role === 'executive' && actor.id !== metadata.ownerId) throw fault(403, 'Evidence access denied');
    return metadata;
  }
  async readOriginal(id, actor) {
    const metadata = await this.getEvidence(id, actor);
    const bytes = await readFile(join(this.directory, 'originals', id, 'original'));
    if (bytes.length !== metadata.size || digest(bytes) !== metadata.sha256) throw fault(500, 'Stored evidence integrity check failed');
    return { metadata, bytes };
  }
}
