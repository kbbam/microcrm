import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { TwentyAdapter } from './twenty.mjs';
import { CoachService } from './service.mjs';

export async function loadService(path = process.env.COACH_CONFIG, authenticatedActor) {
  if (!path) throw new Error('COACH_CONFIG must identify a trusted pilot config');
  const config = JSON.parse(await readFile(path, 'utf8'));
  const root = dirname(resolve(path));
  if (!config.contextDir || (!authenticatedActor && !config.actor?.id)) throw new Error('Pilot contextDir and actor identity required');
  let adapter;
  if (config.twenty) {
    let apiKey = process.env[config.twenty.apiKeyEnv || 'TWENTY_API_KEY'];
    if (config.twenty.apiKeyFile) {
      const env = await readFile(resolve(root, config.twenty.apiKeyFile), 'utf8');
      const match = env.split('\n').find(line => line.startsWith('TWENTY_API_KEY='));
      apiKey = match?.slice('TWENTY_API_KEY='.length).trim().replace(/^['"]|['"]$/g, '');
    }
    if (!apiKey) throw new Error('Twenty credential unavailable; do not place a token in model input');
    adapter = new TwentyAdapter({ ...config.twenty, apiKey });
  }
  const actor = authenticatedActor ?? config.actor;
  if (!actor?.id || !['executive', 'leader', 'admin'].includes(actor.role)) throw new Error('Authorized coach actor required');
  return new CoachService({ contextDir: resolve(root, config.contextDir), actor, adapter }).init();
}
