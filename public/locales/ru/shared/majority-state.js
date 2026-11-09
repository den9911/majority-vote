// Numeric URLs are resolved only through the frozen server map, never display order.
export const validId=id=>typeof id==='string'&&id.length<=48&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id);
export const predictionKey='majority-predictions:v2';
export function resolveQuestion(requested,questions,legacyIds){
  if(requested===null)return questions.find(q=>q.choice===null)?.id??questions[0]?.id??null;
  const id=/^(0|[1-9]\d*)$/.test(requested)?legacyIds[requested]:requested;
  return validId(id)&&questions.some(q=>q.id===id)?id:null;
}
export function readPredictions(input){
  const rows=input&&typeof input==='object'&&!Array.isArray(input)?Object.entries(input):[];
  const valid=rows.filter(([id,row])=>validId(id)&&row&&Number.isSafeInteger(row.revision)&&row.revision>=1&&row.revision<=1000000&&(row.choice===0||row.choice===1)&&Number.isSafeInteger(row.updated)&&row.updated>=0);
  return Object.fromEntries(valid.sort((a,b)=>b[1].updated-a[1].updated).slice(0,200).map(([id,row])=>[id,{revision:row.revision,choice:row.choice,updated:row.updated}]));
}
export function savePrediction(input,id,revision,choice,now=Date.now()){
  return readPredictions({...readPredictions(input),[id]:{revision,choice,updated:now}});
}
export function predictionFor(input,q){
  const row=readPredictions(input)[q.id];
  return row?.revision===(q.answerRevision??q.revision)?row.choice:null;
}
