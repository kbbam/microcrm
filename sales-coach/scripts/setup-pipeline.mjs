// Admin-only native stage setup. Never expose this script as an agent tool.
// Dry-run preserving seeded pursuits: node sales-coach/scripts/setup-pipeline.mjs --env /absolute/isolated.env --url https://isolated.twenty.com --add-missing
// Apply ONLY to a verified isolated workspace: append --apply --isolated.
// Retain nonsecret pre/post proof: append --evidence /absolute/evidence.json.
// Omitting --add-missing replaces stages and therefore requires an empty pursuit workspace.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { TwentyAdapter } from '../twenty.mjs';
import {pipelinePlan,verifyPipeline,pilotStages} from './pipeline-options.mjs';
const args=process.argv.slice(2);
const envPath=args[args.indexOf('--env')+1];
if (!args.includes('--env') || !envPath || !envPath.startsWith('/')) throw new Error('Provide --env /absolute/path/to/isolated.env; no production credential default is provided.');
const apply=args.includes('--apply');
const addMissing=args.includes('--add-missing');
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
const values=pilotStages;
console.log(JSON.stringify({mode:apply?'apply':'dry-run',currentStages:metadata.stages,desiredStages:values,opportunityCount:opportunities.coverage.totalCount??null,compatible:metadata.pipelineCompatible}));
if(metadata.pipelineCompatible){console.log(JSON.stringify({changed:false,reason:'Native pipeline already supports five commercial states.'}));process.exit(0);}
if(!addMissing&&(opportunities.records.length || opportunities.coverage.hasNextPage || opportunities.coverage.totalCount!==0))throw new Error('Replacement setup refuses nonempty workspaces; use reviewed --add-missing to preserve existing stages and records.');
const plan=pipelinePlan(before,{addMissing});
if(!apply){console.log(JSON.stringify({changed:false,addMissing,plannedOptions:plan.options,plannedDefault:plan.defaultValue,nextStep:'For the verified isolated workspace only, rerun with --apply --isolated. Inspect outbound workflows/webhooks separately before enabling coach writes.'}));process.exit(0);}
async function pursuitSnapshot(){
  const snapshot=await adapter.collect('opportunity',{});
  if(!snapshot.complete)throw new Error('Pursuit preservation verification exceeds the 1000-record bound; no setup mutation permitted.');
  const values=snapshot.records.map(r=>({id:r.id,stage:r.stage})).sort((a,b)=>a.id.localeCompare(b.id));
  return {count:values.length,idStageHash:createHash('sha256').update(JSON.stringify(values)).digest('hex')};
}
const snapshotBefore=await pursuitSnapshot();
const fresh=await stageField();
if(fresh.updatedAt!==before.updatedAt || JSON.stringify(fresh.options)!==JSON.stringify(before.options)||JSON.stringify(fresh.defaultValue)!==JSON.stringify(before.defaultValue))throw new Error('Stage metadata changed during review; rerun dry-run.');
const response=await metadataFetch(`${adapter.baseUrl}/metadata`,{method:'POST',headers,signal:AbortSignal.timeout(20000),body:JSON.stringify({query:'mutation SetupCoachPipeline($input:UpdateOneFieldMetadataInput!){updateOneField(input:$input){id name}}',variables:{input:{id:before.id,update:{options:plan.options,defaultValue:plan.defaultValue}}}})});
const result=await safeJson(response);
if(!response.ok||result.errors?.length||!result.data?.updateOneField)throw new Error('Pipeline setup failed or is uncertain; inspect native metadata before retry.');
const after=await adapter.metadata();
if(!after.pipelineCompatible)throw new Error('Pipeline mutation returned, but native GraphQL stage readback is not yet compatible. Inspect the isolated workspace before retry.');
const fieldAfter=await stageField();verifyPipeline(fieldAfter,plan);
const snapshotAfter=await pursuitSnapshot();
if(JSON.stringify(snapshotBefore)!==JSON.stringify(snapshotAfter))throw new Error('Pursuit ID/stage snapshot changed during setup; investigate concurrent changes before continuing.');
const evidence={verifiedAt:new Date().toISOString(),endpoint:adapter.baseUrl,workspaceId:before.workspaceId,mode:addMissing?'add-missing':'replace-empty',before:{options:before.options,defaultValue:before.defaultValue,pursuits:snapshotBefore},after:{options:fieldAfter.options,defaultValue:fieldAfter.defaultValue,pursuits:snapshotAfter},preserved:true};
const evidenceIndex=args.indexOf('--evidence');
if(evidenceIndex>=0){const path=args[evidenceIndex+1];if(!path||!path.startsWith('/'))throw new Error('Evidence output requires an absolute file path.');await writeFile(path,JSON.stringify(evidence,null,2)+'\n',{mode:0o600});}
console.log(JSON.stringify({changed:true,verifiedStages:after.stages}));
