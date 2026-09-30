import test from 'node:test';
import assert from 'node:assert/strict';
import {pipelinePlan,verifyPipeline,pilotStages} from '../scripts/pipeline-options.mjs';
test('add-missing preserves every existing option property and default, including a seeded pursuit stage',()=>{
  const field={defaultValue:"'NEW'",options:[{id:'legacy-1',value:'NEW',label:'New',position:0,color:'red',extra:{retained:true}},{id:'legacy-2',value:'COMMERCIAL',label:'Original commercial label',position:9,color:'purple'}]};
  const original=structuredClone(field);let i=0;
  const plan=pipelinePlan(field,{addMissing:true,idFactory:()=>`synthetic-${++i}`});
  assert.deepEqual(field,original);assert.deepEqual(plan.options.slice(0,2),original.options);assert.equal(plan.defaultValue,original.defaultValue);
  assert.equal(plan.options.filter(o=>o.value==='COMMERCIAL').length,1);assert.equal(plan.options.length,6);assert.equal(plan.options[2].position,10);
  for(const value of pilotStages)assert.ok(plan.options.some(o=>o.value===value));
  verifyPipeline({options:structuredClone(plan.options),defaultValue:original.defaultValue},plan);
  assert.throws(()=>verifyPipeline({options:plan.options,defaultValue:"'APPROACHING'"},plan),/differs/);
});
test('replacement plan is separate; additive plan idempotently leaves compatible metadata unchanged',()=>{
  const field={defaultValue:"'NEW'",options:[{id:'legacy',value:'NEW',label:'New',position:0,color:'red'}]};
  const replacement=pipelinePlan(field);assert.equal(replacement.options.length,5);assert.equal(replacement.defaultValue,"'APPROACHING'");
  const first=pipelinePlan(field,{addMissing:true});const second=pipelinePlan({options:first.options,defaultValue:first.defaultValue},{addMissing:true});assert.deepEqual(second.options,first.options);assert.equal(second.defaultValue,"'NEW'");
});
