import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { open, readFile, rename, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';

export const SOURCE_OWNERSHIP_QUERY = `query CoachSourceOwnership {
 currentUser { id email disabled workspaceMember { id userEmail userWorkspaceId } currentWorkspace { id } currentUserWorkspace { id } }
 myConnectedAccounts { id handle provider userWorkspaceId archivedAt authFailedAt }
 myMessageChannels { id handle connectedAccountId isSyncEnabled syncedAt syncStatus syncStage }
 myCalendarChannels { id handle connectedAccountId isSyncEnabled syncedAt syncStatus syncStage }
}`;
const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };
const email = value => typeof value === 'string' ? value.trim().toLowerCase() : '';
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const queues = new Map();
const serial = async (file, operation) => {
  const work = (queues.get(file) ?? Promise.resolve()).then(operation), settled = work.catch(() => {});
  queues.set(file, settled);
  try { return await work; } finally { if (queues.get(file) === settled) queues.delete(file); }
};
const keyBytes = key => {
  if (typeof key !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(key)) fail('SOURCE_CONNECTION_REQUIRED', 'Source authorization is not configured. Open Business OS source setup.');
  const bytes = Buffer.from(key, 'base64');
  if (bytes.length !== 32) fail('SOURCE_CONNECTION_REQUIRED', 'Source authorization is not configured. Open Business OS source setup.');
  return bytes;
};
const binding = ({ expected, baseUrl, clientId }) => JSON.stringify([baseUrl, clientId, expected.email, expected.workspaceId, expected.memberId]);
async function write(file, value, options) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', keyBytes(options.encryptionKey), iv);
  cipher.setAAD(Buffer.from(binding(options)));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
  const envelope = { version: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: encrypted.toString('base64') };
  const temporary = `${file}.${randomBytes(12).toString('hex')}.tmp`;
  try {
    const handle = await open(temporary, 'wx', 0o600);
    try { await handle.writeFile(JSON.stringify(envelope) + '\n'); await handle.sync(); } finally { await handle.close(); }
    await rename(temporary, file);
    const directory = await open(dirname(file), 'r'); try { await directory.sync(); } finally { await directory.close(); }
  } finally { await unlink(temporary).catch(() => {}); }
}
async function read(file, options) {
  try {
    const envelope = JSON.parse(await readFile(file, 'utf8'));
    if (envelope.version !== 1) throw new Error();
    const decipher = createDecipheriv('aes-256-gcm', keyBytes(options.encryptionKey), Buffer.from(envelope.iv, 'base64'));
    decipher.setAAD(Buffer.from(binding(options))); decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64')), decipher.final()]).toString('utf8'));
  } catch { fail('SOURCE_CONNECTION_REQUIRED', 'Your source authorization is missing or unavailable. Reconnect Twenty through Business OS source setup.'); }
}
const normalizeTokens = (tokens, now) => {
  if (!tokens || typeof tokens.access_token !== 'string' || !tokens.access_token || typeof tokens.refresh_token !== 'string' || !tokens.refresh_token || String(tokens.token_type).toLowerCase() !== 'bearer' || !Number.isFinite(tokens.expires_in) || tokens.expires_in <= 0) fail('SOURCE_AUTH_RESPONSE', 'Twenty returned an unusable source authorization. Reconnect through Business OS source setup.');
  return { accessToken: tokens.access_token, refreshToken: tokens.refresh_token, expiresAt: now + Math.min(tokens.expires_in, 28800) * 1000 - 30_000 };
};
export async function saveTwentySourceAuthorization(options, tokens) {
  const value = normalizeTokens(tokens, options.now?.() ?? Date.now());
  await serial(options.file, () => write(options.file, value, options));
}

export function ownSourceChannels(data, expected) {
  const user = data?.currentUser, userWorkspaceId = user?.currentUserWorkspace?.id;
  if (user?.disabled || email(user?.email) !== email(expected.email) || email(user?.workspaceMember?.userEmail) !== email(expected.email) || user?.currentWorkspace?.id !== expected.workspaceId || user?.workspaceMember?.id !== expected.memberId || !uuid(userWorkspaceId) || user?.workspaceMember?.userWorkspaceId !== userWorkspaceId) fail('SOURCE_OWNERSHIP_REVOKED', 'Twenty source ownership no longer matches this executive. Reconnect your authorized account through Business OS.');
  if (![data.myConnectedAccounts, data.myMessageChannels, data.myCalendarChannels].every(Array.isArray)) fail('SOURCE_OWNERSHIP_UNAVAILABLE', 'Twenty source ownership could not be verified. No mailbox or calendar access is permitted.');
  const allAccounts = new Set(data.myConnectedAccounts.map(a => a.id));
  const own = new Set(data.myConnectedAccounts.filter(a => a.userWorkspaceId === userWorkspaceId && !a.archivedAt).map(a => a.id));
  const accountById = new Map(data.myConnectedAccounts.map(a => [a.id, a]));
  const select = rows => rows.flatMap(c => {
    if (!uuid(c.id) || !uuid(c.connectedAccountId) || !allAccounts.has(c.connectedAccountId)) fail('SOURCE_OWNERSHIP_UNAVAILABLE', 'Twenty returned an unverified source channel.');
    return own.has(c.connectedAccountId) ? [{ id: c.id, connectedAccountId: c.connectedAccountId, authFailed: !!accountById.get(c.connectedAccountId)?.authFailedAt, isSyncEnabled: typeof c.isSyncEnabled === 'boolean' ? c.isSyncEnabled : null, syncedAt: typeof c.syncedAt === 'string' && !Number.isNaN(Date.parse(c.syncedAt)) ? c.syncedAt : null, syncStatus: typeof c.syncStatus === 'string' ? c.syncStatus : 'unknown', syncStage: typeof c.syncStage === 'string' ? c.syncStage : 'unknown' }] : [];
  });
  const messageChannels = select(data.myMessageChannels), calendarChannels = select(data.myCalendarChannels);
  return { userWorkspaceId, messageChannelIds: [...new Set(messageChannels.map(c => c.id))], calendarChannelIds: [...new Set(calendarChannels.map(c => c.id))], messageChannels, calendarChannels };
}

function createTwentySourceReader(options, project) {
  const url = new URL(options.baseUrl);
  if (url.protocol !== 'https:' || url.username || url.password || url.origin !== options.baseUrl) throw new Error('Source ownership requires a pinned HTTPS origin');
  const fetcher = options.fetchImpl ?? fetch, now = options.now ?? Date.now;
  const request = async (path, body, accessToken) => {
    try {
      const response = await fetcher(options.baseUrl + path, { method: 'POST', redirect: 'error', headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'BAM-Coach-Setup/1.0', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
      const result = await response.json();
      if ([401, 403].includes(response.status) || (path === '/oauth/token' && result.error === 'invalid_grant')) fail('SOURCE_CONNECTION_REQUIRED', 'Your Twenty authorization is no longer available. Reconnect through Business OS source setup.');
      if (!response.ok || result.errors?.length || result.error) fail('SOURCE_OWNERSHIP_UNAVAILABLE', 'Twenty could not verify current source ownership. Reconnect through Business OS if this persists.');
      return result;
    } catch (error) {
      if (error.code === 'SOURCE_CONNECTION_REQUIRED') fail('SOURCE_CONNECTION_REQUIRED', 'Your Twenty authorization is no longer available. Reconnect through Business OS source setup.');
      fail('SOURCE_OWNERSHIP_UNAVAILABLE', 'Twenty source verification is unavailable. No mailbox or calendar access is permitted.');
    }
  };
  return () => serial(options.file, async () => {
    let tokens = await read(options.file, options);
    const refresh = async () => {
      const response = await request('/oauth/token', { grant_type: 'refresh_token', refresh_token: tokens.refreshToken, client_id: options.clientId });
      tokens = normalizeTokens(response, now());
      // Rotate before further calls; no runtime reload, which would deadlock a tool queue.
      await write(options.file, tokens, options);
    };
    if (!Number.isFinite(tokens.expiresAt) || tokens.expiresAt <= now()) await refresh();
    // Every source operation performs this live identity/ownership check. Only
    // the adapter's per-tool ALS caches it; no inter-conversation freshness TTL.
    const response = await request('/metadata', { query: SOURCE_OWNERSHIP_QUERY }, tokens.accessToken);
    const current = ownSourceChannels(response.data, options.expected);
    if (options.userWorkspaceId && current.userWorkspaceId !== options.userWorkspaceId) fail('SOURCE_OWNERSHIP_REVOKED', 'This source connection belongs to a changed Twenty membership. Reconnect through Business OS.');
    return project(response.data, current, new Date(now()).toISOString());
  });
}

// Both consumers share encrypted-token rotation and the same live ownership gate.
export function createTwentySourceOwnershipReader(options) {
  return createTwentySourceReader(options, (_data, current, checkedAt) => ({ ...current, checkedAt }));
}
export function createTwentySourceMetadataReader(options) {
  return createTwentySourceReader(options, (data, _current, checkedAt) => ({ data, checkedAt }));
}
