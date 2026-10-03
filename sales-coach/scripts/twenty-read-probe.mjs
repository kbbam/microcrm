// Read-only setup evidence. Prints schema/coverage only, never IDs or customer payloads.
import { readFile } from 'node:fs/promises';
import { TwentyAdapter } from '../twenty.mjs';
const text = await readFile(new URL('../../server/.env.twenty.local', import.meta.url), 'utf8');
const env = Object.fromEntries(text.split('\n').filter(line=>line.includes('=')&&!line.trim().startsWith('#')).map(line=>[line.slice(0,line.indexOf('=')).trim(),line.slice(line.indexOf('=')+1).trim()]));
const baseUrl = env.TWENTY_API_URL;
const apiKey = env.TWENTY_API_KEY;
const readonly = new TwentyAdapter({baseUrl,apiKey});
console.log(JSON.stringify({metadata:await readonly.metadata(),writesEnabled:false}));
// Discovery is setup-only and intentionally absent from model tools.
const data = await readonly.request('{ companies(first:1){edges{node{id}}} }');
const companyId = data.companies.edges[0]?.node.id;
if (!companyId) { console.log(JSON.stringify({scopeAvailable:false})); process.exit(0); }
const scoped = new TwentyAdapter({baseUrl,apiKey,scopeCompanyIds:[companyId]});
for (const object of ['company','person','opportunity','note','task','noteTarget','taskTarget','message','calendarEvent','messageParticipant','calendarEventParticipant','messageThreadTarget','calendarEventTarget']) {
  try { const result=await scoped.read({object,limit:1}); const {endCursor,...coverage}=result.coverage; console.log(JSON.stringify({object,ok:true,coverage})); }
  catch(error) { console.log(JSON.stringify({object,ok:false,code:error.code})); process.exitCode=1; }
}
// Force query validation for leaf schemas even if selected account has no links.
for (const object of ['note','task','message','calendarEvent','messageParticipant','calendarEventParticipant']) {
  try { await scoped.page(object,{id:{eq:'00000000-0000-4000-a000-000000000000'}},1); console.log(JSON.stringify({object,leafSchemaVerified:true})); }
  catch(error) { console.log(JSON.stringify({object,leafSchemaVerified:false,code:error.code})); process.exitCode=1; }
}
