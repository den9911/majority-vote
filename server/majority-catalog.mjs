import active from './majority-questions.json' with {type:'json'};
import legacy from './majority-legacy-v1.json' with {type:'json'};
import {createHash} from 'node:crypto';

export const legacyHash='768996576cc947d65dec7baebb41957638f9819d09c2cc896511104c4b3a39f1';
export const validQuestionId=id=>typeof id==='string' && id.length<=48 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id);
const wording=(value,limit)=>{
  if(typeof value!=='string'||!value.trim()||value.length>limit||/[\u0000-\u001f]/.test(value))throw new Error('Invalid question wording');
  return value.trim();
};
const pair=value=>{
  if(!Array.isArray(value)||value.length!==2)throw new Error('A question needs exactly two options');
  const options=value.map(item=>wording(item,120));
  if(options[0]===options[1])throw new Error('Question options must differ');
  return Object.freeze(options);
};
export function validateCatalog(input){
  if(!Array.isArray(input)||input.length<1||input.length>200)throw new Error('Configure 1–200 majority questions');
  const ids=new Set();
  return Object.freeze(input.map(row=>{
    if(!row||!validQuestionId(row.id)||ids.has(row.id))throw new Error('Question IDs must be unique stable slugs');
    if(!Number.isSafeInteger(row.revision)||row.revision<1||row.revision>1000000)throw new Error('Invalid question revision');
    ids.add(row.id);
    return Object.freeze({id:row.id,revision:row.revision,question:wording(row.question,240),options:pair(row.options),en:Object.freeze({question:wording(row.en?.question,240),options:pair(row.en?.options)})});
  }));
}
if(createHash('sha256').update(JSON.stringify(legacy)).digest('hex')!==legacyHash)throw new Error('The frozen legacy question snapshot changed');
export const legacyQuestions=validateCatalog(legacy);
export const legacyIds=Object.freeze(legacyQuestions.map(q=>q.id));
export const questions=validateCatalog(active);
