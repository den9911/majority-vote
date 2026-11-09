import { $, $$, api, escape, action, share, storage } from '/locales/en/shared/ui.js';
import {validId,resolveQuestion,readPredictions,savePrediction,predictionFor,predictionKey} from '/locales/en/shared/majority-state.js';

export async function mount() {
  let data=await load();
  let selected=resolveQuestion(new URLSearchParams(location.search).get('q'),data.questions,data.legacyIds);
  let forecasts=readPredictions(storage.get(predictionKey));
  const hasLegacyForecast=data.legacyIds.some((_,index)=>storage.get(`prediction:${index}`)!==null);
  let legacyNotice=hasLegacyForecast&&!storage.get('majority-legacy-notice-dismissed',false),busy=false;

  async function load(){
    const result=await api('/api/majority');
    if(!Array.isArray(result.legacyIds)||!result.questions?.length||!result.questions.every(q=>validId(q.id)&&Number.isSafeInteger(q.revision)))throw new Error('The server is updating. Reload the page in a minute.');
    return result;
  }
  function navigate(id){selected=id;history.replaceState(null,'',`?q=${encodeURIComponent(id)}`);render();}
  function render(){
    const index=data.questions.findIndex(q=>q.id===selected),q=data.questions[index];
    if(!q){
      $('#app').innerHTML='<div class="narrow panel stack"><h2>This question is no longer available</h2><p>This old link has not been redirected to a different question. Saved answers remain in the server history.</p><button id="restart">Choose an available question</button></div>';
      action($('#restart'),()=>navigate(data.questions[0].id));return;
    }
    const answered=q.choice!==null,total=q.counts.reduce((a,b)=>a+b,0),shown=q.answerSnapshot??q,prediction=predictionFor(forecasts,q);
    const notices=`${legacyNotice?'<div class="note"><p>Old predictions remain on this device but cannot be linked to new IDs: their version cannot be verified. Make a new prediction.</p><button id="dismiss-legacy" class="text-button">Got it</button></div>':''}${data.unassignedLegacy?'<p class="note">Some old answers could not be matched reliably. They remain unchanged and have not been added to other questions.</p>':''}${q.answerSnapshot?'<p class="note">The wording changed. This is the question you answered; your vote is preserved.</p>':''}`;
    $('#app').innerHTML=`<div class="narrow">${notices}<div class="panel question-box" aria-busy="${busy}"><div class="row between"><span class="question-number">QUESTION ${String(index+1).padStart(2,'0')} / ${data.questions.length}</span><span class="pill">${total} answers</span></div><h2>${escape(shown.question)}</h2>${!answered?`<div class="stack"><p class="small muted">Predict the crowd’s choice, then give your own answer.</p><div class="row tabs">${shown.options.map((option,i)=>`<button class="prediction secondary" data-index="${i}" aria-pressed="${prediction===i}">${escape(option)}</button>`).join('')}</div><div class="divider"></div><p class="small muted">And your choice?</p><div class="choice-grid">${shown.options.map((option,i)=>`<button class="choice" data-index="${i}">${escape(option)}</button>`).join('')}</div></div>`:`<div class="stack"><p class="note">${q.counts[0]===q.counts[1]?'It is a tie for now.':Number(q.choice)===(q.counts[0]>q.counts[1]?0:1)?'You are with the majority.':'You have a mind of your own.'}${prediction!==null?` ${q.counts[0]===q.counts[1]?'':prediction===(q.counts[0]>q.counts[1]?0:1)?'Your prediction was right!':'The crowd surprised you.'}`:''}</p><div>${shown.options.map((option,i)=>`<div class="result-line"><div class="row"><span>${escape(option)} ${Number(q.choice)===i?'✓':''}</span><strong>${total?Math.round(q.counts[i]/total*100):0}%</strong></div><progress max="${Math.max(1,total)}" value="${q.counts[i]}" aria-label="${escape(option)}"></progress></div>`).join('')}</div><button class="secondary" id="share">Ask your friends ↗</button></div>`}<div class="row between question-footer"><button id="prev" class="text-button" ${index===0?'disabled':''}>← Previous</button><button id="next" class="text-button">${index===data.questions.length-1?'Back to the first':'Next'} →</button></div></div><p class="small muted section-gap">Real visitor answers only. Your vote is saved for this browser.</p></div>`;
    $$('.prediction').forEach(button=>action(button,()=>{
      forecasts=savePrediction(forecasts,q.id,q.revision,Number(button.dataset.index));storage.set(predictionKey,forecasts);render();
    }));
    $$('.choice').forEach(button=>action(button,async()=>{
      if(busy)return;
      const choice=Number(button.dataset.index);busy=true;render();
      try{
        await api('/api/majority',{id:q.id,revision:q.revision,choice});
        data=await load();
      }catch(error){
        // A missing response is not proof of failure. Read the committed state; never submit another vote automatically.
        try{data=await load();}catch{throw new Error('Your answer is unconfirmed. Check your connection, refresh the page, then retry the same choice.');}
        if(data.questions.find(row=>row.id===q.id)?.choice!==String(choice))throw error;
      }finally{busy=false;render();}
    }));
    action($('#prev'),()=>navigate(data.questions[index-1].id));
    action($('#next'),()=>navigate(data.questions[(index+1)%data.questions.length].id));
    if($('#share'))action($('#share'),()=>share(`${location.origin}/majority/?q=${q.id}`,'Majority Vote',shown.question));
    if($('#dismiss-legacy'))action($('#dismiss-legacy'),()=>{legacyNotice=false;storage.set('majority-legacy-notice-dismissed',true);render();});
    if(busy)$$('button',$('#app')).forEach(button=>button.disabled=true);
  }
  render();
}
