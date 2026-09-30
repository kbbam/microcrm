import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { loadService } from './config.mjs';
import { acquireContextLock } from './launch.mjs';

const [command, argument] = process.argv.slice(2);
const service = await loadService();
const lease = await acquireContextLock(service.store.directory);
try {
let result;
switch (command) {
  case 'import': {
    if (!argument) throw new Error('Specify a plain-text or JSON source file');
    const text = await readFile(resolve(argument), 'utf8');
    const source = await service.store.source({ sourceKey: `file:${basename(argument)}`, text, kind: 'submitted', location: resolve(argument) });
    result = { sourceId: source.id, duplicate: !!source.duplicate, next: 'Ask the coach to reconstruct from this source. The original is already durable.' };
    break;
  }
  case 'confirm': {
    const change = await service.store.change(argument);
    if (!process.argv.includes('--yes')) {
      result = { proposal: change, next: 'Review old/current CRM values, new values, source basis and consequences; rerun confirm ID --yes only if you approve this exact proposal.' };
    } else result = await service.serial(() => service.confirm(argument));
    break;
  }
  case 'report': result = await service.store.report(); break;
  case 'pending': result = await service.store.changes(); break;
  case 'resume': result = await service.serial(() => service.resume()); break;
  case 'retry': {
    if (!process.argv.includes('--yes')) throw new Error('Review the setup blocker, then use retry ID --yes');
    result = await service.serial(() => service.retry(argument));
    break;
  }
  case 'status': result = { actor: service.actor, sources: await service.store.listSources(), accounts: await service.store.search(), changes: await service.store.changes() }; break;
  default: throw new Error('Use import FILE | confirm ID [--yes] | report | pending | resume | retry ID --yes | status with COACH_CONFIG');
}
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} finally { await lease.release(); }
