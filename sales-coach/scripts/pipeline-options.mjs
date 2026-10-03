import {randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
export const pilotStages=['APPROACHING','ENGAGED','COMMERCIAL','WON','LOST'];
export function pipelinePlan(field,{addMissing=false,idFactory=randomUUID}={}){
  if(!Array.isArray(field.options)||new Set(field.options.map(o=>o.value)).size!==field.options.length)throw new Error('Stage options must have unique values.');
  const original=structuredClone(field.options);
  const options=addMissing?structuredClone(original):[];
  const colors=['gray','blue','purple','green','red'];
  let position=addMissing?Math.max(-1,...original.map(o=>o.position))+1:0;
  for(const [index,value]of pilotStages.entries())if(!options.some(o=>o.value===value))options.push({id:idFactory(),value,label:value[0]+value.slice(1).toLowerCase(),position:position++,color:colors[index]});
  return {options,defaultValue:addMissing?field.defaultValue:"'APPROACHING'",originalOptions:original,originalDefaultValue:field.defaultValue};
}
export function verifyPipeline(field,plan){
  if(!isDeepStrictEqual(field.options,plan.options)||!isDeepStrictEqual(field.defaultValue,plan.defaultValue))throw new Error('Native stage metadata differs from the reviewed plan.');
}
