// Admin-only native stage setup. Never expose this script as an agent tool.
// Dry-run: node sales-coach/scripts/setup-pipeline.mjs --env /absolute/isolated.env --url https://isolated.twenty.com
// Apply ONLY to a new empty isolated workspace: append --apply --isolated.
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { TwentyAdapter } from '../twenty.mjs';
const args=process.argv.slice(2);
const envPath=args[args.indexOf('--env')+1];
if (!args.includes('--env') || !envPath || !envPath.startsWith('/')) throw new Error('Provide --env /absolute/path/to/isolated.env; no production credential default is provided.');
const apply=args.includes('--apply');
if (apply&&!args.includes('--isolated')) throw new Error('--apply requires --isolated attestation of a newly provisioned isolated workspace.');
const text=await readFile(envPath,'utf8');
const env=Object.fromEntries(text.split('\n').filter(l=>l.includes('=')&&!l.trim().startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')).trim(),l.slice(l.indexOf('=')+1).trim()]));
const urlIndex=args.indexOf('--url');
const baseUrl=urlIndex>=0?args[urlIndex+1]:env.TWENTY_API_URL;
if(!baseUrl||baseUrl.startsWith('--'))throw new Error('Provide --url https://your-isolated-workspace.twenty.com or TWENTY_API_URL in the isolated credential file.');
if(!env.TWENTY_API_KEY)throw new Error('Isolated credential file must contain TWENTY_API_KEY.');
let parsedUrl;try{parsedUrl=new URL(baseUrl);}catch{throw new Error('Isolated CRM URL is invalid.');}
if(!['https:','http:'].includes(parsedUrl.protocol)||parsedUrl.username||parsedUrl.password||parsedUrl.search||parsedUrl.hash)throw new Error('Isolated CRM URL must use HTTP(S), with no embedded credential, query, or fragment.');
const adapter=new TwentyAdapter({baseUrl,apiKey:env.TWENTY_API_KEY,scopeMode:'workspace'});
const headers={Authorization:`Bearer ${env.TWENTY_API_KEY}`,'Content-Type':'application/json'};
async function metadataFetch(url,options){
  try{return await fetch(url,options);}catch{throw new Error('Metadata transport unavailable; reconcile setup state before retrying.');}
}
async function safeJson(response){
  try{return await response.json();}catch{throw new Error('Metadata endpoint returned an invalid JSON response.');}
}
async function stageField(){
  const response=await metadataFetch(`${adapter.baseUrl}/rest/metadata/objects`,{headers,signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw new Error(`Metadata read failed (HTTP ${response.status}).`);
  const data=await safeJson(response);
  const stage=data.data?.find(o=>o.nameSingular==='opportunity')?.fields?.find(f=>f.name==='stage');
  if(!stage||stage.type!=='SELECT')throw new Error('Native opportunity.stage SELECT metadata unavailable.');
  return stage;
}
const before=await stageField();
const metadata=await adapter.metadata();
const opportunities=await adapter.read({object:'opportunity',limit:1});
const values=['APPROACHING','ENGAGED','COMMERCIAL','WON','LOST'];
console.log(JSON.stringify({mode:apply?'apply':'dry-run',currentStages:metadata.stages,desiredStages:values,opportunityCount:opportunities.coverage.totalCount??null,compatible:metadata.pipelineCompatible}));
if(metadata.pipelineCompatible){console.log(JSON.stringify({changed:false,reason:'Native pipeline already supports five commercial states.'}));process.exit(0);}
if(opportunities.records.length || opportunities.coverage.hasNextPage || opportunities.coverage.totalCount!==0)throw new Error('Pipeline setup refuses nonempty workspaces; existing pursuit stages require reviewed migration evidence.');
if(!apply){console.log(JSON.stringify({changed:false,nextStep:'For the verified empty isolated workspace only, rerun with --apply --isolated. Inspect outbound workflows/webhooks separately before enabling coach writes.'}));process.exit(0);}
const fresh=await stageField();
if(fresh.updatedAt!==before.updatedAt || JSON.stringify(fresh.options)!==JSON.stringify(before.options))throw new Error('Stage metadata changed during review; rerun dry-run.');
const colors=['gray','blue','purple','green','red'];
const options=values.map((value,position)=>({id:randomUUID(),value,label:value[0]+value.slice(1).toLowerCase(),position,color:colors[position]}));
const response=await metadataFetch(`${adapter.baseUrl}/metadata`,{method:'POST',headers,signal:AbortSignal.timeout(20000),body:JSON.stringify({query:'mutation SetupCoachPipeline($input:UpdateOneFieldMetadataInput!){updateOneField(input:$input){id name}}',variables:{input:{id:before.id,update:{options,defaultValue:"'APPROACHING'"}}}})});
const result=await safeJson(response);
if(!response.ok||result.errors?.length||!result.data?.updateOneField)throw new Error('Pipeline setup failed or is uncertain; inspect native metadata before retry.');
const after=await adapter.metadata();
if(!after.pipelineCompatible)throw new Error('Pipeline mutation returned, but native GraphQL stage readback is not yet compatible. Inspect the isolated workspace before retry.');
console.log(JSON.stringify({changed:true,verifiedStages:after.stages}));
