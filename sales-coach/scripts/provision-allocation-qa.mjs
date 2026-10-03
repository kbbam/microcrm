// Developer-only isolated schema/fixture provisioning. No production fallback.
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
const privateRoot=process.env.COACH_QA_CONTROL_ROOT;
if(!privateRoot)throw Error('COACH_QA_CONTROL_ROOT is required');
const vars=JSON.parse(await readFile(privateRoot+'/allocation-vars-private.json','utf8'));
const origin='https://bam-sales-coach-test.twenty.com';
const headers={'Content-Type':'application/json',Authorization:'Bearer '+vars.COACH_TWENTY_API_KEY};
async function query(path,query,variables={}){const r=await fetch(origin+path,{method:'POST',headers,body:JSON.stringify({query,variables})});const b=await r.json();if(!r.ok||b.errors){await writeFile(privateRoot+'/allocation-provision-error.json',JSON.stringify(b),{mode:0o600});throw Error(JSON.stringify({status:r.status,operation:query.match(/\{(\w+)/)?.[1],field:variables.input?.field?.name,errors:b.errors?.map(e=>e.message)}));}return b.data;}
async function objects(){const r=await fetch(origin+'/rest/metadata/objects',{headers});const b=await r.json();if(!r.ok)throw Error('Metadata unavailable');return Array.isArray(b.data)?b.data:b.data.objects;}
let catalogue=await objects();
const ensured=[];
for(const [name,plural,label] of [['initiative','initiatives','Initiative'],['initiativeAccount','initiativeAccounts','Initiative account']]){
 let object=catalogue.find(o=>o.nameSingular===name);
 if(!object){object=(await query('/metadata','mutation($input:CreateOneObjectInput!){createOneObject(input:$input){id nameSingular}}',{input:{object:{nameSingular:name,namePlural:plural,labelSingular:label,labelPlural:label+'s',description:'Isolated mirror for Coach work-allocation QA',icon:'IconBriefcase'}}})).createOneObject;catalogue=await objects();object=catalogue.find(o=>o.id===object.id);ensured.push(name);}
 const specifications=name==='initiative'?[
  {name:'status',label:'Status',type:'SELECT',options:['PLANNING','ACTIVE','PAUSED','COMPLETED'].map((value,position)=>({id:randomUUID(),value,label:value,color:'green',position})),defaultValue:"'PLANNING'"},
  {name:'objective',label:'Objective',type:'TEXT'},
  {name:'manager',label:'Manager',type:'RELATION',target:'workspaceMember'}
 ]:[
  {name:'status',label:'Status',type:'SELECT',options:['INCLUDED','ACTIVE','COMPLETED','REMOVED'].map((value,position)=>({id:randomUUID(),value,label:value,color:'green',position})),defaultValue:"'INCLUDED'"},
  {name:'initiative',label:'Initiative',type:'RELATION',target:'initiative'},
  {name:'company',label:'Company',type:'RELATION',target:'company'},
  {name:'assignee',label:'Assignee',type:'RELATION',target:'workspaceMember'}
 ];
 for(const spec of specifications){if(object.fields.some(f=>f.name===spec.name))continue;const {target,...field}=spec;field.objectMetadataId=object.id;field.isNullable=true;if(target)field.relationCreationPayload={type:'MANY_TO_ONE',targetObjectMetadataId:catalogue.find(o=>o.nameSingular===target).id,targetFieldLabel:name==='initiative'?'Managed initiatives':`QA ${spec.label} programme memberships`,targetFieldIcon:'IconLink'};
  await query('/metadata','mutation($input:CreateOneFieldMetadataInput!){createOneField(input:$input){id name}}',{input:{field}});ensured.push(name+'.'+spec.name);
 }
}
console.log(JSON.stringify({isolatedOrigin:origin,ensured}));
const manifestPath=privateRoot+'/allocation-fixtures.json';let m;
try{m=JSON.parse(await readFile(manifestPath,'utf8'));}catch{m={origin,initiativeId:randomUUID(),companyId:randomUUID(),opportunityId:randomUUID(),membershipId:randomUUID(),taskId:randomUUID(),taskTargetId:randomUUID()};await writeFile(manifestPath,JSON.stringify(m,null,2)+'\n',{mode:0o600});}
const members=(await query('/graphql','{workspaceMembers(first:100){edges{node{id userEmail name{firstName lastName}}}}}')).workspaceMembers.edges.map(e=>e.node);
m.members=members.map(row=>({id:row.id,email:row.userEmail}));await writeFile(manifestPath,JSON.stringify(m,null,2)+'\n',{mode:0o600});
for(const [type,plural,data] of [
 ['Initiative','initiatives',{id:m.initiativeId,name:'QA Coach work-allocation pilot',status:'ACTIVE',objective:'Synthetic allocation only; no outreach'}],
 ['Company','companies',{id:m.companyId,name:'QA Allocation Pharmacy — synthetic',accountOwnerId:null}],
 ['Opportunity','opportunities',{id:m.opportunityId,name:'QA Allocation autumn trial — synthetic',companyId:m.companyId,stage:'ENGAGED',ownerId:null}],
 ['InitiativeAccount','initiativeAccounts',{id:m.membershipId,name:'QA Allocation programme responsibility',initiativeId:m.initiativeId,companyId:m.companyId,status:'INCLUDED',assigneeId:null}],
 ['Task','tasks',{id:m.taskId,title:'QA Allocation summary — synthetic',assigneeId:members[0].id}],
 ['TaskTarget','taskTargets',{id:m.taskTargetId,taskId:m.taskId,targetCompanyId:m.companyId}]
 ]){
 const existing=(await query('/graphql',`query($filter:${type}FilterInput!){${plural}(filter:$filter,first:1){edges{node{id}}}}`,{filter:{id:{eq:data.id}}}))[plural].edges;
 if(!existing.length)await query('/graphql',`mutation($data:${type}CreateInput!){create${type}(data:$data){id}}`,{data});
}
console.log(JSON.stringify({fixtureManifest:manifestPath,members:m.members,initiativeId:m.initiativeId}));
