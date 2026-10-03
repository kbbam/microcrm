import { readFile } from 'node:fs/promises';
import { resolve, dirname, basename, join } from 'node:path';
import { createTwentySourceOwnershipReader } from './twenty-source-ownership.mjs';
import { TwentyAdapter } from './twenty.mjs';
import { CoachService } from './service.mjs';

export async function loadService(path = process.env.COACH_CONFIG, authenticatedActor) {
  if (!path) throw new Error('COACH_CONFIG must identify a trusted pilot config');
  const config = JSON.parse(await readFile(path, 'utf8'));
  const root = dirname(resolve(path));
  if (!config.contextDir || (!authenticatedActor && !config.actor?.id)) throw new Error('Pilot contextDir and actor identity required');
  const actor = authenticatedActor ?? config.actor;
  if (!actor?.id || !['executive', 'leader', 'admin'].includes(actor.role)) throw new Error('Authorized coach actor required');
  let adapter;
  if (config.twenty) {
    let apiKey = process.env[config.twenty.apiKeyEnv || 'TWENTY_API_KEY'];
    if (config.twenty.apiKeyFile) {
      const env = await readFile(resolve(root, config.twenty.apiKeyFile), 'utf8');
      const match = env.split('\n').find(line => line.startsWith('TWENTY_API_KEY='));
      apiKey = match?.slice('TWENTY_API_KEY='.length).trim().replace(/^['"]|['"]$/g, '');
    }
    if (!apiKey) throw new Error('Twenty credential unavailable; do not place a token in model input');
    let resolveSourceChannels;
    if (config.twenty.scopeMode === 'assigned' && config.sourceConnection?.receipt && process.env.TWENTY_SOURCE_CLIENT_ID && process.env.TWENTY_SOURCE_TOKEN_KEY) {
      const receipt = config.sourceConnection.receipt;
      resolveSourceChannels = createTwentySourceOwnershipReader({ file: join(root, `${basename(path, '.json')}.twenty-token.json`), baseUrl: new URL(config.twenty.baseUrl).origin,
        clientId: process.env.TWENTY_SOURCE_CLIENT_ID, encryptionKey: process.env.TWENTY_SOURCE_TOKEN_KEY,
        expected: { email: config.executiveId, workspaceId: config.sourceConnection.verifiedWorkspaceId, memberId: config.twenty.assignment.memberId }, userWorkspaceId: receipt.userWorkspaceId });
    }
    adapter = new TwentyAdapter({ ...config.twenty, apiKey, actor, sourceOwnershipRequired: config.twenty.scopeMode === 'assigned', resolveSourceChannels });
  }
  return new CoachService({ contextDir: resolve(root, config.contextDir), actor, adapter,
    enforceRetainedScope: config.enforceRetainedScope === true,
    authorizeAccount: adapter?.authorizeAccount ? (accountId, options) => adapter.authorizeAccount(accountId, options) : undefined,
  }).init();
}
