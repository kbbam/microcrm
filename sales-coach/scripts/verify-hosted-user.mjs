// Run inside the deployed Coach container. Keep the existing token in memory;
// verify through the public HTTP boundary without printing it or minting access.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const args = process.argv.slice(2);
if (args.includes('--as-runtime-user') && process.getuid?.() === 0) {
  process.setgid(1000);
  process.setuid(1000);
}
if (process.getuid?.() === 0) throw new Error('Run as the application user; root can mask inaccessible Coach storage. Use --as-runtime-user for this container.');
const email = args.find(arg => !arg.startsWith('--'))?.trim().toLowerCase();
if (!email || !email.includes('@')) throw new Error('Supply the executive work email.');
const { pool } = await import('../../server/dist/db.js');
let client;
try {
  const { rows } = await pool.query(`SELECT id FROM oidc_models WHERE model = 'AccessToken'
    AND payload->>'accountId' = $1 AND expires_at > now() ORDER BY expires_at DESC LIMIT 1`, [email]);
  if (!rows[0]) throw new Error('No current user access token; the executive must connect first.');
  const transport = new StreamableHTTPClientTransport(new URL('/coach/mcp', process.env.PUBLIC_URL), {
    requestInit: { headers: { Authorization: `Bearer ${rows[0].id}` } },
  });
  client = new Client({ name: 'hosted-user-connection-verification', version: '1' });
  await client.connect(transport);
  const tools = (await client.listTools()).tools.map(tool => tool.name);
  const result = await client.callTool({ name: 'get_coach_instructions', arguments: {} });
  if (result.isError) throw new Error('Instruction retrieval failed.');
  const instructions = JSON.parse(result.content[0].text);
  if (instructions.identity.id !== email) throw new Error('Unexpected authenticated identity.');
  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), revision: process.env.BUILD_SHA,
    runtimeUid: process.getuid?.(), email, publicMcpInitialization: true, toolDiscovery: true,
    toolCount: tools.length, authenticatedInstructionRead: true,
    sourceStatus: instructions.sourceConfiguration.status, crmWrites: 0 }));
} finally {
  await client?.close();
  await pool.end();
}
